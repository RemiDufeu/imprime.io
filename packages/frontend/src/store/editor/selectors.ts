import type { Presentation, Slide } from '@imprime/sdk'
import type { HistorySlice } from './HistorySlice'
import type { RichTextEditorSlice } from './RichTextEditorSlice'

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

type HistoryAvailabilityState =
    Pick<HistorySlice, 'undoStack' | 'redoStack'> & Pick<RichTextEditorSlice, 'editor' | 'textHistory'>

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
