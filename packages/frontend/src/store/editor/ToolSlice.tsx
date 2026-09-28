import type { StateCreator } from 'zustand'
import type { ShapeSlice } from './ShapeSlice'
import type { ToolAttributesSlice, ContextBarType } from './ToolAttributeSlice'

export type ToolType = 'move' | 'rectangle' | 'ellipse' | 'text' | 'group' | 'if-group' | 'for-group'

export interface ToolSlice {
  selectedTool: ToolType,
  setTool: (tool: ToolType) => void,
}

function contextBarForShapeType(type: string): ContextBarType {
    if (type === 'rectangle' || type === 'ellipse') return 'shape'
    if (type === 'text') return 'text'
    if (type === 'group') return 'group'
    if (type === 'if-group') return 'if-group'
    if (type === 'for-group') return 'for-group'
    return 'none'
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

        if (selectedShape && tool === 'move') {
            contextBarType = contextBarForShapeType(selectedShape.type)
        } else if (tool !== 'move') {
            contextBarType = contextBarForShapeType(tool)
        }

        set({ selectedTool: tool, contextBarType })
    },
})
