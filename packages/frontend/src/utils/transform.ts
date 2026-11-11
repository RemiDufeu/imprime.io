import { getCenter, rotateVector } from '@imprime/sdk'

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export interface Rect {
    x: number
    y: number
    width: number
    height: number
}

// Smallest side a shape can be dragged down to.
export const MIN_SIZE = 1

// Smallest rect containing both `a` and `b`.
export function unionRect(a: Rect, b: Rect): Rect {
    const x = Math.min(a.x, b.x)
    const y = Math.min(a.y, b.y)
    return {
        x,
        y,
        width: Math.max(a.x + a.width, b.x + b.width) - x,
        height: Math.max(a.y + a.height, b.y + b.height) - y,
    }
}

// Apply a resize drag to `original` and return the resulting rect. Pure: the
// caller owns the coordinate conversion, this only does the geometry.
//
// Each edge in the handle moves independently, and stops at the matching edge
// of `bounds` (same coord space as `original`; null for none). Dragging a
// north/west edge past the opposite one would invert the rect, so those cases
// clamp the size to MIN_SIZE *and* pin the origin, keeping the far edge where
// the user left it. MIN_SIZE wins over `bounds`.
export function resizeRect(
    handle: ResizeHandle,
    original: Rect,
    deltaX: number,
    deltaY: number,
    bounds: Rect | null,
): Rect {
    let { x, y, width, height } = original

    if (handle.includes('n')) {
        y = Math.max(original.y + deltaY, bounds?.y ?? -Infinity)
        height = original.y + original.height - y
        if (height < MIN_SIZE) {
            height = MIN_SIZE
            y = original.y + original.height - MIN_SIZE
        }
    }
    if (handle.includes('s')) {
        height = Math.min(original.height + deltaY, bounds ? bounds.y + bounds.height - original.y : Infinity)
        if (height < MIN_SIZE) height = MIN_SIZE
    }
    if (handle.includes('w')) {
        x = Math.max(original.x + deltaX, bounds?.x ?? -Infinity)
        width = original.x + original.width - x
        if (width < MIN_SIZE) {
            width = MIN_SIZE
            x = original.x + original.width - MIN_SIZE
        }
    }
    if (handle.includes('e')) {
        width = Math.min(original.width + deltaX, bounds ? bounds.x + bounds.width - original.x : Infinity)
        if (width < MIN_SIZE) width = MIN_SIZE
    }

    return { x, y, width, height }
}

// `resizeRect` for a box turned by `rotation` degrees about its centre, the
// deltas along the box's own axes. The edges opposite the handle stay where
// they are on the page: `resizeRect` keeps them in the unturned box, but
// turning the result about its new centre would move them, so the centre
// moves by the turned difference instead.
export function resizeTurnedRect(
    handle: ResizeHandle,
    original: Rect,
    rotation: number,
    deltaX: number,
    deltaY: number,
    bounds: Rect | null,
): Rect {
    const resized = resizeRect(handle, original, deltaX, deltaY, bounds)
    if (rotation === 0) return resized

    const before = getCenter(original)
    const after = getCenter(resized)
    const shift = rotateVector({ x: after.x - before.x, y: after.y - before.y }, rotation)
    return {
        ...resized,
        x: before.x + shift.x - resized.width / 2,
        y: before.y + shift.y - resized.height / 2,
    }
}
