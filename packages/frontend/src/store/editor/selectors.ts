import type { Presentation, Shape, Slide } from '@imprime/sdk'
import { findShapeById } from '../../utils/shapeTree'
import type { HistorySlice } from './HistorySlice'
import type { TextEditorSlice } from './TextEditorSlice'
import type { ToolType } from './ToolSlice'

// Minimal shape of the state these selectors read, so they can be applied both
// to a React subscription (`useEditorStore(selectCurrentSlide)`) and to a plain
// snapshot inside a slice action (`selectCurrentSlide(get())`).
export interface CurrentSlideState {
    presentation: Presentation | null
    currentSlideIndex: number
}

// The slide currently being edited. Single definition of that lookup — slice
// actions can't call `useCurrentSlide`, so without this they each re-derive it.
export const selectCurrentSlide = (s: CurrentSlideState): Slide | null =>
    s.presentation?.slides[s.currentSlideIndex] ?? null

interface SelectionState extends CurrentSlideState {
    selectedShapeId: string | null
}

// The selected shape as the document holds it now. Derived rather than stored,
// so it can never describe the shape as it was before an edit; and it is the
// tree's own object, so a subscriber re-renders only when that shape changes.
export const selectSelectedShape = (s: SelectionState): Shape | null => {
    const slide = selectCurrentSlide(s)
    return slide && s.selectedShapeId !== null
        ? findShapeById(slide.shapes, s.selectedShapeId)?.shape ?? null
        : null
}

export type ContextBarType = 'none' | 'shape' | 'text' | 'group' | 'if-group' | 'for-group'

function contextBarFor(type: Shape['type'] | ToolType): ContextBarType {
    switch (type) {
        case 'rectangle':
        case 'ellipse':
            return 'shape'
        case 'text':
        case 'group':
        case 'if-group':
        case 'for-group':
            return type
        default:
            return 'none'
    }
}

// Which context bar the top bar shows: the drawing tool's while one is active,
// otherwise the selected shape's.
export const selectContextBar = (s: SelectionState & { selectedTool: ToolType }): ContextBarType => {
    if (s.selectedTool !== 'move') return contextBarFor(s.selectedTool)
    const shape = selectSelectedShape(s)
    return shape ? contextBarFor(shape.type) : 'none'
}

type HistoryAvailabilityState =
    Pick<HistorySlice, 'undoStack' | 'redoStack'> & Pick<TextEditorSlice, 'editor' | 'textHistory'>

// Whether undo and redo would do anything now, for the buttons. Same routing
// as `HistorySlice.undo` / `.redo`: the text being edited answers first.
export const selectCanUndo = (s: HistoryAvailabilityState): boolean =>
    (s.editor !== null && s.textHistory.undos > 0) || s.undoStack.length > 0

export const selectCanRedo = (s: HistoryAvailabilityState): boolean => {
    if (s.editor !== null) {
        if (s.textHistory.redos > 0) return true
        // Uncommitted typing holds the canvas redo stack back.
        if (s.textHistory.undos > 0) return false
    }
    return s.redoStack.length > 0
}
