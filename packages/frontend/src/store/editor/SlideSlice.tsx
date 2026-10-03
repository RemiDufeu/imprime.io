import type { Shape, Slide } from "@imprime/sdk"
import type { StateCreator } from "zustand"
import type { PresentationSlice } from "./PresentationSlice"
import { presentationsAPI } from "../../api/api"
import type { ShapeSlice } from "./ShapeSlice"
import type { HistorySlice } from "./HistorySlice"
import { reflowGroups } from "../../utils/groupLayout"

// What a shape write tells the history about itself.
export interface HistoryHint {
    // Successive writes sharing this key, close together, undo as one step.
    mergeKey?: string
    // The shape undo selects again; defaults to the current selection.
    selection?: string
}

export interface SlideSlice {
    currentSlideIndex: number
    addSlide: (afterIndex?: number) => Promise<void>
    deleteSlide: (slideId: string) => Promise<void>
    selectSlide: (index: number) => void
    updateSlideShapes: (slideId: string, shapes: Shape[], hint?: HistoryHint) => void
    // The halves of add and delete that undo and redo replay, unrecorded.
    // Given a slide, `_insertSlide` recreates that one: same id, same shapes.
    _insertSlide: (index: number, slide?: Slide) => Promise<Slide>
    _removeSlide: (slideId: string) => Promise<void>
    // Set and save without recording: the path undo and redo replay through.
    _writeSlideShapes: (slideId: string, shapes: Shape[]) => void
    _saveSlide: (slideId: string, shapes: Shape[], retryCount?: number) => Promise<void>
}

export const createSlideSlice: StateCreator<
    SlideSlice & PresentationSlice & ShapeSlice & HistorySlice,
    [],
    [],
    SlideSlice
> = (set, get) => ({
    currentSlideIndex: 0,
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
        set({ presentation: { ...current, slides }, currentSlideIndex: at, selectedShape: null })
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
        set(index === currentSlideIndex
            ? { presentation: { ...current, slides }, currentSlideIndex: Math.min(index, slides.length - 1), selectedShape: null }
            : { presentation: { ...current, slides }, currentSlideIndex: index < currentSlideIndex ? currentSlideIndex - 1 : currentSlideIndex })
    },
    selectSlide: (index: number) => {
        set({ currentSlideIndex: index, selectedShape: null })
    },
    updateSlideShapes: (slideId: string, shapes: Shape[], hint?: HistoryHint) => {
        const { presentation, selectedShape, _recordHistory, _writeSlideShapes } = get()
        if (!presentation) return
        const previous = presentation.slides.find(slide => slide._id === slideId)?.shapes
        if (!previous) return
        // Groups with an active layout are re-laid-out before the write, so
        // every consumer downstream reads final, real shape positions
        // (rendering, hit-testing, selection).
        const reflowed = reflowGroups(shapes)

        _recordHistory({
            kind: 'shapes',
            slideId,
            shapes: previous,
            selection: hint?.selection ?? selectedShape?.id ?? null,
        }, hint?.mergeKey)
        _writeSlideShapes(slideId, reflowed)
    },
    _writeSlideShapes: (slideId: string, shapes: Shape[]) => {
        const { presentation, _saveSlide } = get()
        if (!presentation) return

        set({
            presentation: {
                ...presentation,
                slides: presentation.slides.map((slide) =>
                    slide._id === slideId ? { ...slide, shapes } : slide
                ),
            },
        })

        _saveSlide(slideId, shapes)
    },
    _saveSlide: async (slideId: string, shapes: Shape[], retryCount = 0) => {
        const { presentation } = get()
        if (!presentation) return
        // Deleted since (or undone): there is nothing left to save to.
        if (!presentation.slides.some(slide => slide._id === slideId)) return

        const MAX_RETRIES = 2
        const RETRY_DELAY = 1000 * Math.pow(2, retryCount)

        try {
            await presentationsAPI.updateSlide(presentation._id, slideId, shapes)
        } catch {
            if (retryCount < MAX_RETRIES) {
                setTimeout(() => {
                    get()._saveSlide(slideId, shapes, retryCount + 1)
                }, RETRY_DELAY)
            } else {
                set({ error: 'Failed to save changes after multiple attempts' })
            }
        }
    },
})
