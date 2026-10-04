import type { Shape } from '@imprime/sdk'
import type { StateCreator } from 'zustand'
import type { PresentationSlice } from './PresentationSlice'
import type { SlideSlice } from './SlideSlice'
import type { SelectionSlice } from './SelectionSlice'
import type { HistorySlice } from './HistorySlice'
import { presentationsAPI } from '../../api/api'
import { reflowGroups } from '../../utils/groupLayout'
import { selectCurrentSlide } from './selectors'

// What a shape write tells the history about itself.
export interface HistoryHint {
    // Successive writes sharing this key, close together, undo as one step.
    mergeKey?: string
    // The shape undo selects again; defaults to the current selection.
    selection?: string
}

/**
 * The single path every shape tree takes to the document: reflow, record for
 * undo, set, save. Shape actions compute a tree and hand it here; none of them
 * touches the API or the presentation directly.
 */
export interface DocumentWriteSlice {
    updateSlideShapes: (slideId: string, shapes: Shape[], hint?: HistoryHint) => void
    // The read-transform-write every shape action is: `transform` gets the
    // slide's shapes and returns the new tree, or null to leave it alone. The
    // slide on screen unless `slideId` names another.
    _editSlide: (transform: (shapes: Shape[]) => Shape[] | null, options?: HistoryHint & { slideId?: string }) => void
    // Set and save without recording: the path undo and redo replay through.
    _writeSlideShapes: (slideId: string, shapes: Shape[]) => void
    // Fire-and-forget; saves of one slide reach the server one at a time, in
    // order, and only the latest tree waiting is sent.
    _saveSlide: (slideId: string, shapes: Shape[]) => void
}

const MAX_SAVE_RETRIES = 2
const SAVE_RETRY_BASE_MS = 1000

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export const createDocumentWriteSlice: StateCreator<
    DocumentWriteSlice & PresentationSlice & SlideSlice & SelectionSlice & HistorySlice,
    [],
    [],
    DocumentWriteSlice
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
        updateSlideShapes: (slideId: string, shapes: Shape[], hint?: HistoryHint) => {
            const { presentation, selectedShapeId, _recordHistory, _writeSlideShapes } = get()
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
                selection: hint?.selection ?? selectedShapeId,
            }, hint?.mergeKey)
            _writeSlideShapes(slideId, reflowed)
        },

        _editSlide: (transform, options) => {
            const { presentation, updateSlideShapes } = get()
            if (!presentation) return
            const slide = options?.slideId !== undefined
                ? presentation.slides.find(s => s._id === options.slideId)
                : selectCurrentSlide(get())
            if (!slide) return
            const next = transform(slide.shapes)
            if (next) updateSlideShapes(slide._id, next, options)
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
