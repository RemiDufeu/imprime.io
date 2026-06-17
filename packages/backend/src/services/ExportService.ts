import React from 'react'
import { Document, Page, View, Text as PDFText, Image, Svg, Rect, Ellipse, renderToBuffer } from '@react-pdf/renderer'
import type {
  Presentation,
  Slide,
  Shape,
  RectangleShape,
  EllipseShape,
  TextBoxShape,
  ImageShape,
  CustomText,
  VariableElement
} from '@imprime/common'
import { SLIDE_WIDTH, SLIDE_HEIGHT, getDashArray } from '@imprime/common'
import type { ImageService } from './ImageService.js'
import { AppError, ValidationError } from './errors.js'
import { normalizeFontFamily, getFontStyleProps, initializeFonts } from '../config/fonts.js'
import type { Style } from '@react-pdf/types'

// Initialize fonts on module load
initializeFonts()

export interface RenderOptions {
  variableValues?: Record<string, string>
}

export class ExportService {
  constructor(private imageService: ImageService) { }

  private validateVariables(presentation: Presentation, variableValues: Record<string, string>): void {
    const requiredVariables = presentation.variableData?.filter(v => v.required) || []

    for (const variable of requiredVariables) {
      if (!variableValues[variable.name] || variableValues[variable.name].trim() === '') {
        throw new ValidationError(`Required variable "${variable.name}" is missing`)
      }
    }
  }

  private getVariableValue(variableId: string, presentation: Presentation, variableValues: Record<string, string>): string {
    const variablePresentation = presentation.variableData.find(v => v._id == variableId)

    if (!variablePresentation) return ''

    if (variableValues[variablePresentation.name]?.length) {
      return variableValues[variablePresentation.name]
    }

    return variablePresentation?.default || ''
  }

  private async fetchImageData(presentation: Presentation): Promise<Map<string, string>> {
    const imageIds = new Set<string>()

    for (const slide of presentation.slides) {
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

  private renderRectangle(shape: RectangleShape): React.ReactElement {
    const { x, y, width, height, fill, cornerRadius, stroke, strokeWidth, strokeStyle } = shape
    const sw = strokeWidth || 0

    const svgLeft = Math.max(0, x - sw / 2)
    const svgTop = Math.max(0, y - sw / 2)
    const svgRight = Math.min(SLIDE_WIDTH, x + width + sw / 2)
    const svgBottom = Math.min(SLIDE_HEIGHT, y + height + sw / 2)
    const svgWidth = Math.max(0, svgRight - svgLeft)
    const svgHeight = Math.max(0, svgBottom - svgTop)

    if (svgWidth <= 0 || svgHeight <= 0) {
      return React.createElement(View, { key: shape.id })
    }

    return React.createElement(Svg, {
      key: shape.id,
      style: {
        position: 'absolute',
        left: svgLeft,
        top: svgTop,
        width: svgWidth,
        height: svgHeight
      }
    },
      React.createElement(Rect, {
        x: x - svgLeft,
        y: y - svgTop,
        width,
        height,
        fill: this.parseColor(fill, 'none').color,
        fillOpacity: this.parseColor(fill, 'none').opacity,
        rx: cornerRadius || 0,
        ry: cornerRadius || 0,
        stroke: this.parseColor(stroke, 'none').color,
        strokeOpacity: this.parseColor(stroke, 'none').opacity,
        strokeWidth: sw,
        strokeDasharray: getDashArray(strokeStyle)
      })
    )
  }

  private renderEllipse(shape: EllipseShape): React.ReactElement {
    const { x, y, width, height, fill, stroke, strokeWidth, strokeStyle } = shape
    const sw = strokeWidth || 0

    const svgLeft = Math.max(0, x - sw / 2)
    const svgTop = Math.max(0, y - sw / 2)
    const svgRight = Math.min(SLIDE_WIDTH, x + width + sw / 2)
    const svgBottom = Math.min(SLIDE_HEIGHT, y + height + sw / 2)
    const svgWidth = Math.max(0, svgRight - svgLeft)
    const svgHeight = Math.max(0, svgBottom - svgTop)

    if (svgWidth <= 0 || svgHeight <= 0) {
      return React.createElement(View, { key: shape.id })
    }

    return React.createElement(Svg, {
      key: shape.id,
      style: {
        position: 'absolute',
        left: svgLeft,
        top: svgTop,
        width: svgWidth,
        height: svgHeight
      }
    },
      React.createElement(Ellipse, {
        cx: x + width / 2 - svgLeft,
        cy: y + height / 2 - svgTop,
        rx: width / 2,
        ry: height / 2,
        fill: this.parseColor(fill, 'none').color,
        fillOpacity: this.parseColor(fill, 'none').opacity,
        stroke: this.parseColor(stroke, 'none').color,
        strokeOpacity: this.parseColor(stroke, 'none').opacity,
        strokeWidth: sw,
        strokeDasharray: getDashArray(strokeStyle)
      })
    )
  }

  private renderTextBox(
    shape: TextBoxShape,
    presentation: Presentation,
    variableValues: Record<string, string>
  ): React.ReactElement {
    const { x, y, width, paragraphes } = shape

    const renderTextSegment = (child: CustomText | VariableElement, pIndex: number, cIndex: number): React.ReactElement => {
      if ('type' in child && child.type === 'variable') {
        const varElement = child as VariableElement;
        const value = this.getVariableValue(varElement.variableId, presentation, variableValues)
        const fontFamily = normalizeFontFamily(varElement.fontFamily)
        const styleProps = getFontStyleProps(varElement.bold, varElement.italic)

        const varColor = this.parseColor(varElement.color, '#000000')
        return React.createElement(PDFText, {
          key: `${pIndex}-${cIndex}`,
          fixed: true,
          style: {
            fontFamily,
            fontSize: varElement.fontSize ? parseInt(varElement.fontSize) : 16,
            color: varColor.color,
            opacity: varColor.opacity,
            lineHeight: 1.5,
            textDecoration: varElement.underline ? 'underline' : undefined,
            ...styleProps
          } as Style
        }, value)
      } else {
        const textNode = child as CustomText;
        const fontFamily = normalizeFontFamily(textNode.fontFamily)
        const styleProps = getFontStyleProps(textNode.bold, textNode.italic)

        const textColor = this.parseColor(textNode.color, '#000000')
        return React.createElement(PDFText, {
          key: `${pIndex}-${cIndex}`,
          fixed: true,
          style: {
            fontFamily,
            fontSize: textNode.fontSize ? parseInt(textNode.fontSize) : 16,
            color: textColor.color,
            opacity: textColor.opacity,
            lineHeight: 1.5,
            textDecoration: textNode.underline ? 'underline' : undefined,
            ...styleProps
          } as Style
        }, textNode.text)
      }
    }

    const paragraphElements = paragraphes.map((paragraph, pIndex) => {
      const textSegments = paragraph.children.map((child, cIndex) =>
        renderTextSegment(child, pIndex, cIndex)
      )

      return React.createElement(PDFText, {
        key: pIndex,
        fixed: true,
        style: {
          marginBottom: pIndex < paragraphes.length - 1 ? 8 : 0,
          lineHeight: 1.5,
          ...paragraph.style
        }
      }, textSegments)
    })

    return React.createElement(View, {
      key: shape.id,
      fixed: true,
      style: {
        position: 'absolute',
        left: x,
        top: y,
        width,
        padding: 8,
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

  private renderShape(
    shape: Shape,
    imageDataMap: Map<string, string>,
    presentation: Presentation,
    variableValues: Record<string, string>
  ): React.ReactElement {
    switch (shape.type) {
      case 'rectangle':
        return this.renderRectangle(shape)
      case 'ellipse':
        return this.renderEllipse(shape)
      case 'text':
        return this.renderTextBox(shape, presentation, variableValues)
      case 'image':
        return this.renderImage(shape, imageDataMap)
      default: {
        return React.createElement(View, {})
      }
    }
  }

  private renderSlide(
    slide: Slide,
    imageDataMap: Map<string, string>,
    presentation: Presentation,
    variableValues: Record<string, string>
  ): React.ReactElement {
    const shapes = slide.shapes.map(shape =>
      this.renderShape(shape, imageDataMap, presentation, variableValues)
    )

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

    const imageDataMap = await this.fetchImageData(presentation)

    const pages = presentation.slides.map(slide =>
      this.renderSlide(slide, imageDataMap, presentation, variableValues)
    )

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
