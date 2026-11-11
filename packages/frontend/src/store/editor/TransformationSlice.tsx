import type { StateCreator } from 'zustand'
import type { Frame, PageSize, Point, Shape } from '@imprime/sdk'
import { getCenter, getHugAxis, getRotation, normalizeRotation, pointToPage, rotateVector, PAGE_FRAME } from '@imprime/sdk'
import type { ShapeSlice } from './ShapeSlice'
import type { TemplateSlice } from './TemplateSlice'
import type { PageSlice } from './PageSlice'
import type { DocumentWriteSlice } from './DocumentWriteSlice'
import type { SelectionSlice } from './SelectionSlice'
import { findShapeById, findInnermostGroupAt, findContentFrame, extractShapeById, insertShape, relocateShape } from '../../utils/shapeTree'
import { resizeTurnedRect, unionRect, type Rect, type ResizeHandle } from '../../utils/transform'
import { selectCurrentPage, selectPageSize, selectSelectedShape } from './selectors'
import { isPageNumberBox } from '../../utils/pageNumbering'

export type { ResizeHandle }

// The dragged shape's rect, in its parent's coordinates; with its rotation
// while it is being turned.
export type TransformationData = Rect & { rotation?: number }

// The group that would receive the shape if the user dropped right now, its
// box (0, 0, width, height) drawn in `frame`. Purely for the overlay to
// render — the re-parent decision itself reads `hoveredGroupId`.
export interface GroupHighlight {
    groupId: string
    frame: Frame
    width: number
    height: number
}

// Fields common to every drag mode: where the pointer started and the shape's
// rect and rotation at that moment, all in the shape's own (parent-relative)
// coord space, and that space's frame on the page.
interface DragBase {
    svgElement: SVGSVGElement
    startClientX: number
    startClientY: number
    originalX: number
    originalY: number
    originalWidth: number
    originalHeight: number
    originalRotation: number
    parentFrame: Frame
}

// A drag is a resize, a translation or a turn, never two at once. Splitting
// them keeps the re-parenting fields off the other paths, where they have no
// meaning.
export type DragState =
    | (DragBase & {
        kind: 'resize'
        handle: ResizeHandle
        // What the dragged edges may not cross, in the shape's coord space:
        // the page, widened to the shape if it already overflows, so that
        // grabbing a handle never makes it jump back inside. Null for a shape
        // turned on the page, whose edges do not run along the page's.
        bounds: Rect | null
    })
    | (DragBase & {
        kind: 'rotate'
        // The shape's centre on the page, which it turns about, and the
        // pointer's angle around it when the drag started, in degrees.
        pivot: Point
        startAngle: number
    })
    | (DragBase & {
        kind: 'translate'
        originalParentGroupId: string | null
        // Group under the cursor right now (null = will drop to the root canvas).
        // This is what decides the re-parent on mouseUp.
        hoveredGroupId: string | null
        // Same group, but suppressed while it's already the shape's parent —
        // only ever read by the drop-highlight overlay.
        highlightedGroup: GroupHighlight | null
    })

export interface TransformationSlice {
    transformationData: TransformationData | null
    dragData: DragState | null

    startDrag: (svgElement: SVGSVGElement, clientX: number, clientY: number) => void
    startResize: (svgElement: SVGSVGElement, handle: ResizeHandle, clientX: number, clientY: number) => void
    startRotate: (svgElement: SVGSVGElement, clientX: number, clientY: number) => void
    // `snap` (Shift held) turns by ROTATION_SNAP steps.
    onMouseMove: (clientX: number, clientY: number, snap?: boolean) => void
    onMouseUp: () => void
    // Size a shape of the current page by its values, as dragging its
    // bottom-right handle would: the same page edge, minimum and hug release.
    resizeShape: (id: string, size: Partial<Pick<Rect, 'width' | 'height'>>) => void
    // Turn a shape to `rotation` degrees, as its rotation handle would.
    rotateShape: (id: string, rotation: number) => void
}

// The step, in degrees, a turn snaps to with Shift held. Without it, a turn
// lands on whole degrees.
export const ROTATION_SNAP = 15

const clientToSVG = (svgElement: SVGSVGElement, clientX: number, clientY: number) => {
    const pt = svgElement.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    return pt.matrixTransform(svgElement.getScreenCTM()?.inverse())
}

const baseDragState = (
    shapes: Shape[],
    shape: Shape,
    svgElement: SVGSVGElement,
    clientX: number,
    clientY: number,
): DragBase => ({
    svgElement,
    startClientX: clientX,
    startClientY: clientY,
    originalX: shape.x,
    originalY: shape.y,
    originalWidth: shape.width,
    originalHeight: shape.height,
    originalRotation: getRotation(shape),
    parentFrame: findShapeById(shapes, shape.id)?.parentFrame ?? PAGE_FRAME,
})

// What a resize of `shape` may not cross, in its own coord space: the page,
// widened to the shape if it already overflows, so that resizing never makes
// it jump back inside. Nothing for a shape turned on the page, by its own
// rotation or a parent's: the page's edges are not along its own.
const resizeBounds = (shapes: Shape[], shape: Shape, pageSize: PageSize): Rect | null => {
    const parentFrame = findShapeById(shapes, shape.id)?.parentFrame ?? PAGE_FRAME
    if (parentFrame.rotation !== 0 || getRotation(shape) !== 0) return null
    return unionRect({ x: -parentFrame.x, y: -parentFrame.y, ...pageSize }, shape)
}

// The pointer's angle around `pivot`, in degrees, clockwise from the x axis.
const angleAround = (pivot: Point, pointer: Point) =>
    (Math.atan2(pointer.y - pivot.y, pointer.x - pivot.x) * 180) / Math.PI

// Sizing a hugging group by hand along the axis it hugs gives it that size:
// it stops hugging, as in Figma. Otherwise the layout would put its content
// size back.
const releasingHug = (shape: Shape, rect: Rect): Partial<Shape> => {
    const hugAxis = shape.type === 'group' ? getHugAxis(shape) : null
    return hugAxis !== null && rect[hugAxis] !== shape[hugAxis] ? { ...rect, hug: false } : rect
}

export const createTransformationSlice: StateCreator<
    TransformationSlice & ShapeSlice & TemplateSlice & PageSlice & DocumentWriteSlice & SelectionSlice,
    [],
    [],
    TransformationSlice
> = (set, get) => {
    // The shape, moved to `rect` in its parent's coordinates, re-expressed in
    // the destination's: where it was dropped on the page, turned as it was.
    const reparent = (drag: Extract<DragState, { kind: 'translate' }>, rect: Rect, shapeId: string) => {
        get()._editPage(shapes => {
            const target = findContentFrame(shapes, drag.hoveredGroupId)
            const { removed, remaining } = extractShapeById(shapes, shapeId)
            if (!removed || !target) return null
            const relocated = relocateShape({ ...removed, x: rect.x, y: rect.y }, drag.parentFrame, target)
            return insertShape(remaining, drag.hoveredGroupId, relocated)
        })
    }

    return {
        transformationData: null,
        dragData: null,

        startDrag: (svgElement, clientX, clientY) => {
            const selectedShape = selectSelectedShape(get())
            if (!selectedShape) return

            const page = selectCurrentPage(get())
            if (!page) return
            const loc = findShapeById(page.shapes, selectedShape.id)

            set({
                dragData: {
                    ...baseDragState(page.shapes, selectedShape, svgElement, clientX, clientY),
                    kind: 'translate',
                    originalParentGroupId: loc?.parentGroupId ?? null,
                    hoveredGroupId: loc?.parentGroupId ?? null,
                    highlightedGroup: null,
                },
            })
        },

        startResize: (svgElement, handle, clientX, clientY) => {
            const selectedShape = selectSelectedShape(get())
            if (!selectedShape) return

            const page = selectCurrentPage(get())
            if (!page) return

            set({
                dragData: {
                    ...baseDragState(page.shapes, selectedShape, svgElement, clientX, clientY),
                    kind: 'resize',
                    handle,
                    bounds: resizeBounds(page.shapes, selectedShape, selectPageSize(get())),
                },
            })
        },

        startRotate: (svgElement, clientX, clientY) => {
            const selectedShape = selectSelectedShape(get())
            if (!selectedShape) return

            const page = selectCurrentPage(get())
            if (!page) return

            const base = baseDragState(page.shapes, selectedShape, svgElement, clientX, clientY)
            const pivot = pointToPage(base.parentFrame, getCenter(selectedShape))
            set({
                dragData: {
                    ...base,
                    kind: 'rotate',
                    pivot,
                    startAngle: angleAround(pivot, clientToSVG(svgElement, clientX, clientY)),
                },
            })
        },

        onMouseMove: (clientX, clientY, snap = false) => {
            const { dragData, selectedShapeId } = get()
            if (!dragData || !selectedShapeId) return

            const startSVG = clientToSVG(dragData.svgElement, dragData.startClientX, dragData.startClientY)
            const currentSVG = clientToSVG(dragData.svgElement, clientX, clientY)
            // The pointer's move, in the shape's parent's coordinates: a
            // turned parent turns it.
            const delta = rotateVector(
                { x: currentSVG.x - startSVG.x, y: currentSVG.y - startSVG.y },
                -dragData.parentFrame.rotation,
            )

            const original: Rect = {
                x: dragData.originalX,
                y: dragData.originalY,
                width: dragData.originalWidth,
                height: dragData.originalHeight,
            }

            if (dragData.kind === 'rotate') {
                const turn = dragData.originalRotation + angleAround(dragData.pivot, currentSVG) - dragData.startAngle
                const step = snap ? ROTATION_SNAP : 1
                set({ transformationData: { ...original, rotation: normalizeRotation(Math.round(turn / step) * step) } })
                return
            }

            if (dragData.kind === 'resize') {
                // Along the shape's own axes, which its rotation turns.
                const along = rotateVector(delta, -dragData.originalRotation)
                set({
                    transformationData: resizeTurnedRect(
                        dragData.handle, original, dragData.originalRotation, along.x, along.y, dragData.bounds,
                    ),
                })
                return
            }

            set({
                transformationData: { ...original, x: original.x + delta.x, y: original.y + delta.y },
            })

            // Live drop-target highlight (Canva-style): show the group under the
            // cursor as a drop zone, unless it's already the shape's parent.
            const page = selectCurrentPage(get())
            if (!page) return

            // The page-number box enters no group: none is a drop target for it.
            const hit = isPageNumberBox({ id: selectedShapeId })
                ? null
                : findInnermostGroupAt(page.shapes, currentSVG.x, currentSVG.y, selectedShapeId)
            const hoveredGroupId = hit?.id ?? null
            const highlightedGroup: GroupHighlight | null =
                hit && hit.id !== dragData.originalParentGroupId
                    ? { groupId: hit.id, frame: hit.frame, width: hit.width, height: hit.height }
                    : null

            // Only write when something actually changed (avoids extra renders).
            // The id check matters on its own: moving from the original parent
            // out to the canvas leaves `highlightedGroup` null on both sides.
            const prev = dragData.highlightedGroup
            const sameHighlight = prev?.groupId === highlightedGroup?.groupId
            if (!sameHighlight || dragData.hoveredGroupId !== hoveredGroupId) {
                set({ dragData: { ...dragData, highlightedGroup, hoveredGroupId } })
            }
        },

        onMouseUp: () => {
            const { dragData, transformationData, selectedShapeId } = get()
            if (!dragData) return

            if (transformationData && selectedShapeId) {
                // Re-parent only when the destination differs from the source
                // parent; otherwise it's a plain move within the same container.
                if (
                    dragData.kind === 'translate'
                    && dragData.hoveredGroupId !== dragData.originalParentGroupId
                ) {
                    reparent(dragData, transformationData, selectedShapeId)
                } else if (dragData.kind === 'rotate') {
                    get().rotateShape(selectedShapeId, transformationData.rotation ?? 0)
                } else {
                    const shape = selectSelectedShape(get())
                    get().updateShape(selectedShapeId, dragData.kind === 'resize' && shape
                        ? releasingHug(shape, transformationData)
                        : transformationData)
                }
            }

            set({ dragData: null, transformationData: null })
        },

        resizeShape: (id, size) => {
            const page = selectCurrentPage(get())
            const shape = page ? findShapeById(page.shapes, id)?.shape : undefined
            if (!page || !shape) return

            const bounds = resizeBounds(page.shapes, shape, selectPageSize(get()))
            const deltaX = (size.width ?? shape.width) - shape.width
            const deltaY = (size.height ?? shape.height) - shape.height
            const rect = resizeTurnedRect('se', shape, getRotation(shape), deltaX, deltaY, bounds)
            get().updateShape(id, releasingHug(shape, rect))
        },

        rotateShape: (id, rotation) => {
            // Unset rather than 0, as a shape that was never turned.
            const turn = normalizeRotation(rotation)
            get().updateShape(id, { rotation: turn === 0 ? undefined : turn })
        },
    }
}
