import type { RectangleShape, EllipseShape } from '../types.js'

// Pure geometry — same formulas frontend SVGEllipse.tsx and backend
// ExportService both need. Kept here so the two can't drift apart the way
// they briefly did on text padding.

export interface EllipseGeometry {
  cx: number
  cy: number
  rx: number
  ry: number
}

export function getEllipseGeometry(shape: EllipseShape): EllipseGeometry {
  return {
    cx: shape.x + shape.width / 2,
    cy: shape.y + shape.height / 2,
    rx: shape.width / 2,
    ry: shape.height / 2,
  }
}

// Trivial today (just the cornerRadius fallback) but kept alongside
// getEllipseGeometry so both shape geometries live in one place.
export function getRectangleCornerRadius(shape: RectangleShape): number {
  return shape.cornerRadius ?? 0
}
