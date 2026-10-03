import { presentationsAPI } from '../../api/api'
import type { Presentation, Slide } from '@imprime/sdk'
import type { StateCreator } from 'zustand'
import type { HistorySlice } from './HistorySlice'
import type { SlideSlice } from './SlideSlice'

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

export interface PresentationSlice {
  presentation: Presentation | null
  isLoading: boolean
  error: string | null

  loadPresentation: (id: string) => Promise<void>
  updatePresentationTitle: (title: string) => Promise<void>
  reorderSlides: (slides: Slide[]) => Promise<void>
  // The halves undo and redo replay, unrecorded. Neither takes the server's
  // copy of the presentation back: it would overwrite shape edits still
  // being saved.
  _saveTitle: (title: string) => Promise<void>
  _applySlideOrder: (slideIds: string[]) => Promise<void>
}

export const createPresentationSlice: StateCreator<
  PresentationSlice & HistorySlice & SlideSlice,
  [],
  [],
  PresentationSlice
> = (set, get) => ({
  presentation: null,
  isLoading: false,
  error: null,

  loadPresentation: async (id: string) => {
    set({ isLoading: true, error: null })

    try {
      const data = await presentationsAPI.getById(id)
      set({ presentation: data })
      // Steps recorded on another presentation cannot be replayed on this one.
      get().clearHistory()
    } catch {
      set({ error: 'Failed to load presentation' })
    } finally {
      set({ isLoading: false })
    }
  },

  updatePresentationTitle: async (title: string) => {
    const { presentation, _saveTitle, _recordHistory } = get()
    if (!presentation || title === presentation.title) return
    const previous = presentation.title

    try {
      await _saveTitle(title)
      _recordHistory({ kind: 'title', title: previous })
    } catch {
      set({ error: 'Failed to update title' })
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

  _saveTitle: async (title: string) => {
    const { presentation } = get()
    if (!presentation) return
    await presentationsAPI.update(presentation._id, { title })
    const current = get().presentation
    if (current) set({ presentation: { ...current, title } })
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
