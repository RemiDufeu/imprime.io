export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export interface Rect {
    x: number
    y: number
    width: number
    height: number
}

// Smallest side a shape can be dragged down to.
export const MIN_SIZE = 20

// Apply a resize drag to `original` and return the resulting rect. Pure: the
// caller owns the coordinate conversion, this only does the geometry.
//
// Each edge in the handle moves independently. Dragging a north/west edge past
// the opposite one would invert the rect, so those cases clamp the size to
// MIN_SIZE *and* pin the origin, keeping the far edge where the user left it.
export function resizeRect(
    handle: ResizeHandle,
    original: Rect,
    deltaX: number,
    deltaY: number,
): Rect {
    let { x, y, width, height } = original

    if (handle.includes('n')) {
        y = original.y + deltaY
        height = original.height - deltaY
        if (height < MIN_SIZE) {
            height = MIN_SIZE
            y = original.y + original.height - MIN_SIZE
        }
    }
    if (handle.includes('s')) {
        height = original.height + deltaY
        if (height < MIN_SIZE) height = MIN_SIZE
    }
    if (handle.includes('w')) {
        x = original.x + deltaX
        width = original.width - deltaX
        if (width < MIN_SIZE) {
            width = MIN_SIZE
            x = original.x + original.width - MIN_SIZE
        }
    }
    if (handle.includes('e')) {
        width = original.width + deltaX
        if (width < MIN_SIZE) width = MIN_SIZE
    }

    return { x, y, width, height }
}
