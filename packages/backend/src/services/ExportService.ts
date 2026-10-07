import React from 'react'
import { Document, Page as PDFPage, View, Text as PDFText, Image, Svg, Rect, Ellipse, renderToBuffer } from '@react-pdf/renderer'
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
  FontCatalog
} from '@imprime/common'
import {
  getDashArray,
  resolveShapes,
  resolveVariable,
  isEmptyVariableValue,
  stringifyVariableValue,
  getEllipseGeometry,
  getRectangleCornerRadius,
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

// An image as the export draws it: its data URL, and the natural size that
// lays it out in its box.
interface ImageAsset {
  dataUrl: string
  width: number
  height: number
}

// What one export fetched before drawing: images — by image id for an
// uploaded one, by the data URL itself for an image variable's value — and the
// fonts its runs can resolve to.
interface RenderAssets {
  images: Map<string, ImageAsset>
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
   * Required variables must have a value, and every image a value holds — an
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
  ): Map<string, ImageAsset> {
    const requiredVariables = template.variableData?.filter(v => v.required) || []

    for (const variable of requiredVariables) {
      if (isEmptyVariableValue(variableValues[variable.name])) {
        throw new ValidationError(`Required variable "${variable.name}" is missing`)
      }
    }

    const images = new Map<string, ImageAsset>()
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
      if (variable.type === 'image') checkImage(value, variable.name)
      else if (variable.type === 'object-list') checkItems(value, variable.itemFields, variable.name)
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
    variableImages: Map<string, ImageAsset>
  ): Promise<Map<string, ImageAsset>> {
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
   * in layer-local coordinates.
   */
  private renderInSvgLayer(
    shape: BaseShape,
    pageSize: PageSize,
    draw: (origin: { left: number; top: number }) => React.ReactElement
  ): React.ReactElement {
    const sw = shape.strokeWidth || 0
    const left = Math.max(0, shape.x - sw / 2)
    const top = Math.max(0, shape.y - sw / 2)
    const width = Math.max(0, Math.min(pageSize.width, shape.x + shape.width + sw / 2) - left)
    const height = Math.max(0, Math.min(pageSize.height, shape.y + shape.height + sw / 2) - top)

    if (width <= 0 || height <= 0) {
      return React.createElement(View, { key: shape.id })
    }

    return React.createElement(Svg, {
      key: shape.id,
      style: { position: 'absolute', left, top, width, height }
    }, draw({ left, top }))
  }

  private renderRectangle(shape: RectangleShape, pageSize: PageSize): React.ReactElement {
    const fill = this.parseColor(shape.fill, 'none')
    const stroke = this.parseColor(shape.stroke, 'none')
    const cornerRadius = getRectangleCornerRadius(shape)

    return this.renderInSvgLayer(shape, pageSize, ({ left, top }) =>
      React.createElement(Rect, {
        x: shape.x - left,
        y: shape.y - top,
        width: shape.width,
        height: shape.height,
        fill: fill.color,
        fillOpacity: fill.opacity,
        rx: cornerRadius,
        ry: cornerRadius,
        stroke: stroke.color,
        strokeOpacity: stroke.opacity,
        strokeWidth: shape.strokeWidth || 0,
        strokeDasharray: getDashArray(shape.strokeStyle)
      })
    )
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
  private renderImage(shape: ImageShape, pageSize: PageSize, images: Map<string, ImageAsset>): React.ReactElement {
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
          alignItems: 'center'
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
    const picture = React.createElement(View, {
      key: border ? 'image' : shape.id,
      fixed: true,
      style: {
        position: 'absolute',
        left: x,
        top: y,
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
    }))

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
  public async exportToPDF(template: Template, ownerId: string, options: RenderOptions = {}): Promise<Buffer> {
    const variableValues = options.variableValues || {}

    const variableImages = this.validateVariables(template, variableValues)

    const ctx: ResolveContext = { variableValues, template }
    const { pageSize } = template
    const resolvedPages: Page[] = template.pages.map(page => ({
      ...page,
      shapes: resolveShapes(page.shapes, ctx)
        .filter(s => s.y < pageSize.height && s.x < pageSize.width),
    }))

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

    return pdfBuffer
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
