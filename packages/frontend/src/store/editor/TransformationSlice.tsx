import type { StateCreator } from 'zustand'
import type { Shape } from '@imprime/sdk'
import type { ShapeSlice } from './ShapeSlice'
import type { PresentationSlice } from './PresentationSlice'
import type { SlideSlice } from './SlideSlice'
import type { DocumentWriteSlice } from './DocumentWriteSlice'
import type { SelectionSlice } from './SelectionSlice'
import { findShapeById, findInnermostGroupAt, extractShapeById, insertShape } from '../../utils/shapeTree'
import { resizeRect, type Rect, type ResizeHandle } from '../../utils/transform'
import { selectCurrentSlide, selectSelectedShape } from './selectors'

export type { ResizeHandle }

export type TransformationData = Rect

// Absolute bbox (slide coords) of the group that would receive the shape if the
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

export const createTransformationSlice: StateCreator<
    TransformationSlice & ShapeSlice & PresentationSlice & SlideSlice & DocumentWriteSlice & SelectionSlice,
    [],
    [],
    TransformationSlice
> = (set, get) => {
    const reparent = (drag: Extract<DragState, { kind: 'translate' }>, rect: Rect, shapeId: string) => {
        const newAbsX = drag.originalAbsX + (rect.x - drag.originalX)
        const newAbsY = drag.originalAbsY + (rect.y - drag.originalY)

        get()._editSlide(shapes => {
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

            const slide = selectCurrentSlide(get())
            const loc = slide ? findShapeById(slide.shapes, selectedShape.id) : null

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

            set({
                dragData: {
                    ...baseDragState(selectedShape, svgElement, clientX, clientY),
                    kind: 'resize',
                    handle,
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
                set({ transformationData: resizeRect(dragData.handle, original, deltaX, deltaY) })
                return
            }

            set({
                transformationData: { ...original, x: original.x + deltaX, y: original.y + deltaY },
            })

            // Live drop-target highlight (Canva-style): show the group under the
            // cursor as a drop zone, unless it's already the shape's parent.
            const slide = selectCurrentSlide(get())
            if (!slide) return

            const hit = findInnermostGroupAt(slide.shapes, currentSVG.x, currentSVG.y, selectedShapeId)
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
                    get().updateShape(selectedShapeId, transformationData)
                }
            }

            set({ dragData: null, transformationData: null })
        },
    }
}
