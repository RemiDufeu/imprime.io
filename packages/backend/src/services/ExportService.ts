import React from 'react'
import { Document, Page, View, Text as PDFText, Image, Svg, Rect, Ellipse, renderToBuffer } from '@react-pdf/renderer'
import type {
  Presentation,
  Slide,
  Shape,
  BaseShape,
  RectangleShape,
  EllipseShape,
  TextBoxShape,
  ImageShape,
  CustomText,
  TextFormatting,
  VariableValueType,
  ResolveContext
} from '@imprime/common'
import {
  SLIDE_WIDTH,
  SLIDE_HEIGHT,
  getDashArray,
  resolveShapes,
  resolveVariable,
  isEmptyVariableValue,
  stringifyVariableValue,
  getEllipseGeometry,
  getRectangleCornerRadius
} from '@imprime/common'
import type { ImageService } from './ImageService.js'
import { AppError, ValidationError } from './errors.js'
import { normalizeFontFamily, getFontStyleProps, initializeFonts } from '../config/fonts.js'
import type { Style } from '@react-pdf/types'

// Initialize fonts on module load
initializeFonts()

const DEFAULT_FONT_SIZE = 16
const LINE_HEIGHT = 1.5
const PARAGRAPH_SPACING = 8

export interface RenderOptions {
  variableValues?: Record<string, VariableValueType>
}

export class ExportService {
  constructor(private imageService: ImageService) { }

  private validateVariables(presentation: Presentation, variableValues: Record<string, VariableValueType>): void {
    const requiredVariables = presentation.variableData?.filter(v => v.required) || []

    for (const variable of requiredVariables) {
      if (isEmptyVariableValue(variableValues[variable.name])) {
        throw new ValidationError(`Required variable "${variable.name}" is missing`)
      }
    }
  }

  private async fetchImageData(resolvedSlides: Slide[]): Promise<Map<string, string>> {
    const imageIds = new Set<string>()

    for (const slide of resolvedSlides) {
      for (const shape of slide.shapes) {
        if (shape.type === 'image') {
          imageIds.add(shape.imageId)
        }
      }
    }
    const imageDataMap = new Map<string, string>()

    if (imageIds.size === 0) {
      return imageDataMap
    }

    const imagePromises = Array.from(imageIds).map(async (imageId) => {
      try {
        const image = await this.imageService.getById(imageId)
        let cleanData = image.data.replace(/[\s\n\r]/g, '')
        let dataUrl: string
        if (cleanData.startsWith('data:')) {
          dataUrl = cleanData
        } else {
          dataUrl = `data:${image.mimeType};base64,${cleanData}`
        }

        return { imageId, dataUrl }
      } catch (error) {
        console.error(`Error fetching image ${imageId}:`, error)
        return null
      }
    })

    const results = await Promise.all(imagePromises)

    for (const result of results) {
      if (result) {
        imageDataMap.set(result.imageId, result.dataUrl)
      }
    }

    return imageDataMap
  }

  /**
   * Wrap one vector shape in its own absolutely-positioned `Svg` layer, clipped
   * to the page. `draw` receives the layer's origin so it can express the shape
   * in layer-local coordinates.
   */
  private renderInSvgLayer(
    shape: BaseShape,
    draw: (origin: { left: number; top: number }) => React.ReactElement
  ): React.ReactElement {
    const sw = shape.strokeWidth || 0
    const left = Math.max(0, shape.x - sw / 2)
    const top = Math.max(0, shape.y - sw / 2)
    const width = Math.max(0, Math.min(SLIDE_WIDTH, shape.x + shape.width + sw / 2) - left)
    const height = Math.max(0, Math.min(SLIDE_HEIGHT, shape.y + shape.height + sw / 2) - top)

    if (width <= 0 || height <= 0) {
      return React.createElement(View, { key: shape.id })
    }

    return React.createElement(Svg, {
      key: shape.id,
      style: { position: 'absolute', left, top, width, height }
    }, draw({ left, top }))
  }

  private renderRectangle(shape: RectangleShape): React.ReactElement {
    const fill = this.parseColor(shape.fill, 'none')
    const stroke = this.parseColor(shape.stroke, 'none')
    const cornerRadius = getRectangleCornerRadius(shape)

    return this.renderInSvgLayer(shape, ({ left, top }) =>
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

  private renderEllipse(shape: EllipseShape): React.ReactElement {
    const fill = this.parseColor(shape.fill, 'none')
    const stroke = this.parseColor(shape.stroke, 'none')
    const geometry = getEllipseGeometry(shape)

    return this.renderInSvgLayer(shape, ({ left, top }) =>
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
   */
  private inlineTextStyle(node: TextFormatting): Style {
    const color = this.parseColor(node.color, '#000000')

    return {
      fontFamily: normalizeFontFamily(node.fontFamily),
      fontSize: node.fontSize ? parseInt(node.fontSize) : DEFAULT_FONT_SIZE,
      color: color.color,
      opacity: color.opacity,
      lineHeight: LINE_HEIGHT,
      textDecoration: node.underline ? 'underline' : undefined,
      ...getFontStyleProps(node.bold, node.italic)
    } as Style
  }

  private renderTextBox(shape: TextBoxShape, ctx: ResolveContext): React.ReactElement {
    const paragraphElements = shape.paragraphes.map((paragraph, pIndex) => {
      const textSegments = paragraph.children.map((child, cIndex) => {
        const content = 'type' in child && child.type === 'variable'
          ? stringifyVariableValue(resolveVariable(child.variableId, ctx))
          : (child as CustomText).text

        return React.createElement(PDFText, {
          key: `${pIndex}-${cIndex}`,
          fixed: true,
          style: this.inlineTextStyle(child)
        }, content)
      })

      return React.createElement(PDFText, {
        key: pIndex,
        fixed: true,
        style: {
          marginBottom: pIndex < shape.paragraphes.length - 1 ? PARAGRAPH_SPACING : 0,
          lineHeight: LINE_HEIGHT,
          ...paragraph.style
        }
      }, textSegments)
    })

    return React.createElement(View, {
      key: shape.id,
      fixed: true,
      style: {
        position: 'absolute',
        left: shape.x,
        top: shape.y,
        width: shape.width,
      }
    }, paragraphElements)
  }

  private renderImage(shape: ImageShape, imageDataMap: Map<string, string>): React.ReactElement {
    const { x, y, width, height, imageId } = shape
    const imageData = imageDataMap.get(imageId)

    if (!imageData) {
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

    return React.createElement(Image, {
      key: shape.id,
      src: imageData,
      style: {
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
        objectFit: 'fill'
      }
    })
  }

  // Containers never reach this point: resolveShapes has already flattened the
  // tree into leaves before rendering starts.
  private renderShape(
    shape: Shape,
    imageDataMap: Map<string, string>,
    ctx: ResolveContext
  ): React.ReactElement {
    switch (shape.type) {
      case 'rectangle':
        return this.renderRectangle(shape)
      case 'ellipse':
        return this.renderEllipse(shape)
      case 'text':
        return this.renderTextBox(shape, ctx)
      case 'image':
        return this.renderImage(shape, imageDataMap)
      default:
        return React.createElement(View, {})
    }
  }

  private renderSlide(
    slide: Slide,
    imageDataMap: Map<string, string>,
    ctx: ResolveContext
  ): React.ReactElement {
    const shapes = slide.shapes.map(shape => this.renderShape(shape, imageDataMap, ctx))

    return React.createElement(Page, {
      key: slide._id,
      size: {
        width: SLIDE_WIDTH,
        height: SLIDE_HEIGHT
      },
      style: {
        position: 'relative',
        backgroundColor: '#ffffff'
      }
    }, shapes)
  }

  public async exportToPDF(presentation: Presentation, options: RenderOptions = {}): Promise<Buffer> {
    const variableValues = options.variableValues || {}

    this.validateVariables(presentation, variableValues)

    const ctx: ResolveContext = { variableValues, presentation }
    const resolvedSlides: Slide[] = presentation.slides.map(slide => ({
      ...slide,
      shapes: resolveShapes(slide.shapes, ctx)
        .filter(s => s.y < SLIDE_HEIGHT && s.x < SLIDE_WIDTH),
    }))

    const imageDataMap = await this.fetchImageData(resolvedSlides)
    const pages = resolvedSlides.map(slide => this.renderSlide(slide, imageDataMap, ctx))

    const doc = React.createElement(Document, {}, pages)

    const TIMEOUT_MS = 30_000
    const pdfBuffer = await Promise.race([
      renderToBuffer(doc),
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
