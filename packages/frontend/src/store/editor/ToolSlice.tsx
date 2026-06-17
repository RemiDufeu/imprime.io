import type { StateCreator } from 'zustand'
import type { ShapeSlice } from './ShapeSlice'
import type { ToolAttributesSlice, ContextBarType } from './ToolAttributeSlice'

export type ToolType = 'move' | 'rectangle' | 'ellipse' | 'text'

export interface ToolSlice {
  selectedTool: ToolType,
  setTool: (tool: ToolType) => void,
}

export const createToolSlice: StateCreator<
  ToolSlice & ShapeSlice & ToolAttributesSlice,
  [],
  [],
  ToolSlice
> = (set, get) => ({
    selectedTool: 'move',
    setTool: (tool) => {
        const selectedShape = get().selectedShape
        let contextBarType: ContextBarType = 'none'

        // If a shape is selected with move tool, determine context bar from shape type
        if (selectedShape && tool === 'move') {
            if (selectedShape.type === 'rectangle' || selectedShape.type === 'ellipse') {
                contextBarType = 'shape'
            } else if (selectedShape.type === 'text') {
                contextBarType = 'text'
            }
        }
        else if (tool === 'rectangle' || tool === 'ellipse') {
            contextBarType = 'shape'
        } else if (tool === 'text') {
            contextBarType = 'text'
        }

        set({ selectedTool: tool, contextBarType })
    },
})
