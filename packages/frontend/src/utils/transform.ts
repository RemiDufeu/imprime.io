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
// of `bounds` (same coord space as `original`). Dragging a north/west edge past
// the opposite one would invert the rect, so those cases clamp the size to
// MIN_SIZE *and* pin the origin, keeping the far edge where the user left it.
// MIN_SIZE wins over `bounds`.
export function resizeRect(
    handle: ResizeHandle,
    original: Rect,
    deltaX: number,
    deltaY: number,
    bounds: Rect,
): Rect {
    let { x, y, width, height } = original

    if (handle.includes('n')) {
        y = Math.max(original.y + deltaY, bounds.y)
        height = original.y + original.height - y
        if (height < MIN_SIZE) {
            height = MIN_SIZE
            y = original.y + original.height - MIN_SIZE
        }
    }
    if (handle.includes('s')) {
        height = Math.min(original.height + deltaY, bounds.y + bounds.height - original.y)
        if (height < MIN_SIZE) height = MIN_SIZE
    }
    if (handle.includes('w')) {
        x = Math.max(original.x + deltaX, bounds.x)
        width = original.x + original.width - x
        if (width < MIN_SIZE) {
            width = MIN_SIZE
            x = original.x + original.width - MIN_SIZE
        }
    }
    if (handle.includes('e')) {
        width = Math.min(original.width + deltaX, bounds.x + bounds.width - original.x)
        if (width < MIN_SIZE) width = MIN_SIZE
    }

    return { x, y, width, height }
}
