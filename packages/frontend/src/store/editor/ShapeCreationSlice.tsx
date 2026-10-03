import type { Shape } from '@imprime/sdk'
import type { StateCreator } from 'zustand'
import type { PresentationSlice } from './PresentationSlice'
import type { SlideSlice } from './SlideSlice'
import type { ShapeSlice } from './ShapeSlice'
import type { ToolSlice } from './ToolSlice'
import type { ToolAttributesSlice } from './ToolAttributeSlice'
import { findInnermostGroupAt, insertShape, nextShapeName } from '../../utils/shapeTree'
import { selectCurrentSlide } from './selectors'

export interface DrawingData {
    startX: number
    startY: number
    currentX: number
    currentY: number
}

export interface ShapeCreationSlice {
    isDrawing: boolean
    drawingData: DrawingData | null

    startDrawing: (x: number, y: number) => void
    updateDrawing: (x: number, y: number) => void
    finishDrawing: () => void
    cancelDrawing: () => void
}

export const createShapeCreationSlice: StateCreator<
    PresentationSlice & SlideSlice & ShapeCreationSlice & ShapeSlice & ToolSlice & ToolAttributesSlice,
    [],
    [],
    ShapeCreationSlice
> = (set, get) => {
    let rafId: number | null = null

    const getCurrentSlide = () => selectCurrentSlide(get())

    return {
        isDrawing: false,
        drawingData: null,

        startDrawing: (x: number, y: number) => {
            const { selectedTool } = get()

            if (
                selectedTool !== 'rectangle' &&
                selectedTool !== 'ellipse' &&
                selectedTool !== 'text' &&
                selectedTool !== 'group' &&
                selectedTool !== 'if-group' &&
                selectedTool !== 'for-group'
            ) {
                return
            }

            set({
                isDrawing: true,
                drawingData: { startX: x, startY: y, currentX: x, currentY: y },
                selectedShape: null,
            })
        },

        updateDrawing: (x: number, y: number) => {
            const { isDrawing, drawingData } = get()
            if (!isDrawing || !drawingData) return

            if (rafId !== null) {
                cancelAnimationFrame(rafId)
            }

            rafId = requestAnimationFrame(() => {
                set({
                    drawingData: { ...get().drawingData!, currentX: x, currentY: y },
                })
                rafId = null
            })
        },

        cancelDrawing: () => {
            if (rafId !== null) {
                cancelAnimationFrame(rafId)
                rafId = null
            }
            set({ isDrawing: false, drawingData: null })
        },

        finishDrawing: () => {
            const { isDrawing, drawingData, selectedTool, attributes, updateSlideShapes, selectShape, cancelDrawing } = get()
            const currentSlide = getCurrentSlide()

            if (!isDrawing || !drawingData || !currentSlide) {
                cancelDrawing()
                return
            }

            const { startX, startY, currentX, currentY } = drawingData
            const x = Math.min(startX, currentX)
            const y = Math.min(startY, currentY)
            const width = Math.abs(currentX - startX)
            const height = Math.abs(currentY - startY)

            const minSize = 20
            if (width < minSize || height < minSize) {
                cancelDrawing()
                return
            }

            const shapeId = crypto.randomUUID()
            let newShape: Shape

            if (selectedTool === 'text') {
                newShape = {
                    id: shapeId,
                    type: 'text',
                    name: nextShapeName(currentSlide.shapes, 'text'),
                    x, y, width, height,
                    paragraphes: [{
                        type: 'paragraph',
                        children: [{text : ''}]
                    }],
                }
            } else if (selectedTool === 'group') {
                newShape = {
                    id: shapeId,
                    type: 'group',
                    name: nextShapeName(currentSlide.shapes, 'group'),
                    x, y, width, height,
                    children: [],
                }
            } else if (selectedTool === 'if-group') {
                newShape = {
                    id: shapeId,
                    type: 'if-group',
                    name: nextShapeName(currentSlide.shapes, 'if-group'),
                    x, y, width, height,
                    children: [],
                }
            } else if (selectedTool === 'for-group') {
                newShape = {
                    id: shapeId,
                    type: 'for-group',
                    name: nextShapeName(currentSlide.shapes, 'for-group'),
                    x, y, width, height,
                    children: [],
                }
            } else if (selectedTool === 'ellipse') {
                newShape = {
                    id: shapeId,
                    type: 'ellipse',
                    name: nextShapeName(currentSlide.shapes, 'ellipse'),
                    x, y, width, height,
                    fill: attributes.fillColor,
                    stroke: attributes.strokeColor,
                    strokeWidth: attributes.strokeWidth,
                    strokeStyle: attributes.strokeStyle,
                }
            } else {
                newShape = {
                    id: shapeId,
                    type: 'rectangle',
                    name: nextShapeName(currentSlide.shapes, 'rectangle'),
                    x, y, width, height,
                    fill: attributes.fillColor,
                    stroke: attributes.strokeColor,
                    strokeWidth: attributes.strokeWidth,
                    strokeStyle: attributes.strokeStyle,
                    cornerRadius: attributes.cornerRadius,
                }
            }

            // Drawing over a container drops the shape inside it, with the
            // rect converted into that container's local coordinate space.
            const parent = findInnermostGroupAt(currentSlide.shapes, x, y)
            const nextShapes = parent
                ? insertShape(currentSlide.shapes, parent.id,
                    { ...newShape, x: x - parent.absX, y: y - parent.absY } as Shape)
                : [...currentSlide.shapes, newShape]

            updateSlideShapes(currentSlide._id, nextShapes)
            selectShape(shapeId)
            get().setTool('move')
            cancelDrawing()
        },
    }
}
