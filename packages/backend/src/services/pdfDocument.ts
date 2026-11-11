import React from 'react'
import { Document, Page as PDFPage, View, Text as PDFText, Image, Svg, Rect, Ellipse, Path, renderToBuffer } from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'
import type {
  Page,
  PageSize,
  Shape,
  BaseShape,
  RectangleShape,
  EllipseShape,
  TextBoxShape,
  ImageShape,
  Paragraph,
  ListStyle,
  ListMarker,
  TextFormatting,
  FontCatalog,
  FontDTO,
  FontVariant,
  FontVerticalMetrics,
  RunFontFace,
  ParagraphLeadFace,
  DataUrlImage,
} from '@imprime/common'
import {
  FONT_VARIANTS,
  getDashArray,
  getEllipseGeometry,
  getBoxPaths,
  getBorderOverhang,
  getImageLayout,
  getImageCornerRadius,
  getImageOpacity,
  getParagraphStyle,
  getParagraphLeadFace,
  getHalfLeading,
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
  PARAGRAPH_SPACING,
} from '@imprime/common'
import { dataUrlForReactPdf } from './pdfJpeg.js'
import type { PageImage, RasterOptions } from './pdfRaster.js'
import { loadFaceMetrics, registerBuiltinFonts, registerImportedFonts, registeredImportedFontFamilies } from '../config/fonts.js'

/**
 * The PDF of resolved pages, drawn with @react-pdf/renderer — what a PDF
 * worker thread runs (`pdfWorker.ts`, started by `PdfRenderPool`). Everything
 * it needs comes in the job, as data: it reads no database, and the server's
 * thread never loads react-pdf.
 */

registerBuiltinFonts()

/**
 * What a render is given. It crosses to the worker by structured clone, so it
 * is data only: the resolved pages, the images they draw — by image id for an
 * uploaded one, by the data URL itself for an image variable's value — and the
 * imported fonts their runs ask for, without files for those this worker has
 * registered already (`RenderResult.registeredFonts`). With `raster`, the
 * PDF's pages are drawn as PNG images too, by pdf.js, in the same job.
 */
export interface RenderJob {
  pages: Page[]
  pageSize: PageSize
  images: Map<string, DataUrlImage>
  fonts: ImportedFontFiles[]
  raster?: RasterOptions
}

export interface ImportedFontFiles {
  font: FontDTO.Response
  // A Buffer when sent, a plain Uint8Array once cloned: structured clone keeps
  // the bytes, not the class.
  files: Partial<Record<FontVariant, Uint8Array>> | null
}

// Buffers when sent; plain Uint8Arrays once cloned to the server's thread.
export interface RenderResult {
  pdf: Uint8Array
  // The pages `RenderJob.raster` asked for; none without it.
  images: { page: PageImage['page']; png: Uint8Array }[]
  // Registered family names of every imported font the worker now holds.
  registeredFonts: string[]
}

// What the worker answers a job with.
export type RenderReply = { ok: true; result: RenderResult } | { ok: false; error: string }

// What the worker posts: 'ready' once, when react-pdf is loaded and it takes
// jobs, then a reply per job.
export type WorkerMessage = 'ready' | RenderReply

// What one render drew with: the images, by `RenderJob.images`' keys, the
// fonts its runs can resolve to, and the vertical metrics of each face a line
// is set in, by `faceKey`.
interface RenderAssets {
  images: Map<string, DataUrlImage>
  fonts: FontCatalog
  faceMetrics: ReadonlyMap<string, FontVerticalMetrics>
}

const faceKey = (face: RunFontFace) => `${face.fontFamily}|${face.fontWeight}|${face.fontStyle}`

export async function renderPdf({ pages, pageSize, images, fonts: imported, raster }: RenderJob): Promise<RenderResult> {
  const fonts = await loadFonts(pages, imported)
  // Once per image, however many boxes draw it: see pdfJpeg.ts.
  const drawable = new Map<string, DataUrlImage>()
  for (const [key, image] of images) {
    drawable.set(key, { ...image, dataUrl: dataUrlForReactPdf(image.dataUrl) })
  }
  const assets: RenderAssets = { images: drawable, ...fonts }

  const doc = React.createElement(Document, {}, pages.map(page => renderPage(page, pageSize, assets)))
  const pdf = await renderToBuffer(doc)
  // pdf.js and the canvas are loaded by the first job that wants images, not
  // by every worker: most jobs are a PDF only.
  const pageImages = raster ? await (await import('./pdfRaster.js')).rasterizePdf(pdf, raster) : []
  return { pdf, images: pageImages, registeredFonts: registeredImportedFontFamilies() }
}

// Structured clone hands a Buffer over as a plain Uint8Array: the same bytes,
// without the methods font registration reads them with.
function asBuffers(files: Partial<Record<FontVariant, Uint8Array>>): Partial<Record<FontVariant, Buffer>> {
  const buffers: Partial<Record<FontVariant, Buffer>> = {}
  for (const variant of FONT_VARIANTS) {
    const data = files[variant]
    if (data) buffers[variant] = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  }
  return buffers
}

/**
 * Registers the imported fonts that the runs ask for, and returns the
 * catalog they resolve against. A family that is not imported (or no longer
 * is) is left out and drawn in the default font, as the editor draws it.
 *
 * Then loads the metrics of each face a line is set in: a paragraph's lead
 * face, and a number marker's. `leadingShift` places the glyphs from them.
 */
async function loadFonts(
  pages: Page[],
  imported: readonly ImportedFontFiles[]
): Promise<Pick<RenderAssets, 'fonts' | 'faceMetrics'>> {
  const fonts = createFontCatalog(registerImportedFonts(
    imported.map(({ font, files }) => ({ font, files: files && asBuffers(files) }))
  ))

  const textBoxes = pages.flatMap(page => page.shapes.filter(shape => shape.type === 'text'))
  const faces = new Map<string, RunFontFace>()
  const addFace = (face: RunFontFace) => faces.set(faceKey(face), face)
  for (const shape of textBoxes) {
    const markers = getListMarkers(shape.paragraphes)
    shape.paragraphes.forEach((paragraph, index) => {
      addFace(getParagraphLeadFace(paragraph, fonts))
      if (markers[index]?.kind === 'number') {
        addFace(resolveFontFace(getListMarkerFormatting(paragraph), fonts))
      }
    })
  }

  const faceMetrics = new Map<string, FontVerticalMetrics>()
  await Promise.all([...faces].map(async ([key, face]) => {
    const metrics = await loadFaceMetrics(face)
    if (metrics) faceMetrics.set(key, metrics)
  }))

  return { fonts, faceMetrics }
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
function renderInSvgLayer(
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
        ...rotationStyle(shape),
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
  // it past the bottom again, forever: the render never ends.
  return React.createElement(Svg, {
    key: shape.id,
    fixed: true,
    style: { position: 'absolute', left, top, width, height }
  }, draw({ left, top }))
}

// A turned shape's node turns about the centre of its box: react-pdf's
// default transform origin. An unturned one gets no transform at all.
function rotationStyle(shape: BaseShape): Style {
  const rotation = getRotation(shape)
  return rotation === 0 ? {} : { transform: `rotate(${rotation}deg)` }
}

// A rectangle — or a group's own box, which `resolveShapes` emits as one:
// the fill under its outline, then the border, side by side when the sides
// differ. The paths are `getBoxPaths`', as the editor's.
function renderRectangle(shape: RectangleShape, pageSize: PageSize): React.ReactElement {
  const fill = parseColor(shape.fill, 'none')
  const stroke = parseColor(shape.stroke, 'none')
  const dash = getDashArray(shape.strokeStyle)

  return renderInSvgLayer(shape, pageSize, ({ left, top }) => {
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

function renderEllipse(shape: EllipseShape, pageSize: PageSize): React.ReactElement {
  const fill = parseColor(shape.fill, 'none')
  const stroke = parseColor(shape.stroke, 'none')
  const geometry = getEllipseGeometry(shape)

  return renderInSvgLayer(shape, pageSize, ({ left, top }) =>
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
function inlineTextStyle(node: TextFormatting, lineHeight: number, fonts: FontCatalog): Style {
  const color = parseColor(node.color, '#000000')

  return {
    ...getRunTextStyle(node, fonts),
    color: color.color,
    opacity: color.opacity,
    lineHeight,
  }
}

/**
 * How far down to move text set in `face` so that its glyphs sit in their
 * lines where the editor's do (`getHalfLeading`). Given as `top`: an offset
 * from where the node is laid out, which moves the glyphs and leaves what
 * follows in place. Every face a line is set in had its metrics loaded with
 * the fonts.
 */
function leadingShift(
  face: ParagraphLeadFace,
  lineHeight: number,
  faceMetrics: RenderAssets['faceMetrics']
): number {
  const metrics = faceMetrics.get(faceKey(face))
  return metrics ? getHalfLeading(lineHeight, face.fontSize, metrics) : 0
}

/**
 * A list item: a box padded to the item's text indent, holding the text and,
 * absolutely positioned in that padding, the marker — the geometry
 * `getListLayout` describes, which the editor builds the same way.
 */
function renderListItem(
  key: number,
  paragraph: Paragraph,
  style: ListStyle,
  marker: ListMarker,
  marginBottom: number,
  text: React.ReactElement,
  { fonts, faceMetrics }: RenderAssets
): React.ReactElement {
  const layout = getListLayout(paragraph, style)
  const formatting = getListMarkerFormatting(paragraph)
  const color = parseColor(formatting.color, '#000000')

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
    // A bullet is centred on the first line by geometry; a number is text,
    // placed in that line as its own glyphs are.
    const face = { ...resolveFontFace(formatting, fonts), fontSize: layout.fontSize }
    markerElement = React.createElement(PDFText, {
      key: 'marker',
      fixed: true,
      style: {
        position: 'absolute',
        left: layout.markerLeft,
        top: leadingShift(face, layout.lineHeight, faceMetrics),
        ...face,
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

function renderTextBox(shape: TextBoxShape, assets: RenderAssets): React.ReactElement {
  const { fonts, faceMetrics } = assets
  const markers = getListMarkers(shape.paragraphes)

  const paragraphElements = shape.paragraphes.map((paragraph, pIndex) => {
    const paragraphStyle = getParagraphStyle(paragraph)
    const top = leadingShift(getParagraphLeadFace(paragraph, fonts), paragraphStyle.lineHeight, faceMetrics)

    const textSegments = paragraph.children.map((child, cIndex) => {
      // `resolvePages` has replaced every variable and page number with its
      // text: an element left would be one it does not know, drawn as nothing.
      const content = 'text' in child ? child.text : ''

      return React.createElement(PDFText, {
        key: `${pIndex}-${cIndex}`,
        fixed: true,
        style: inlineTextStyle(child, paragraphStyle.lineHeight, fonts)
      }, content)
    })

    const marginBottom = pIndex < shape.paragraphes.length - 1 ? PARAGRAPH_SPACING : 0
    const listStyle = getListStyle(paragraph)
    const marker = markers[pIndex]

    if (!listStyle || !marker) {
      return React.createElement(PDFText, {
        key: pIndex,
        fixed: true,
        style: { marginBottom, ...paragraphStyle, top }
      }, textSegments)
    }

    // The text only: the item's box, and the bullet in it, stay in place.
    const text = React.createElement(PDFText, {
      key: 'text',
      fixed: true,
      style: { ...paragraphStyle, top }
    }, textSegments)

    return renderListItem(pIndex, paragraph, listStyle, marker, marginBottom, text, assets)
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
      ...rotationStyle(shape),
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
function renderImage(shape: ImageShape, pageSize: PageSize, images: Map<string, DataUrlImage>): React.ReactElement {
  const { x, y, width, height, imageId } = shape
  const border = renderImageBorder(shape, pageSize)
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
        ...rotationStyle(shape),
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
      ...rotationStyle(shape),
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
function renderImageBorder(shape: ImageShape, pageSize: PageSize): React.ReactElement | null {
  const stroke = parseColor(shape.stroke, 'none')
  if (!shape.strokeWidth || stroke.color === 'none') return null
  const cornerRadius = getImageCornerRadius(shape)

  return renderInSvgLayer(shape, pageSize, ({ left, top }) =>
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
function renderShape(
  shape: Shape,
  pageSize: PageSize,
  assets: RenderAssets
): React.ReactElement {
  switch (shape.type) {
    case 'rectangle':
      return renderRectangle(shape, pageSize)
    case 'ellipse':
      return renderEllipse(shape, pageSize)
    case 'text':
      return renderTextBox(shape, assets)
    case 'image':
      return renderImage(shape, pageSize, assets.images)
    default:
      return React.createElement(View, {})
  }
}

function renderPage(
  page: Page,
  pageSize: PageSize,
  assets: RenderAssets
): React.ReactElement {
  const shapes = page.shapes.map(shape => renderShape(shape, pageSize, assets))

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

// @react-pdf/renderer does not parse 8-digit hex (#RRGGBBAA) or rgba() — alpha
function parseColor(input: string | undefined | null, fallback = '#000000'): { color: string; opacity: number } {
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
