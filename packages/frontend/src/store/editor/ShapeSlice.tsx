import type { Shape } from '@imprime/sdk'
import type { SlideSlice } from './SlideSlice'
import type { PresentationSlice } from './PresentationSlice'
import type { ToolSlice } from './ToolSlice'
import type { ToolAttributesSlice } from './ToolAttributeSlice'
import { shapeToAttributesHelper } from './ToolAttributeSlice'
import type { StateCreator } from 'zustand'
import type { RichTextEditorSlice } from './RichTextEditorSlice'
import {
    findShapeById,
    updateShapeById,
    deleteShapeById,
    extractShapeById,
    insertShapeAt,
    cloneShapeWithNewIds,
    isDescendantOf,
} from '../../utils/shapeTree'

export interface ShapeSlice {
    selectedShape: Shape | null
    selectShape: (id: string | null) => void
    updateShape: (id: string, updates: Partial<Shape>) => void
    deleteShape: (id: string) => void
    // Duplicate a shape (recursively for groups, with fresh IDs) and insert
    // the copy immediately after the source in its own parent.
    duplicateShape: (id: string) => void
    // Move a shape to a new parent + index in the tree. `targetGroupId === null`
    // means the slide root. Rejects moves that would put a group inside itself.
    moveShape: (id: string, targetGroupId: string | null, index: number) => void
}

export const createShapeSlice : StateCreator<
  ShapeSlice & SlideSlice & PresentationSlice & ToolSlice & ToolAttributesSlice & RichTextEditorSlice,
  [],
    [],
    ShapeSlice
> = (set, get) => ({
    selectedShape: null,
    selectShape: (id) => {
        // Retrieve with Id (walk the tree — shapes can be nested in groups)
        let selectedShape: Shape | null = null
         try {
            const state = get()
            const currentSlide = state.presentation?.slides[state.currentSlideIndex]
            if (!currentSlide) return
            if (id !== null) {
                selectedShape = findShapeById(currentSlide.shapes, id)?.shape ?? null
            }
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
                } else if (selectedShape.type === 'group') {
                    contextBarType = 'group'
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
        const updatedShapes = updateShapeById(currentSlide.shapes, id, updates)
        updateSlideShapes(currentSlide._id, updatedShapes)
    },
    deleteShape: (id: string) => {
        const { presentation, currentSlideIndex, updateSlideShapes } = get()
        if (!presentation) return
        const currentSlide = presentation.slides[currentSlideIndex]
        if (!currentSlide) return
        const updatedShapes = deleteShapeById(currentSlide.shapes, id)
        updateSlideShapes(currentSlide._id, updatedShapes)
    },
    duplicateShape: (id: string) => {
        const { presentation, currentSlideIndex, updateSlideShapes, selectShape } = get()
        if (!presentation) return
        const currentSlide = presentation.slides[currentSlideIndex]
        if (!currentSlide) return
        const loc = findShapeById(currentSlide.shapes, id)
        if (!loc) return
        const copy = cloneShapeWithNewIds(loc.shape)
        // Slight offset so the copy is visually distinct from the source.
        const OFFSET = 20
        const copiedName = loc.shape.name ? `${loc.shape.name} copie` : undefined
        const relocated = { ...copy, x: copy.x + OFFSET, y: copy.y + OFFSET, name: copiedName } as Shape

        // Insert directly after the source in its parent's children.
        const parentChildren = loc.parentGroupId === null
            ? currentSlide.shapes
            : findShapeById(currentSlide.shapes, loc.parentGroupId)?.shape
        const siblings = parentChildren && 'children' in parentChildren!
            ? (parentChildren as { children: Shape[] }).children
            : currentSlide.shapes
        const sourceIndex = siblings.findIndex(s => s.id === id)
        const insertIndex = sourceIndex === -1 ? siblings.length : sourceIndex + 1

        const nextShapes = insertShapeAt(currentSlide.shapes, loc.parentGroupId, insertIndex, relocated)
        updateSlideShapes(currentSlide._id, nextShapes)
        selectShape(relocated.id)
    },
    moveShape: (id: string, targetGroupId: string | null, index: number) => {
        const { presentation, currentSlideIndex, updateSlideShapes, selectShape } = get()
        if (!presentation) return
        const currentSlide = presentation.slides[currentSlideIndex]
        if (!currentSlide) return
        // Reject moves into own subtree (would make a group its own descendant).
        if (targetGroupId !== null && isDescendantOf(currentSlide.shapes, targetGroupId, id)) return

        const sourceLoc = findShapeById(currentSlide.shapes, id)
        if (!sourceLoc) return
        const targetParentAbs = targetGroupId === null
            ? { absX: 0, absY: 0 }
            : findShapeById(currentSlide.shapes, targetGroupId)
        if (targetParentAbs === null) return
        const newX = sourceLoc.absX - targetParentAbs.absX
        const newY = sourceLoc.absY - targetParentAbs.absY

        const { removed, remaining } = extractShapeById(currentSlide.shapes, id)
        if (!removed) return
        const repositioned = { ...removed, x: newX, y: newY } as Shape

        // If moving within the same parent, the target index may shift once the
        // source is removed. Caller passes the index in the *pre-removal* tree,
        // and we adjust here.
        const preSiblings = targetGroupId === null
            ? currentSlide.shapes
            : (findShapeById(currentSlide.shapes, targetGroupId)?.shape as { children?: Shape[] } | undefined)?.children ?? []
        const sourceIndexInTarget = preSiblings.findIndex(s => s.id === id)
        const adjustedIndex = sourceIndexInTarget !== -1 && sourceIndexInTarget < index
            ? index - 1
            : index

        const nextShapes = insertShapeAt(remaining, targetGroupId, adjustedIndex, repositioned)
        updateSlideShapes(currentSlide._id, nextShapes)
        selectShape(id)
    },
})