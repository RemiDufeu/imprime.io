import type { Slide } from "@imprime/sdk"
import type { StateCreator } from "zustand"
import type { PresentationSlice } from "./PresentationSlice"
import type { HistorySlice } from "./HistorySlice"
import type { TextEditorSlice } from "./TextEditorSlice"
import type { SelectionSlice } from "./SelectionSlice"
import { presentationsAPI } from "../../api/api"

// `slides` in the order of `slideIds`; slides the list leaves out keep their
// relative order, after it. `order` is rewritten to match.
function orderSlides(slides: Slide[], slideIds: string[]): Slide[] {
    const rank = (slide: Slide, index: number) => {
        const position = slideIds.indexOf(slide._id)
        return position === -1 ? slideIds.length + index : position
    }
    return slides
        .map((slide, index) => ({ slide, rank: rank(slide, index) }))
        .sort((a, b) => a.rank - b.rank)
        .map(({ slide }, order) => (slide.order === order ? slide : { ...slide, order }))
}

/**
 * The presentation's slides as a set: which one is on screen, and adding,
 * deleting and reordering them. What a slide holds goes through
 * DocumentWriteSlice.
 */
export interface SlideSlice {
    currentSlideIndex: number
    // Ends any text editing (committing it) and clears the selection, which
    // belongs to the slide being left.
    selectSlide: (index: number) => void
    addSlide: (afterIndex?: number) => Promise<void>
    deleteSlide: (slideId: string) => Promise<void>
    reorderSlides: (slides: Slide[]) => Promise<void>
    // The halves undo and redo replay, unrecorded. Given a slide,
    // `_insertSlide` recreates that one: same id, same shapes. None of them
    // takes the server's copy of the presentation back: it would overwrite
    // shape edits still being saved.
    _insertSlide: (index: number, slide?: Slide) => Promise<Slide>
    _removeSlide: (slideId: string) => Promise<void>
    _applySlideOrder: (slideIds: string[]) => Promise<void>
}

export const createSlideSlice: StateCreator<
    SlideSlice & PresentationSlice & HistorySlice & TextEditorSlice & SelectionSlice,
    [],
    [],
    SlideSlice
> = (set, get) => ({
    currentSlideIndex: 0,

    selectSlide: (index: number) => {
        get().endTextSession()
        set({ currentSlideIndex: index, selectedShapeId: null })
    },

    addSlide: async (afterIndex?: number) => {
        const { presentation, _insertSlide, _recordHistory } = get()
        if (!presentation) return

        try {
            const slide = await _insertSlide(afterIndex === undefined ? presentation.slides.length : afterIndex + 1)
            _recordHistory({ kind: 'slide', slideId: slide._id, snapshot: null })
        } catch {
            set({ error: 'Failed to add slide' })
        }
    },

    deleteSlide: async (slideId: string) => {
        const { presentation, _removeSlide, _recordHistory } = get()
        if (!presentation) return
        const index = presentation.slides.findIndex(slide => slide._id === slideId)
        if (index === -1) return
        const slide = presentation.slides[index]

        try {
            await _removeSlide(slideId)
            _recordHistory({ kind: 'slide', slideId, snapshot: { slide, index } })
        } catch {
            set({ error: 'Failed to delete slide' })
        }
    },

    reorderSlides: async (slides: Slide[]) => {
        const { presentation, _applySlideOrder, _recordHistory } = get()
        if (!presentation) return
        const previous = presentation.slides.map(slide => slide._id)

        try {
            await _applySlideOrder(slides.map(slide => slide._id))
            _recordHistory({ kind: 'slide-order', slideIds: previous })
        } catch {
            set({ error: 'Failed to reorder slides' })
        }
    },

    _insertSlide: async (index: number, slide?: Slide) => {
        const { presentation } = get()
        if (!presentation) throw new Error('No presentation loaded')

        const created = await presentationsAPI.addSlide(presentation._id, slide
            ? { _id: slide._id, order: index, shapes: slide.shapes }
            : { order: index })

        // Read again: the document may have changed during the request.
        const current = get().presentation
        if (!current) return created
        const at = Math.min(index, current.slides.length)
        const slides = [...current.slides.slice(0, at), created, ...current.slides.slice(at)]
        get().endTextSession()
        set({ presentation: { ...current, slides }, currentSlideIndex: at, selectedShapeId: null })
        return created
    },

    _removeSlide: async (slideId: string) => {
        const { presentation } = get()
        if (!presentation) return

        await presentationsAPI.deleteSlide(presentation._id, slideId)

        const current = get().presentation
        if (!current) return
        const index = current.slides.findIndex(slide => slide._id === slideId)
        if (index === -1) return
        const slides = current.slides.filter(slide => slide._id !== slideId)
        const { currentSlideIndex } = get()
        // Stay on the slide that was showing; when that is the one removed,
        // show its neighbour.
        if (index === currentSlideIndex) {
            get().endTextSession()
            set({ presentation: { ...current, slides }, currentSlideIndex: Math.min(index, slides.length - 1), selectedShapeId: null })
        } else {
            set({ presentation: { ...current, slides }, currentSlideIndex: index < currentSlideIndex ? currentSlideIndex - 1 : currentSlideIndex })
        }
    },

    _applySlideOrder: async (slideIds: string[]) => {
        const { presentation, currentSlideIndex } = get()
        if (!presentation) return

        const slides = orderSlides(presentation.slides, slideIds)
        const showing = presentation.slides[currentSlideIndex]?._id

        // Applied at once, so a dragged slide does not jump back while the
        // request runs; undone if the request fails.
        set({
            presentation: { ...presentation, slides },
            currentSlideIndex: Math.max(0, slides.findIndex(slide => slide._id === showing)),
        })
        try {
            await presentationsAPI.update(presentation._id, { slides })
        } catch (err) {
            const current = get().presentation
            if (current) {
                const restored = orderSlides(current.slides, presentation.slides.map(slide => slide._id))
                set({
                    presentation: { ...current, slides: restored },
                    currentSlideIndex: Math.max(0, restored.findIndex(slide => slide._id === showing)),
                })
            }
            throw err
        }
    },
})
