import type { StateCreator } from 'zustand'
import type { ShapeSlice } from '../../store/editor/ShapeSlice'

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export interface TransformationData {
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
    ShapeSlice & TransformationSlice,
    [],
    [],
    TransformationSlice
> = (set, get) => ({
    transformationData: null,
    dragData: null,
    startDrag: (svgElement, clientX, clientY) => {
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
                handle: null,
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
            },
        })
    },

    onMouseMove: (clientX, clientY) => {
        const { dragData, selectedShape } = get()
        if (!dragData || !selectedShape) return

        const startSVG = clientToSVG(dragData.svgElement, dragData.startClientX, dragData.startClientY)
        const currentSVG = clientToSVG(dragData.svgElement, clientX, clientY)
        const deltaX = currentSVG.x - startSVG.x
        const deltaY = currentSVG.y - startSVG.y

        if (dragData.handle === null) {
            set({
                transformationData: {
                    x: dragData.originalX + deltaX,
                    y: dragData.originalY + deltaY,
                    width: dragData.originalWidth,
                    height: dragData.originalHeight,
                },
            })
            return
        }

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
            transformationData: {
                x: newX,
                y: newY,
                width: newWidth,
                height: newHeight,
            },
        })
    },

    onMouseUp: () => {
        const { dragData, transformationData, selectedShape, updateShape, selectShape } = get()

        if (!dragData) return

        if (transformationData && selectedShape) {
            updateShape(
                selectedShape.id, {
                    x: transformationData.x,
                    y: transformationData.y,
                    width: transformationData.width,
                    height: transformationData.height
                }
            )
            
            selectShape(selectedShape.id)
        }

        set({
            dragData: null,
            transformationData: null,
        })
    },
})