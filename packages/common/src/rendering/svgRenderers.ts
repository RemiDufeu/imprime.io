import type { RectangleShape, EllipseShape, ImageShape } from '../types.js'
import { getDashArray } from './strokeUtils.js'

/**
 * Render a rectangle shape to SVG string
 * Follows frontend SVGRectangle.tsx logic exactly
 */
export function renderRectangleSVG(shape: RectangleShape): string {
  const dashArray = getDashArray(shape.strokeStyle)

  return `<rect
    x="${shape.x}"
    y="${shape.y}"
    width="${shape.width}"
    height="${shape.height}"
    fill="${shape.fill}"
    stroke="${shape.stroke || 'none'}"
    stroke-width="${shape.strokeWidth || 0}"
    ${dashArray ? `stroke-dasharray="${dashArray}"` : ''}
    rx="${shape.cornerRadius || 0}"
    ry="${shape.cornerRadius || 0}"
  />`
}

/**
 * Render an ellipse shape to SVG string
 * Follows frontend SVGEllipse.tsx logic exactly
 */
export function renderEllipseSVG(shape: EllipseShape): string {
  const dashArray = getDashArray(shape.strokeStyle)
  const cx = shape.x + shape.width / 2
  const cy = shape.y + shape.height / 2
  const rx = shape.width / 2
  const ry = shape.height / 2

  return `<ellipse
    cx="${cx}"
    cy="${cy}"
    rx="${rx}"
    ry="${ry}"
    fill="${shape.fill}"
    stroke="${shape.stroke || 'none'}"
    stroke-width="${shape.strokeWidth || 0}"
    ${dashArray ? `stroke-dasharray="${dashArray}"` : ''}
  />`
}

/**
 * Render an image shape to SVG string
 * Follows frontend SVGImage.tsx logic exactly
 * NOTE: Does NOT apply stroke properties (unlike previous backend implementation)
 */
export function renderImageSVG(shape: ImageShape, imageData: string): string {
  return `<image
    href="${imageData}"
    x="${shape.x}"
    y="${shape.y}"
    width="${shape.width}"
    height="${shape.height}"
    preserveAspectRatio="none"
  />`
}
