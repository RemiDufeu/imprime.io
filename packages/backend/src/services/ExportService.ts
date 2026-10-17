import React from 'react'
import { Document, Page as PDFPage, View, Text as PDFText, Image, Svg, Rect, Ellipse, Path, renderToBuffer } from '@react-pdf/renderer'
import type {
  Template,
  Page,
  PageSize,
  Shape,
  BaseShape,
  RectangleShape,
  EllipseShape,
  TextBoxShape,
  ImageShape,
  CustomText,
  Paragraph,
  ListStyle,
  ListMarker,
  TextFormatting,
  VariableValueType,
  VariableItemField,
  ResolveContext,
  FontCatalog,
  DataUrlImage,
  ExportDTO
} from '@imprime/common'
import {
  getDashArray,
  resolveShapes,
  resolveVariable,
  isEmptyVariableValue,
  exceedsMaxLength,
  exceedsMaxItems,
  findItemFieldIssue,
  stringifyVariableValue,
  getEllipseGeometry,
  getBoxPaths,
  getBorderOverhang,
  getImageLayout,
  getImageCornerRadius,
  getImageOpacity,
  toImageDataUrl,
  getParagraphStyle,
  getRunTextStyle,
  resolveFontFace,
  createFontCatalog,
  getVerticalJustify,
  getListStyle,
  getListMarkers,
  getListMarkerFormatting,
  getListLayout,
  getBulletBox,
  getRotation,
  getRotatedBounds,
  PARAGRAPH_SPACING
} from '@imprime/common'
import { readImageDataUrl, type ImageService } from './ImageService.js'
import { dataUrlForReactPdf } from './pdfJpeg.js'
import type { FontService } from './FontService.js'
import { AppError, ValidationError } from './errors.js'
import { isImportedFontRegistered, registerBuiltinFonts, registerImportedFonts } from '../config/fonts.js'
import type { Style } from '@react-pdf/types'

registerBuiltinFonts()

export interface RenderOptions {
  variableValues?: Record<string, VariableValueType>
}

export interface ExportResult {
  pdf: Buffer
  warnings: ExportDTO.Warning[]
}

// What one export fetched before drawing: images — by image id for an
// uploaded one, by the data URL itself for an image variable's value — and the
// fonts its runs can resolve to.
interface RenderAssets {
  images: Map<string, DataUrlImage>
  fonts: FontCatalog
}

// A render holds the CPU, and the timeout cannot stop one: it only stops
// waiting for it. How many run at once is capped, overall and per user, so
// that one account — through the API or MCP — cannot starve the others.
const MAX_RENDERS = 4
const MAX_RENDERS_PER_OWNER = 2

export class ExportService {
  private renders = 0
  private rendersByOwner = new Map<string, number>()

  constructor(private imageService: ImageService, private fontService: FontService) { }

  /** Takes a render slot for `ownerId`, or refuses with 429; returns its release. */
  private acquireRenderSlot(ownerId: string): () => void {
    const own = this.rendersByOwner.get(ownerId) ?? 0
    if (this.renders >= MAX_RENDERS || own >= MAX_RENDERS_PER_OWNER) {
      throw new AppError('Too many PDF exports in progress: try again in a moment', 429, 'EXPORT_BUSY')
    }
    this.renders++
    this.rendersByOwner.set(ownerId, own + 1)
    let released = false
    return () => {
      if (released) return
      released = true
      this.renders--
      const left = (this.rendersByOwner.get(ownerId) ?? 1) - 1
      if (left > 0) this.rendersByOwner.set(ownerId, left)
      else this.rendersByOwner.delete(ownerId)
    }
  }

  /**
   * Required variables, and the required fields of a list's items, must have a
   * value; a string, no more characters than its variable's or field's max
   * length; a list, no more items than its variable's or field's max items;
   * and every image a value holds — an
   * image variable's, or an image field's of a list's items, nested lists
   * included — must be one the export can draw. The error names the value, as
   * the caller wrote it: `photos[2].file`. An empty one is left to the
   * variable's default, or to an empty box.
   *
   * Returns the images read, by value: the resolved boxes hold the same
   * strings (`resolvedImage`), so they are not read twice.
   */
  private validateVariables(
    template: Template,
    variableValues: Record<string, VariableValueType>
  ): Map<string, DataUrlImage> {
    const requiredVariables = template.variableData?.filter(v => v.required) || []

    for (const variable of requiredVariables) {
      if (isEmptyVariableValue(variableValues[variable.name])) {
        throw new ValidationError(`Required variable "${variable.name}" is missing`, 'REQUIRED_VARIABLE_MISSING')
      }
    }

    const tooLong = (label: string, maxLength: number | undefined) => new ValidationError(
      `Variable "${label}" is longer than its max length of ${maxLength} characters`,
      'VARIABLE_TOO_LONG'
    )
    const tooMany = (label: string, maxItems: number | undefined) => new ValidationError(
      `Variable "${label}" has more than its max of ${maxItems} items`,
      'VARIABLE_TOO_MANY_ITEMS'
    )

    const images = new Map<string, DataUrlImage>()
    const checkImage = (value: unknown, label: string) => {
      if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return
      if (typeof value === 'string' && images.has(value)) return
      const image = typeof value === 'string' ? readImageDataUrl(value) : undefined
      if (!image || typeof value !== 'string') {
        throw new ValidationError(`Variable "${label}" is not a PNG or JPEG data URL`, 'INVALID_IMAGE_VALUE')
      }
      images.set(value, image)
    }
    const checkItems = (items: unknown, fields: VariableItemField[] | undefined, label: string) => {
      if (!Array.isArray(items)) return
      items.forEach((item: unknown, index) => {
        if (item === null || typeof item !== 'object') return
        for (const field of fields ?? []) {
          // Own properties only: a field named like an Object.prototype member
          // must not read the prototype's.
          const value: unknown = Object.hasOwn(item, field.name) ? Reflect.get(item, field.name) : undefined
          const path = `${label}[${index}].${field.name}`
          if (field.type === 'image') checkImage(value, path)
          else if (field.type === 'object-list') checkItems(value, field.itemFields, path)
        }
      })
    }
    for (const variable of template.variableData ?? []) {
      const value = variableValues[variable.name]
      if (exceedsMaxLength(variable, value)) throw tooLong(variable.name, variable.maxLength)
      if (exceedsMaxItems(variable, value)) throw tooMany(variable.name, variable.maxItems)
      if (variable.type === 'image') checkImage(value, variable.name)
      else if (variable.type === 'object-list') {
        const issue = findItemFieldIssue(value, variable.itemFields, variable.name)
        if (issue?.problem === 'missing') {
          throw new ValidationError(`Required variable "${issue.path}" is missing`, 'REQUIRED_VARIABLE_MISSING')
        }
        if (issue?.problem === 'too-long') throw tooLong(issue.path, issue.field.maxLength)
        if (issue?.problem === 'too-many') throw tooMany(issue.path, issue.field.maxItems)
        checkItems(value, variable.itemFields, variable.name)
      }
    }
    return images
  }

  /**
   * Every image the resolved boxes draw, `variableImages` (already read by
   * `validateVariables`) included. An image variable's value that was not
   * checked there — a default, or a string variable bound to a box through
   * the API — is read now, and fails the export the same way.
   *
   * Only `ownerId`'s uploaded images: a shape's image id is anyone's to write,
   * and an export must not draw someone else's. One not found is left out.
   */
  private async fetchImageData(
    resolvedPages: Page[],
    ownerId: string,
    variableImages: Map<string, DataUrlImage>
  ): Promise<Map<string, DataUrlImage>> {
    const imageIds = new Set<string>()
    const imageDataMap = new Map(variableImages)

    for (const page of resolvedPages) {
      for (const shape of page.shapes) {
        if (shape.type !== 'image') continue
        const value = shape.resolvedImage
        if (value !== undefined) {
          if (imageDataMap.has(value)) continue
          const image = readImageDataUrl(value)
          if (!image) {
            throw new ValidationError(
              'An image variable holds something that is not a PNG or JPEG data URL',
              'INVALID_IMAGE_VALUE'
            )
          }
          imageDataMap.set(value, image)
        } else if (shape.imageId) {
          imageIds.add(shape.imageId)
        }
      }
    }

    if (imageIds.size === 0) {
      return imageDataMap
    }

    const imagePromises = Array.from(imageIds).map(async (imageId) => {
      try {
        const image = await this.imageService.getById(imageId, ownerId)
        const dataUrl = toImageDataUrl(image.data, image.mimeType)
        return { imageId, asset: { dataUrl, width: image.width, height: image.height } }
      } catch (error) {
        console.error(`Error fetching image ${imageId}:`, error)
        return null
      }
    })

    const results = await Promise.all(imagePromises)

    for (const result of results) {
      if (result) {
        imageDataMap.set(result.imageId, result.asset)
      }
    }

    return imageDataMap
  }

  /**
   * Registers the imported fonts that the runs ask for, and returns the
   * catalog they resolve against. A family that is not imported (or no longer
   * is) is left out and drawn in the default font, as the editor draws it.
   */
  private async loadFonts(resolvedPages: Page[]): Promise<FontCatalog> {
    const families = new Set<string>()
    for (const page of resolvedPages) {
      for (const shape of page.shapes) {
        if (shape.type !== 'text') continue
        for (const paragraph of shape.paragraphes) {
          for (const run of paragraph.children) {
            if (run.fontFamily) families.add(run.fontFamily)
          }
        }
      }
    }

    const imported = await this.fontService.getForExport([...families], isImportedFontRegistered)
    return createFontCatalog(registerImportedFonts(imported))
  }

  /**
   * Wrap one vector shape in its own absolutely-positioned `Svg` layer, clipped
   * to the page. `draw` receives the layer's origin so it can express the shape
   * in layer-local coordinates. `overhang` is how far the stroke reaches
   * outside the shape's box: half its width, unless the shape says otherwise.
   *
   * A turned shape's layer is its whole box and stroke, not clamped to the
   * page, turned about its centre — the layer's own, as the overhang is the
   * same on every side. Clamped, the cut-off part would turn with it.
   */
  private renderInSvgLayer(
    shape: BaseShape,
    pageSize: PageSize,
    draw: (origin: { left: number; top: number }) => React.ReactElement | React.ReactElement[],
    overhang = (shape.strokeWidth || 0) / 2
  ): React.ReactElement {
    if (getRotation(shape) !== 0) {
      const left = shape.x - overhang
      const top = shape.y - overhang
      return React.createElement(Svg, {
        key: shape.id,
        fixed: true,
        style: {
          position: 'absolute',
          left,
          top,
          width: shape.width + 2 * overhang,
          height: shape.height + 2 * overhang,
          ...this.rotationStyle(shape),
        }
      }, draw({ left, top }))
    }

    const left = Math.max(0, shape.x - overhang)
    const top = Math.max(0, shape.y - overhang)
    const width = Math.max(0, Math.min(pageSize.width, shape.x + shape.width + overhang) - left)
    const height = Math.max(0, Math.min(pageSize.height, shape.y + shape.height + overhang) - top)

    if (width <= 0 || height <= 0) {
      return React.createElement(View, { key: shape.id })
    }

    // `fixed`, as a text box's: a layer clamped to the page bottom can end a
    // hair past it in react-pdf's float32 layout, and a non-fixed Svg that
    // does not fit is moved to a next page — where its absolute position puts
    // it past the bottom again, forever, blocking the event loop.
    return React.createElement(Svg, {
      key: shape.id,
      fixed: true,
      style: { position: 'absolute', left, top, width, height }
    }, draw({ left, top }))
  }

  // A turned shape's node turns about the centre of its box: react-pdf's
  // default transform origin. An unturned one gets no transform at all.
  private rotationStyle(shape: BaseShape): Style {
    const rotation = getRotation(shape)
    return rotation === 0 ? {} : { transform: `rotate(${rotation}deg)` }
  }

  // A rectangle — or a group's own box, which `resolveShapes` emits as one:
  // the fill under its outline, then the border, side by side when the sides
  // differ. The paths are `getBoxPaths`', as the editor's.
  private renderRectangle(shape: RectangleShape, pageSize: PageSize): React.ReactElement {
    const fill = this.parseColor(shape.fill, 'none')
    const stroke = this.parseColor(shape.stroke, 'none')
    const dash = getDashArray(shape.strokeStyle)

    return this.renderInSvgLayer(shape, pageSize, ({ left, top }) => {
      const paths = getBoxPaths(
        { x: shape.x - left, y: shape.y - top, width: shape.width, height: shape.height },
        shape
      )
      const elements = [
        React.createElement(Path, { key: 'fill', d: paths.fill, fill: fill.color, fillOpacity: fill.opacity }),
      ]
      if (stroke.color === 'none') return elements
      paths.strokes.forEach((path, i) => elements.push(React.createElement(Path, {
        key: `stroke-${i}`,
        d: path.d,
        fill: 'none',
        stroke: stroke.color,
        strokeOpacity: stroke.opacity,
        strokeWidth: path.width,
        strokeDasharray: dash
      })))
      return elements
    }, getBorderOverhang(shape))
  }

  private renderEllipse(shape: EllipseShape, pageSize: PageSize): React.ReactElement {
    const fill = this.parseColor(shape.fill, 'none')
    const stroke = this.parseColor(shape.stroke, 'none')
    const geometry = getEllipseGeometry(shape)

    return this.renderInSvgLayer(shape, pageSize, ({ left, top }) =>
      React.createElement(Ellipse, {
        cx: geometry.cx - left,
        cy: geometry.cy - top,
        rx: geometry.rx,
        ry: geometry.ry,
        fill: fill.color,
        fillOpacity: fill.opacity,
        stroke: stroke.color,
        strokeOpacity: stroke.opacity,
        strokeWidth: shape.strokeWidth || 0,
        strokeDasharray: getDashArray(shape.strokeStyle)
      })
    )
  }

  /**
   * Style of one text run. Literal text and variable runs carry the same
   * `TextFormatting` props, so both go through here.
   *
   * `lineHeight` is the enclosing paragraph's and must be set on every run:
   * react-pdf multiplies a unitless line height by the font size of the element
   * that declares it and passes the product down, so a run left to inherit the
   * paragraph's would get a height computed from the default font size.
   */
  private inlineTextStyle(node: TextFormatting, lineHeight: number, fonts: FontCatalog): Style {
    const color = this.parseColor(node.color, '#000000')

    return {
      ...getRunTextStyle(node, fonts),
      color: color.color,
      opacity: color.opacity,
      lineHeight,
    }
  }

  /**
   * A list item: a box padded to the item's text indent, holding the text and,
   * absolutely positioned in that padding, the marker — the geometry
   * `getListLayout` describes, which the editor builds the same way.
   */
  private renderListItem(
    key: number,
    paragraph: Paragraph,
    style: ListStyle,
    marker: ListMarker,
    marginBottom: number,
    text: React.ReactElement,
    fonts: FontCatalog
  ): React.ReactElement {
    const layout = getListLayout(paragraph, style)
    const formatting = getListMarkerFormatting(paragraph)
    const color = this.parseColor(formatting.color, '#000000')

    let markerElement: React.ReactElement
    if (marker.kind === 'bullet') {
      const bullet = getBulletBox(marker.shape, layout)
      markerElement = React.createElement(View, {
        key: 'marker',
        fixed: true,
        style: {
          position: 'absolute',
          left: bullet.left,
          top: bullet.top,
          width: bullet.size,
          height: bullet.size,
          borderRadius: bullet.borderRadius,
          borderWidth: bullet.borderWidth,
          borderColor: color.color,
          backgroundColor: bullet.filled ? color.color : undefined,
          opacity: color.opacity,
        }
      })
    } else {
      markerElement = React.createElement(PDFText, {
        key: 'marker',
        fixed: true,
        style: {
          position: 'absolute',
          left: layout.markerLeft,
          top: 0,
          ...resolveFontFace(formatting, fonts),
          fontSize: layout.fontSize,
          lineHeight: layout.lineHeight,
          color: color.color,
          opacity: color.opacity,
        }
      }, marker.text)
    }

    return React.createElement(View, {
      key,
      fixed: true,
      style: { paddingLeft: layout.textIndent, marginBottom }
    }, [text, markerElement])
  }

  private renderTextBox(shape: TextBoxShape, ctx: ResolveContext, fonts: FontCatalog): React.ReactElement {
    const markers = getListMarkers(shape.paragraphes)

    const paragraphElements = shape.paragraphes.map((paragraph, pIndex) => {
      const paragraphStyle = getParagraphStyle(paragraph)

      const textSegments = paragraph.children.map((child, cIndex) => {
        const content = 'type' in child && child.type === 'variable'
          ? stringifyVariableValue(resolveVariable(child.variableId, ctx))
          : (child as CustomText).text

        return React.createElement(PDFText, {
          key: `${pIndex}-${cIndex}`,
          fixed: true,
          style: this.inlineTextStyle(child, paragraphStyle.lineHeight, fonts)
        }, content)
      })

      const marginBottom = pIndex < shape.paragraphes.length - 1 ? PARAGRAPH_SPACING : 0
      const listStyle = getListStyle(paragraph)
      const marker = markers[pIndex]

      if (!listStyle || !marker) {
        return React.createElement(PDFText, {
          key: pIndex,
          fixed: true,
          style: { marginBottom, ...paragraphStyle }
        }, textSegments)
      }

      const text = React.createElement(PDFText, {
        key: 'text',
        fixed: true,
        style: { ...paragraphStyle }
      }, textSegments)

      return this.renderListItem(pIndex, paragraph, listStyle, marker, marginBottom, text, fonts)
    })

    // The outer View is the box and places the text vertically; the inner one
    // holds the text. The inner View is absolute and has no height on purpose:
    // react-pdf truncates (with an ellipsis) any text taller than the height it
    // is measured against, whereas an absolute child is measured unconstrained
    // and still positioned by the parent's `justifyContent`. Text taller than
    // the box therefore overflows it, as the editor's flex column does.
    return React.createElement(View, {
      key: shape.id,
      fixed: true,
      style: {
        position: 'absolute',
        left: shape.x,
        top: shape.y,
        width: shape.width,
        height: shape.height,
        justifyContent: getVerticalJustify(shape.verticalAlign),
        ...this.rotationStyle(shape),
      }
    }, React.createElement(View, {
      fixed: true,
      style: {
        position: 'absolute',
        left: 0,
        width: shape.width,
      }
    }, paragraphElements))
  }

  /**
   * The whole image, stretched to the rect `getImageLayout` gives, inside a
   * View the size of the box that clips it — react-pdf clips the children of
   * an `overflow: hidden` View, rounded by its `borderRadius`. The border is
   * drawn on top, as a rectangle's. An empty box draws its border only.
   */
  private renderImage(shape: ImageShape, pageSize: PageSize, images: Map<string, DataUrlImage>): React.ReactElement {
    const { x, y, width, height, imageId } = shape
    const border = this.renderImageBorder(shape, pageSize)
    // A bound box draws what its variable resolved to, and nothing else.
    const source = shape.imageVariable ? shape.resolvedImage : imageId
    if (!source) return border ?? React.createElement(View, { key: shape.id })

    const image = images.get(source)
    if (!image) {
      console.error(`Image data not found for imageId: ${imageId}`)

      return React.createElement(View, {
        key: shape.id,
        style: {
          position: 'absolute',
          left: x,
          top: y,
          width,
          height,
          backgroundColor: '#f0f0f0',
          border: '2px solid #ff0000',
          justifyContent: 'center',
          alignItems: 'center',
          ...this.rotationStyle(shape),
        }
      },
        React.createElement(PDFText, {
          style: { color: '#ff0000', fontSize: 12 }
        }, `Image not found: ${imageId}`)
      )
    }

    const layout = getImageLayout(shape, image)
    // `fixed`, as a text box's: the image may overflow the page, and an
    // absolutely positioned box must not be reflowed onto a next page.
    // The box turns, and an inner View clips: react-pdf clips a node to its
    // box before turning it, so a View that did both would clip unturned.
    const picture = React.createElement(View, {
      key: border ? 'image' : shape.id,
      fixed: true,
      style: {
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
        ...this.rotationStyle(shape),
      }
    }, React.createElement(View, {
      fixed: true,
      style: {
        position: 'absolute',
        left: 0,
        top: 0,
        width,
        height,
        overflow: 'hidden',
        borderRadius: getImageCornerRadius(shape),
      }
    }, React.createElement(Image, {
      fixed: true,
      src: image.dataUrl,
      style: {
        position: 'absolute',
        left: layout.x - x,
        top: layout.y - y,
        width: layout.width,
        height: layout.height,
        objectFit: 'fill',
        opacity: getImageOpacity(shape),
      }
    })))

    return border ? React.createElement(React.Fragment, { key: shape.id }, picture, border) : picture
  }

  // The box's border, as a rectangle's: centred on the box's edge, its
  // corners rounded as the image is clipped. None without a width or colour.
  private renderImageBorder(shape: ImageShape, pageSize: PageSize): React.ReactElement | null {
    const stroke = this.parseColor(shape.stroke, 'none')
    if (!shape.strokeWidth || stroke.color === 'none') return null
    const cornerRadius = getImageCornerRadius(shape)

    return this.renderInSvgLayer(shape, pageSize, ({ left, top }) =>
      React.createElement(Rect, {
        x: shape.x - left,
        y: shape.y - top,
        width: shape.width,
        height: shape.height,
        fill: 'none',
        rx: cornerRadius,
        ry: cornerRadius,
        stroke: stroke.color,
        strokeOpacity: stroke.opacity,
        strokeWidth: shape.strokeWidth,
        strokeDasharray: getDashArray(shape.strokeStyle)
      })
    )
  }

  // Containers never reach this point: resolveShapes has already flattened the
  // tree into leaves before rendering starts.
  private renderShape(
    shape: Shape,
    pageSize: PageSize,
    assets: RenderAssets,
    ctx: ResolveContext
  ): React.ReactElement {
    switch (shape.type) {
      case 'rectangle':
        return this.renderRectangle(shape, pageSize)
      case 'ellipse':
        return this.renderEllipse(shape, pageSize)
      case 'text':
        return this.renderTextBox(shape, ctx, assets.fonts)
      case 'image':
        return this.renderImage(shape, pageSize, assets.images)
      default:
        return React.createElement(View, {})
    }
  }

  private renderPage(
    page: Page,
    pageSize: PageSize,
    assets: RenderAssets,
    ctx: ResolveContext
  ): React.ReactElement {
    const shapes = page.shapes.map(shape => this.renderShape(shape, pageSize, assets, ctx))

    return React.createElement(PDFPage, {
      key: page._id,
      size: {
        width: pageSize.width,
        height: pageSize.height
      },
      style: {
        position: 'relative',
        backgroundColor: '#ffffff'
      }
    }, shapes)
  }

  /** `ownerId` owns the template: only their images are drawn. */
  /**
   * The PDF, and what the caller should know about it: the content left out
   * because it starts beyond its page — one warning per page concerned.
   */
  public async exportToPDF(template: Template, ownerId: string, options: RenderOptions = {}): Promise<ExportResult> {
    const variableValues = options.variableValues || {}

    const variableImages = this.validateVariables(template, variableValues)

    const ctx: ResolveContext = { variableValues, template }
    const { pageSize } = template
    // A shape starting beyond the page is left out — react-pdf would start a
    // new page for it — and the caller told, since content that grew with its
    // data can land there without anyone placing it so. A turned shape starts
    // where its turned box does.
    const warnings: ExportDTO.Warning[] = []
    const resolvedPages: Page[] = template.pages.map((page, index) => {
      const shapes = resolveShapes(page.shapes, ctx)
      const onPage = shapes.filter(s => {
        const bounds = getRotatedBounds(s)
        return bounds.y < pageSize.height && bounds.x < pageSize.width
      })
      const leftOut = shapes.length - onPage.length
      if (leftOut > 0) {
        warnings.push({
          code: 'CONTENT_OFF_PAGE',
          page: index + 1,
          shapes: leftOut,
          message: `Page ${index + 1}: ${leftOut} shape${leftOut > 1 ? 's' : ''} start beyond the edge of the page and ${leftOut > 1 ? 'are' : 'is'} left out of the PDF.`,
        })
      }
      return { ...page, shapes: onPage }
    })

    const [images, fonts] = await Promise.all([
      this.fetchImageData(resolvedPages, ownerId, variableImages),
      this.loadFonts(resolvedPages),
    ])
    // Once per image, however many boxes draw it: see pdfJpeg.ts.
    for (const [key, image] of images) {
      images.set(key, { ...image, dataUrl: dataUrlForReactPdf(image.dataUrl) })
    }
    const assets: RenderAssets = { images, fonts }
    const pages = resolvedPages.map(page => this.renderPage(page, pageSize, assets, ctx))

    const doc = React.createElement(Document, {}, pages)

    // Held until the render itself ends, not the wait for it.
    const release = this.acquireRenderSlot(ownerId)
    const rendering = renderToBuffer(doc)
    void rendering.then(release, release)

    const TIMEOUT_MS = 30_000
    const pdfBuffer = await Promise.race([
      rendering,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new AppError('PDF generation timed out after 30s', 408)), TIMEOUT_MS)
      )
    ])

    return { pdf: pdfBuffer, warnings }
  }

  // @react-pdf/renderer does not parse 8-digit hex (#RRGGBBAA) or rgba() — alpha
  private parseColor(input: string | undefined | null, fallback = '#000000'): { color: string; opacity: number } {
    if (!input) return { color: fallback, opacity: 1 }
    const value = input.trim()

    if (value === 'none' || value === 'transparent') {
      return { color: 'none', opacity: 0 }
    }

    // #RGB / #RGBA / #RRGGBB / #RRGGBBAA
    if (value.startsWith('#')) {
      const hex = value.slice(1)
      if (hex.length === 4) {
        const r = hex[0], g = hex[1], b = hex[2], a = hex[3]
        return { color: `#${r}${r}${g}${g}${b}${b}`, opacity: parseInt(a + a, 16) / 255 }
      }
      if (hex.length === 8) {
        return { color: `#${hex.slice(0, 6)}`, opacity: parseInt(hex.slice(6, 8), 16) / 255 }
      }
      return { color: value, opacity: 1 }
    }

    // rgba(r,g,b,a) / rgb(r,g,b)
    const rgbaMatch = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i)
    if (rgbaMatch) {
      const [, r, g, b, a] = rgbaMatch
      return { color: `rgb(${r}, ${g}, ${b})`, opacity: a !== undefined ? Math.max(0, Math.min(1, parseFloat(a))) : 1 }
    }

    return { color: value, opacity: 1 }
  }

}
