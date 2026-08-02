import type { StateCreator } from 'zustand'
import type { ShapeSlice } from '../../store/editor/ShapeSlice'
import type { SlideSlice } from './SlideSlice'
import type { PresentationSlice } from './PresentationSlice'
import { findShapeById, findInnermostGroupAt, extractShapeById, insertShape } from '../../utils/shapeTree'

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export interface TransformationData {
    x: number
    y: number
    width: number
    height: number
}

// Live highlight of the group that would receive the shape if the user
// dropped right now. Absolute bbox in slide coords, for the overlay to render.
export interface DropTarget {
    groupId: string
    x: number
    y: number
    width: number
    height: number
}

interface DragState {
    svgElement: SVGSVGElement
    startClientX: number
    startClientY: number
    originalX: number
    originalY: number
    originalWidth: number
    originalHeight: number
    handle: ResizeHandle | null
    // Set only for translation drags (not resizes). Absolute position of the
    // shape and its parent group at drag start — needed to convert the final
    // absolute drop point into the destination parent's local coord space.
    originalAbsX: number
    originalAbsY: number
    originalParentGroupId: string | null
    // Group under the cursor right now (or null = will drop to root canvas).
    dropTarget: DropTarget | null
}

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

const MIN_SIZE = 20

export const createTransformationSlice: StateCreator<
    ShapeSlice & TransformationSlice & SlideSlice & PresentationSlice,
    [],
    [],
    TransformationSlice
> = (set, get) => ({
    transformationData: null,
    dragData: null,
    startDrag: (svgElement, clientX, clientY) => {
        const { selectedShape, presentation, currentSlideIndex } = get()
        if (!selectedShape) return

        const slide = presentation?.slides[currentSlideIndex]
        const loc = slide ? findShapeById(slide.shapes, selectedShape.id) : null

        set({
            dragData: {
                svgElement,
                startClientX: clientX,
                startClientY: clientY,
                originalX: selectedShape.x,
                originalY: selectedShape.y,
                originalWidth: selectedShape.width,
                originalHeight: selectedShape.height,
                handle: null,
                originalAbsX: loc?.absX ?? selectedShape.x,
                originalAbsY: loc?.absY ?? selectedShape.y,
                originalParentGroupId: loc?.parentGroupId ?? null,
                dropTarget: null,
            },
        })
    },

    startResize: (svgElement, handle, clientX, clientY) => {
        const { selectedShape } = get()
        if (!selectedShape) return

        set({
            dragData: {
                svgElement,
                startClientX: clientX,
                startClientY: clientY,
                originalX: selectedShape.x,
                originalY: selectedShape.y,
                originalWidth: selectedShape.width,
                originalHeight: selectedShape.height,
                handle,
                originalAbsX: selectedShape.x,
                originalAbsY: selectedShape.y,
                originalParentGroupId: null,
                dropTarget: null,
            },
        })
    },

    onMouseMove: (clientX, clientY) => {
        const { dragData, selectedShape, presentation, currentSlideIndex } = get()
        if (!dragData || !selectedShape) return

        const startSVG = clientToSVG(dragData.svgElement, dragData.startClientX, dragData.startClientY)
        const currentSVG = clientToSVG(dragData.svgElement, clientX, clientY)
        const deltaX = currentSVG.x - startSVG.x
        const deltaY = currentSVG.y - startSVG.y

        if (dragData.handle !== null) {
            // Resize path — unchanged.
            const handle = dragData.handle
            let newX = dragData.originalX
            let newY = dragData.originalY
            let newWidth = dragData.originalWidth
            let newHeight = dragData.originalHeight
            if (handle.includes('n')) {
                newY = dragData.originalY + deltaY
                newHeight = dragData.originalHeight - deltaY
                if (newHeight < MIN_SIZE) {
                    newHeight = MIN_SIZE
                    newY = dragData.originalY + dragData.originalHeight - MIN_SIZE
                }
            }
            if (handle.includes('s')) {
                newHeight = dragData.originalHeight + deltaY
                if (newHeight < MIN_SIZE) newHeight = MIN_SIZE
            }
            if (handle.includes('w')) {
                newX = dragData.originalX + deltaX
                newWidth = dragData.originalWidth - deltaX
                if (newWidth < MIN_SIZE) {
                    newWidth = MIN_SIZE
                    newX = dragData.originalX + dragData.originalWidth - MIN_SIZE
                }
            }
            if (handle.includes('e')) {
                newWidth = dragData.originalWidth + deltaX
                if (newWidth < MIN_SIZE) newWidth = MIN_SIZE
            }
            set({
                transformationData: { x: newX, y: newY, width: newWidth, height: newHeight },
            })
            return
        }

        // Translation path — position update.
        set({
            transformationData: {
                x: dragData.originalX + deltaX,
                y: dragData.originalY + deltaY,
                width: dragData.originalWidth,
                height: dragData.originalHeight,
            },
        })

        // Live drop-target highlight (Canva-style): show the group under the
        // cursor as a highlighted drop zone, unless it's already the shape's
        // current parent.
        const slide = presentation?.slides[currentSlideIndex]
        if (!slide) return

        const hit = findInnermostGroupAt(slide.shapes, currentSVG.x, currentSVG.y, selectedShape.id)
        const nextTarget: DropTarget | null =
            hit && hit.id !== dragData.originalParentGroupId
                ? { groupId: hit.id, x: hit.absX, y: hit.absY, width: hit.width, height: hit.height }
                : null

        // Only write to the store if it actually changed (avoids extra renders).
        const prev = dragData.dropTarget
        const same =
            (prev === null && nextTarget === null)
            || (prev !== null && nextTarget !== null && prev.groupId === nextTarget.groupId)
        if (!same) {
            set({ dragData: { ...dragData, dropTarget: nextTarget } })
        }
    },

    onMouseUp: () => {
        const { dragData, transformationData, selectedShape, presentation, currentSlideIndex, updateSlideShapes, selectShape, updateShape } = get()

        if (!dragData) return

        // Translation drag — decide the destination parent from the FINAL cursor
        // position (Canva/Figma pattern: no dwell, position wins on drop).
        if (
            dragData.handle === null
            && selectedShape
            && transformationData
            && presentation
        ) {
            const slide = presentation.slides[currentSlideIndex]
            if (slide) {
                // Absolute position of the shape at mouseUp.
                const deltaX = transformationData.x - dragData.originalX
                const deltaY = transformationData.y - dragData.originalY
                const newAbsX = dragData.originalAbsX + deltaX
                const newAbsY = dragData.originalAbsY + deltaY

                // Destination parent = whichever group the drop-target highlight
                // last resolved to (may be null for root). This matches what the
                // user visually saw, which is what onMouseMove computed from the
                // live cursor position.
                const targetGroupId = dragData.dropTarget?.groupId ?? null

                // Only reparent when the destination actually differs from the
                // source parent — otherwise it's a plain move within the same
                // container.
                if (targetGroupId !== dragData.originalParentGroupId) {
                    let parentAbsX = 0
                    let parentAbsY = 0
                    if (targetGroupId !== null) {
                        const parentLoc = findShapeById(slide.shapes, targetGroupId)
                        if (parentLoc) { parentAbsX = parentLoc.absX; parentAbsY = parentLoc.absY }
                    }
                    const nextRelX = newAbsX - parentAbsX
                    const nextRelY = newAbsY - parentAbsY

                    const extracted = extractShapeById(slide.shapes, selectedShape.id)
                    if (extracted.removed) {
                        const relocated = { ...extracted.removed, x: nextRelX, y: nextRelY }
                        const nextShapes = insertShape(extracted.remaining, targetGroupId, relocated)
                        updateSlideShapes(slide._id, nextShapes)
                        selectShape(selectedShape.id)
                    }
                } else {
                    // Same parent — plain in-place move.
                    updateShape(selectedShape.id, {
                        x: transformationData.x,
                        y: transformationData.y,
                        width: transformationData.width,
                        height: transformationData.height,
                    })
                    selectShape(selectedShape.id)
                }
            }
        } else if (transformationData && selectedShape) {
            // Resize path — no re-parenting.
            updateShape(selectedShape.id, {
                x: transformationData.x,
                y: transformationData.y,
                width: transformationData.width,
                height: transformationData.height,
            })
            selectShape(selectedShape.id)
        }

        set({ dragData: null, transformationData: null })
    },
})
