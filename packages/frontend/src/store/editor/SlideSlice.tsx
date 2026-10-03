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
    // Fire-and-forget; saves of one slide reach the server one at a time, in
    // order, and only the latest tree waiting is sent.
    _saveSlide: (slideId: string, shapes: Shape[]) => void
}

const MAX_SAVE_RETRIES = 2
const SAVE_RETRY_BASE_MS = 1000

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export const createSlideSlice: StateCreator<
    SlideSlice & PresentationSlice & ShapeSlice & HistorySlice,
    [],
    [],
    SlideSlice
> = (set, get) => {
    // The server reads a slide, replaces its tree and writes it back, with no
    // check that nothing changed in between: two saves of one slide in flight
    // can land in either order and leave the older tree — delete an image,
    // undo at once, and the image is gone on reload. So a slide has at most
    // one save out. Present in the map = a save is out; the value is the tree
    // to send once it is back (null: nothing newer yet).
    const pendingSaves = new Map<string, { presentationId: string; shapes: Shape[] } | null>()

    // Removed from the open presentation since (or undone): nothing to save to.
    // A slide of a presentation no longer open is saved all the same.
    const isGone = (presentationId: string, slideId: string) => {
        const { presentation } = get()
        return presentation?._id === presentationId && !presentation.slides.some(slide => slide._id === slideId)
    }

    const send = async (slideId: string, presentationId: string, shapes: Shape[]) => {
        for (let attempt = 0; !isGone(presentationId, slideId); attempt++) {
            try {
                await presentationsAPI.updateSlide(presentationId, slideId, shapes)
                return
            } catch {
                // A newer tree is waiting, or arrives during the back-off: it
                // replaces this one, so no retry.
                if (pendingSaves.get(slideId)) return
                if (attempt >= MAX_SAVE_RETRIES) {
                    set({ error: 'Failed to save changes after multiple attempts' })
                    return
                }
                await sleep(SAVE_RETRY_BASE_MS * 2 ** attempt)
                if (pendingSaves.get(slideId)) return
            }
        }
    }

    const drain = async (slideId: string) => {
        for (let next = pendingSaves.get(slideId); next; next = pendingSaves.get(slideId)) {
            pendingSaves.set(slideId, null)
            await send(slideId, next.presentationId, next.shapes)
        }
        pendingSaves.delete(slideId)
    }

    return {
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
        _saveSlide: (slideId: string, shapes: Shape[]) => {
            const { presentation } = get()
            if (!presentation) return
            const sending = pendingSaves.has(slideId)
            pendingSaves.set(slideId, { presentationId: presentation._id, shapes })
            if (!sending) void drain(slideId)
        },
    }
}

