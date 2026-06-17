import type { Shape } from '@imprime/sdk'
import type { SlideSlice } from './SlideSlice'
import type { PresentationSlice } from './PresentationSlice'
import type { ToolSlice } from './ToolSlice'
import type { ToolAttributesSlice } from './ToolAttributeSlice'
import { shapeToAttributesHelper } from './ToolAttributeSlice'
import type { StateCreator } from 'zustand'
import type { RichTextEditorSlice } from './RichTextEditorSlice'

export interface ShapeSlice {
    selectedShape: Shape | null
    selectShape: (id: string | null) => void
    updateShape: (id: string, updates: Partial<Shape>) => void
    deleteShape: (id: string) => void
}

export const createShapeSlice : StateCreator<
  ShapeSlice & SlideSlice & PresentationSlice & ToolSlice & ToolAttributesSlice & RichTextEditorSlice,
  [],
    [],
    ShapeSlice
> = (set, get) => ({
    selectedShape: null,
    selectShape: (id) => {
        // Retrieve with Id
        let selectedShape: Shape | null = null
         try {
            const state = get()
            const currentSlide = state.presentation?.slides[state.currentSlideIndex]
            if (!currentSlide) return
            selectedShape = currentSlide.shapes.find(s => s.id === id) ?? null
        } catch {
            return
        }

        const selectedTool = get().selectedTool
        let contextBarType = get().contextBarType

        // Update context bar type based on selected shape and tool
        if (selectedTool === 'move') {
            if(selectedShape) {
                 if (selectedShape.type === 'rectangle' || selectedShape.type === 'ellipse') {
                    contextBarType = 'shape'
                } else if (selectedShape.type === 'text') {
                    contextBarType = 'text'
                }
            } else {
                contextBarType = 'none'
            }
        }

        // Sync attributes with selected shape properties
        const shapeAttributes = selectedShape ? shapeToAttributesHelper(selectedShape) : {}
        const updatedAttributes = { ...get().attributes, ...shapeAttributes }

        // Update store
         // Unselect editor when we change selection
        set({ selectedShape, contextBarType, attributes: updatedAttributes, editor : null })
    },
    updateShape: (id: string, updates: Partial<Shape>) => {
        const { presentation, currentSlideIndex, updateSlideShapes } = get()
        if (!presentation) return
        const currentSlide = presentation.slides[currentSlideIndex]
        if (!currentSlide) return
        const updatedShapes = currentSlide.shapes.map((shape) =>
            shape.id === id ? { ...shape, ...updates } as Shape : shape
        )
        updateSlideShapes(currentSlide._id, updatedShapes)
    },
    deleteShape: (id: string) => {
        const { presentation, currentSlideIndex, updateSlideShapes } = get()   
        if (!presentation) return
        const currentSlide = presentation.slides[currentSlideIndex]
        if (!currentSlide) return

        const updatedShapes = currentSlide.shapes.filter((shape) => shape.id !== id)
        updateSlideShapes(currentSlide._id, updatedShapes)
    },
})