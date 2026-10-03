import type { StateCreator } from 'zustand'
import type { PresentationSlice } from './PresentationSlice'
import type { SlideSlice } from './SlideSlice'
import type { TextEditorSlice } from './TextEditorSlice'
import { findShapeById } from '../../utils/shapeTree'
import { selectCurrentSlide } from './selectors'

/**
 * Which shape of the slide on screen is selected — by id only. What it is now
 * comes from `selectSelectedShape`, and which context bar it gets from
 * `selectContextBar`: both read the tree, so neither can go stale.
 */
export interface SelectionSlice {
    selectedShapeId: string | null
    // Any selection change ends text editing, committing the typing: the box
    // being edited is the one losing the selection, or about to be edited
    // afresh. An id not on the slide on screen selects nothing.
    selectShape: (id: string | null) => void
}

export const createSelectionSlice: StateCreator<
    SelectionSlice & PresentationSlice & SlideSlice & TextEditorSlice,
    [],
    [],
    SelectionSlice
> = (set, get) => ({
    selectedShapeId: null,

    selectShape: (id) => {
        get().endTextSession()
        const slide = selectCurrentSlide(get())
        const found = id !== null && slide !== null && findShapeById(slide.shapes, id) !== null
        set({ selectedShapeId: found ? id : null })
    },
})
