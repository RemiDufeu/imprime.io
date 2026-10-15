import type { StateCreator } from 'zustand'
import type { PageSize, Shape } from '@imprime/sdk'
import { getHugAxis } from '@imprime/sdk'
import type { ShapeSlice } from './ShapeSlice'
import type { TemplateSlice } from './TemplateSlice'
import type { PageSlice } from './PageSlice'
import type { DocumentWriteSlice } from './DocumentWriteSlice'
import type { SelectionSlice } from './SelectionSlice'
import { findShapeById, findInnermostGroupAt, extractShapeById, insertShape } from '../../utils/shapeTree'
import { resizeRect, unionRect, type Rect, type ResizeHandle } from '../../utils/transform'
import { selectCurrentPage, selectPageSize, selectSelectedShape } from './selectors'

export type { ResizeHandle }

export type TransformationData = Rect

// Absolute bbox (page coords) of the group that would receive the shape if the
// user dropped right now. Purely for the overlay to render — the re-parent
// decision itself reads `hoveredGroupId`.
export interface GroupHighlight extends Rect {
    groupId: string
}

// Fields common to both drag modes: where the pointer started and the shape's
// rect at that moment, all in the shape's own (parent-relative) coord space.
interface DragBase {
    svgElement: SVGSVGElement
    startClientX: number
    startClientY: number
    originalX: number
    originalY: number
    originalWidth: number
    originalHeight: number
}

// A drag is either a resize or a translation, never both. Splitting them keeps
// the re-parenting fields off the resize path, where they have no meaning.
export type DragState =
    | (DragBase & {
        kind: 'resize'
        handle: ResizeHandle
        // What the dragged edges may not cross, in the shape's coord space:
        // the page, widened to the shape if it already overflows, so that
        // grabbing a handle never makes it jump back inside.
        bounds: Rect
    })
    | (DragBase & {
        kind: 'translate'
        // Absolute position of the shape and its parent at drag start — needed
        // to convert the final drop point into the destination's local space.
        originalAbsX: number
        originalAbsY: number
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
    onMouseMove: (clientX: number, clientY: number) => void
    onMouseUp: () => void
    // Size a shape of the current page by its values, as dragging its
    // bottom-right handle would: the same page edge, minimum and hug release.
    resizeShape: (id: string, size: Partial<Pick<Rect, 'width' | 'height'>>) => void
}

const clientToSVG = (svgElement: SVGSVGElement, clientX: number, clientY: number) => {
    const pt = svgElement.createSVGPoint()
    pt.x = clientX
    pt.y = clientY
    return pt.matrixTransform(svgElement.getScreenCTM()?.inverse())
}

const baseDragState = (
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
})

// What a resize of `shape` may not cross, in its own coord space: the page,
// widened to the shape if it already overflows, so that resizing never makes
// it jump back inside.
const resizeBounds = (shapes: Shape[], shape: Shape, pageSize: PageSize): Rect => {
    const loc = findShapeById(shapes, shape.id)
    const parentAbsX = (loc?.absX ?? shape.x) - shape.x
    const parentAbsY = (loc?.absY ?? shape.y) - shape.y
    return unionRect({ x: -parentAbsX, y: -parentAbsY, ...pageSize }, shape)
}

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
    const reparent = (drag: Extract<DragState, { kind: 'translate' }>, rect: Rect, shapeId: string) => {
        const newAbsX = drag.originalAbsX + (rect.x - drag.originalX)
        const newAbsY = drag.originalAbsY + (rect.y - drag.originalY)

        get()._editPage(shapes => {
            const parentLoc = drag.hoveredGroupId !== null ? findShapeById(shapes, drag.hoveredGroupId) : null
            const { removed, remaining } = extractShapeById(shapes, shapeId)
            if (!removed) return null
            const relocated = { ...removed, x: newAbsX - (parentLoc?.absX ?? 0), y: newAbsY - (parentLoc?.absY ?? 0) }
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
            const loc = page ? findShapeById(page.shapes, selectedShape.id) : null

            set({
                dragData: {
                    ...baseDragState(selectedShape, svgElement, clientX, clientY),
                    kind: 'translate',
                    originalAbsX: loc?.absX ?? selectedShape.x,
                    originalAbsY: loc?.absY ?? selectedShape.y,
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
                    ...baseDragState(selectedShape, svgElement, clientX, clientY),
                    kind: 'resize',
                    handle,
                    bounds: resizeBounds(page.shapes, selectedShape, selectPageSize(get())),
                },
            })
        },

        onMouseMove: (clientX, clientY) => {
            const { dragData, selectedShapeId } = get()
            if (!dragData || !selectedShapeId) return

            const startSVG = clientToSVG(dragData.svgElement, dragData.startClientX, dragData.startClientY)
            const currentSVG = clientToSVG(dragData.svgElement, clientX, clientY)
            const deltaX = currentSVG.x - startSVG.x
            const deltaY = currentSVG.y - startSVG.y

            const original: Rect = {
                x: dragData.originalX,
                y: dragData.originalY,
                width: dragData.originalWidth,
                height: dragData.originalHeight,
            }

            if (dragData.kind === 'resize') {
                set({ transformationData: resizeRect(dragData.handle, original, deltaX, deltaY, dragData.bounds) })
                return
            }

            set({
                transformationData: { ...original, x: original.x + deltaX, y: original.y + deltaY },
            })

            // Live drop-target highlight (Canva-style): show the group under the
            // cursor as a drop zone, unless it's already the shape's parent.
            const page = selectCurrentPage(get())
            if (!page) return

            const hit = findInnermostGroupAt(page.shapes, currentSVG.x, currentSVG.y, selectedShapeId)
            const hoveredGroupId = hit?.id ?? null
            const highlightedGroup: GroupHighlight | null =
                hit && hit.id !== dragData.originalParentGroupId
                    ? { groupId: hit.id, x: hit.absX, y: hit.absY, width: hit.width, height: hit.height }
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
            get().updateShape(id, releasingHug(shape, resizeRect('se', shape, deltaX, deltaY, bounds)))
        },
    }
}
