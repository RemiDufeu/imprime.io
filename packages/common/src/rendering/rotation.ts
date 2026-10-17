import type { BaseShape } from '../types.js'

// Geometry of a shape's rotation — one definition for the editor, which turns
// an SVG group, and the export, which turns a react-pdf layer and composes a
// group's rotation into the leaves `resolveShapes` emits.
//
// A shape turns about the centre of its box, clockwise, by `rotation`
// degrees; its x, y, width and height stay those of the unrotated box.

export interface Point {
  x: number
  y: number
}

// A box that may be turned: any shape, or a rect the editor is dragging.
export interface TurnedBox {
  x: number
  y: number
  width: number
  height: number
  rotation?: number
}

// Where a shape's coordinates are drawn on the page: turned by `rotation`
// degrees about their origin, then shifted by (x, y) — SVG's
// `translate(x y) rotate(rotation)`. Root shapes are drawn in `PAGE_FRAME`; a
// group's children in the frame `getContentFrame` gives.
export interface Frame {
  x: number
  y: number
  rotation: number
}

export const PAGE_FRAME: Frame = { x: 0, y: 0, rotation: 0 }

const ORIGIN: Point = { x: 0, y: 0 }

/** `degrees` as the same turn in (-180, 180]; 0 when it is not a finite number. */
export function normalizeRotation(degrees: unknown): number {
  if (typeof degrees !== 'number' || !Number.isFinite(degrees)) return 0
  let turn = degrees % 360
  if (turn > 180) turn -= 360
  else if (turn <= -180) turn += 360
  // No -0: it would print as "-0°".
  return turn === 0 ? 0 : turn
}

/** A shape's rotation, sanitised — the API can write anything there. */
export function getRotation(shape: Pick<BaseShape, 'rotation'>): number {
  return normalizeRotation(shape.rotation)
}

export function getCenter(box: TurnedBox): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** `point` turned clockwise by `degrees` about `center`. Exact for 0. */
export function rotatePoint(point: Point, center: Point, degrees: number): Point {
  if (degrees === 0) return point
  const radians = (degrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const dx = point.x - center.x
  const dy = point.y - center.y
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos }
}

/** A vector — a pointer's move — turned clockwise by `degrees`. */
export function rotateVector(vector: Point, degrees: number): Point {
  return rotatePoint(vector, ORIGIN, degrees)
}

/** Where `point`, in `frame`'s coordinates, is on the page. */
export function pointToPage(frame: Frame, point: Point): Point {
  const turned = rotateVector(point, frame.rotation)
  return { x: turned.x + frame.x, y: turned.y + frame.y }
}

/** Where `point`, on the page, is in `frame`'s coordinates. */
export function pointFromPage(frame: Frame, point: Point): Point {
  return rotateVector({ x: point.x - frame.x, y: point.y - frame.y }, -frame.rotation)
}

/**
 * The frame a group's children are drawn in, the group lying in `frame`: its
 * own top-left corner, turned with it, is their origin.
 */
export function getContentFrame(frame: Frame, group: TurnedBox): Frame {
  const rotation = normalizeRotation(group.rotation)
  const corner = rotatePoint({ x: group.x, y: group.y }, getCenter(group), rotation)
  const origin = pointToPage(frame, corner)
  return { x: origin.x, y: origin.y, rotation: normalizeRotation(frame.rotation + rotation) }
}

/**
 * `shape`, lying in `frame`, as it would be authored on the page to look the
 * same: its box centred where its centre lands, turned by both rotations.
 * Without a turn in `frame`, only shifted — so exactly the old translation.
 */
export function shapeToPage<T extends TurnedBox>(shape: T, frame: Frame): T {
  if (frame.rotation === 0) return { ...shape, x: shape.x + frame.x, y: shape.y + frame.y }
  const center = pointToPage(frame, getCenter(shape))
  return {
    ...shape,
    x: center.x - shape.width / 2,
    y: center.y - shape.height / 2,
    rotation: normalizeRotation(frame.rotation + normalizeRotation(shape.rotation)),
  }
}

/** The inverse of `shapeToPage`: `shape`, as it lies on the page, re-expressed in `frame`. */
export function shapeFromPage<T extends TurnedBox>(shape: T, frame: Frame): T {
  if (frame.rotation === 0) return { ...shape, x: shape.x - frame.x, y: shape.y - frame.y }
  const center = pointFromPage(frame, getCenter(shape))
  return {
    ...shape,
    x: center.x - shape.width / 2,
    y: center.y - shape.height / 2,
    rotation: normalizeRotation(normalizeRotation(shape.rotation) - frame.rotation),
  }
}

/** The smallest unturned rect holding the turned box, in the box's own coordinates. */
export function getRotatedBounds(box: TurnedBox): TurnedBox {
  const rotation = normalizeRotation(box.rotation)
  if (rotation === 0) return { x: box.x, y: box.y, width: box.width, height: box.height }
  const radians = (rotation * Math.PI) / 180
  const cos = Math.abs(Math.cos(radians))
  const sin = Math.abs(Math.sin(radians))
  const width = box.width * cos + box.height * sin
  const height = box.width * sin + box.height * cos
  const center = getCenter(box)
  return { x: center.x - width / 2, y: center.y - height / 2, width, height }
}
