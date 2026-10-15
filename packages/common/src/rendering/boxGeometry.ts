import type { BoxStyle, CornerRadii, Sides } from '../types.js'

// The outline and border of a box, as SVG path data both renderers draw as is:
// the editor in `<path>`, the export in react-pdf's `Path`. Corners are cubic
// Béziers rather than arcs, so the two parse nothing differently.

export const ZERO_SIDES: Sides = { top: 0, right: 0, bottom: 0, left: 0 }

export function uniformSides(value: number): Sides {
  return { top: value, right: value, bottom: value, left: value }
}

export function uniformCornerRadii(value: number): CornerRadii {
  return { topLeft: value, topRight: value, bottomRight: value, bottomLeft: value }
}

/** True when the four sides are the same length. */
export function areSidesUniform(sides: Sides): boolean {
  return sides.top === sides.right && sides.top === sides.bottom && sides.top === sides.left
}

/** True when the four corners have the same radius. */
export function areCornersUniform(radii: CornerRadii): boolean {
  return radii.topLeft === radii.topRight
    && radii.topLeft === radii.bottomRight
    && radii.topLeft === radii.bottomLeft
}

// Values written via the API are not validated: anything that is not a
// positive number counts as 0.
function length(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/** A box's padding, sanitised. */
export function getPadding(padding: Sides | undefined): Sides {
  if (!padding) return ZERO_SIDES
  return {
    top: length(padding.top),
    right: length(padding.right),
    bottom: length(padding.bottom),
    left: length(padding.left),
  }
}

/** The width of each side of a box's border: `strokeWidths`, or `strokeWidth` on every side. */
export function getBorderWidths(box: { strokeWidth?: number } & BoxStyle): Sides {
  const widths = box.strokeWidths
  if (!widths) return uniformSides(length(box.strokeWidth))
  return {
    top: length(widths.top),
    right: length(widths.right),
    bottom: length(widths.bottom),
    left: length(widths.left),
  }
}

/** The authored radii, one per corner, before they are fitted to a box. */
export function getCornerRadii(cornerRadius: BoxStyle['cornerRadius']): CornerRadii {
  if (cornerRadius === undefined || typeof cornerRadius === 'number') {
    return uniformCornerRadii(length(cornerRadius))
  }
  return {
    topLeft: length(cornerRadius.topLeft),
    topRight: length(cornerRadius.topRight),
    bottomRight: length(cornerRadius.bottomRight),
    bottomLeft: length(cornerRadius.bottomLeft),
  }
}

// CSS's rule: where two radii on one side add up to more than the side, every
// radius shrinks by the same factor, so the box keeps its shape.
function fitCornerRadii(radii: CornerRadii, width: number, height: number): CornerRadii {
  let factor = 1
  const fit = (side: number, sum: number) => {
    if (sum > 0) factor = Math.min(factor, side / sum)
  }
  fit(width, radii.topLeft + radii.topRight)
  fit(width, radii.bottomLeft + radii.bottomRight)
  fit(height, radii.topLeft + radii.bottomLeft)
  fit(height, radii.topRight + radii.bottomRight)
  if (factor >= 1) return radii
  return {
    topLeft: radii.topLeft * factor,
    topRight: radii.topRight * factor,
    bottomRight: radii.bottomRight * factor,
    bottomLeft: radii.bottomLeft * factor,
  }
}

const round = (value: number) => Math.round(value * 1000) / 1000

interface Point { x: number; y: number }

const point = (cx: number, cy: number, r: number, angle: number): Point => ({
  x: cx + r * Math.cos(angle),
  y: cy + r * Math.sin(angle),
})

// A circular arc of at most a quarter turn, from the current point (at angle
// `from`) to angle `to`, as one cubic Bézier. Angles in the SVG frame, y down:
// increasing angles turn clockwise on screen.
function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const k = (4 / 3) * Math.tan((to - from) / 4)
  const start = point(cx, cy, r, from)
  const end = point(cx, cy, r, to)
  const c1 = { x: start.x - k * r * Math.sin(from), y: start.y + k * r * Math.cos(from) }
  const c2 = { x: end.x + k * r * Math.sin(to), y: end.y - k * r * Math.cos(to) }
  return `C ${round(c1.x)} ${round(c1.y)} ${round(c2.x)} ${round(c2.y)} ${round(end.x)} ${round(end.y)}`
}

const QUARTER = Math.PI / 2

interface Corner {
  cx: number
  cy: number
  r: number
  // Angle where the corner's arc starts, walking the outline clockwise.
  start: number
}

export interface BoxRect {
  x: number
  y: number
  width: number
  height: number
}

// The four corners, clockwise from the top left. A corner whose radius is 0 is
// a point: its centre is the box's corner itself.
function corners(rect: BoxRect, radii: CornerRadii): [Corner, Corner, Corner, Corner] {
  const { x, y, width, height } = rect
  const x1 = x + width
  const y1 = y + height
  return [
    { cx: x + radii.topLeft, cy: y + radii.topLeft, r: radii.topLeft, start: Math.PI },
    { cx: x1 - radii.topRight, cy: y + radii.topRight, r: radii.topRight, start: -QUARTER },
    { cx: x1 - radii.bottomRight, cy: y1 - radii.bottomRight, r: radii.bottomRight, start: 0 },
    { cx: x + radii.bottomLeft, cy: y1 - radii.bottomLeft, r: radii.bottomLeft, start: QUARTER },
  ]
}

function moveTo(p: Point): string {
  return `M ${round(p.x)} ${round(p.y)}`
}

function lineTo(p: Point): string {
  return `L ${round(p.x)} ${round(p.y)}`
}

function outline(rect: BoxRect, radii: CornerRadii): string {
  const parts: string[] = []
  corners(rect, radii).forEach((c, i) => {
    const start = point(c.cx, c.cy, c.r, c.start)
    parts.push(i === 0 ? moveTo(start) : lineTo(start))
    if (c.r > 0) parts.push(arc(c.cx, c.cy, c.r, c.start, c.start + QUARTER))
  })
  parts.push('Z')
  return parts.join(' ')
}

export interface BoxStroke {
  d: string
  width: number
}

export interface BoxPaths {
  // The closed outline: what the fill paints.
  fill: string
  // What the border strokes, centred on the outline as a rectangle's stroke
  // is: one closed path when every side has the same width, otherwise one
  // open path per side drawn. Empty without a border.
  strokes: BoxStroke[]
}

const SIDE_ORDER: (keyof Sides)[] = ['top', 'right', 'bottom', 'left']

/**
 * The paths of a box at `rect`: its outline, and its border side by side.
 *
 * Sides of different widths meet half-way round a rounded corner. A side next
 * to one that is not drawn takes the whole corner, and with square corners a
 * side runs on over its neighbour's half-width, so the corner is filled as a
 * closed stroke's mitre would fill it.
 */
export function getBoxPaths(rect: BoxRect, box: { strokeWidth?: number } & BoxStyle): BoxPaths {
  const width = Math.max(0, rect.width)
  const height = Math.max(0, rect.height)
  const fitted = { ...rect, width, height }
  const radii = fitCornerRadii(getCornerRadii(box.cornerRadius), width, height)
  const fill = outline(fitted, radii)

  const widths = getBorderWidths(box)
  if (areSidesUniform(widths)) {
    return { fill, strokes: widths.top > 0 ? [{ d: fill, width: widths.top }] : [] }
  }

  const all = corners(fitted, radii)
  const strokes: BoxStroke[] = []
  SIDE_ORDER.forEach((side, i) => {
    const sideWidth = widths[side]
    if (sideWidth <= 0) return
    const before = all[i]
    const after = all[(i + 1) % 4]
    const previousWidth = widths[SIDE_ORDER[(i + 3) % 4]]
    const nextWidth = widths[SIDE_ORDER[(i + 1) % 4]]
    // The side's own direction, clockwise: along it, square corners extend.
    const direction = before.start + QUARTER + QUARTER
    const ux = Math.cos(direction)
    const uy = Math.sin(direction)

    const parts: string[] = []
    // Leading corner: the second half of `before`'s arc, or all of it when the
    // previous side is not drawn.
    const arcEnd = before.start + QUARTER
    if (before.r > 0) {
      const from = previousWidth > 0 ? before.start + QUARTER / 2 : before.start
      parts.push(moveTo(point(before.cx, before.cy, before.r, from)))
      parts.push(arc(before.cx, before.cy, before.r, from, arcEnd))
    } else {
      const extend = previousWidth > 0 ? previousWidth / 2 : 0
      parts.push(moveTo({ x: before.cx - ux * extend, y: before.cy - uy * extend }))
    }
    // Straight run to the trailing corner, then its first half.
    const runEnd = point(after.cx, after.cy, after.r, after.start)
    if (after.r > 0) {
      parts.push(lineTo(runEnd))
      const to = nextWidth > 0 ? after.start + QUARTER / 2 : after.start + QUARTER
      parts.push(arc(after.cx, after.cy, after.r, after.start, to))
    } else {
      const extend = nextWidth > 0 ? nextWidth / 2 : 0
      parts.push(lineTo({ x: runEnd.x + ux * extend, y: runEnd.y + uy * extend }))
    }
    strokes.push({ d: parts.join(' '), width: sideWidth })
  })
  return { fill, strokes }
}

/** How far a box's border reaches outside the box: half its widest side. */
export function getBorderOverhang(box: { strokeWidth?: number } & BoxStyle): number {
  const widths = getBorderWidths(box)
  return Math.max(widths.top, widths.right, widths.bottom, widths.left) / 2
}
