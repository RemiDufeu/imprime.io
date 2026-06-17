import { presentationsAPI } from '../../api/api'
import type { Presentation, Slide } from '@imprime/sdk'
import type { StateCreator } from 'zustand'

export interface PresentationSlice {
  presentation: Presentation | null
  isLoading: boolean
  error: string | null

  loadPresentation: (id: string) => Promise<void>
  updatePresentationTitle: (title: string) => Promise<void>
  reorderSlides: (slides: Slide[]) => Promise<void>
}

export const createPresentationSlice: StateCreator<
  PresentationSlice,
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
    } catch (err) {
      set({ error: 'Failed to load presentation' })
    } finally {
      set({ isLoading: false })
    }
  },

  updatePresentationTitle: async (title: string) => {
    const { presentation } = get()
    if (!presentation) return

    try {
      const updated = await presentationsAPI.update(presentation._id, { title })
      set({ presentation: updated })
    } catch (err) {
      set({ error: 'Failed to update title' })
    }
  },

  reorderSlides: async (slides: Slide[]) => {
    const { presentation } = get()
    if (!presentation) return

    try {
      const updated = await presentationsAPI.update(presentation._id, { slides })
      set({ presentation: updated })
    } catch (err) {
      set({ error: 'Failed to reorder slides' })
    }
  },
})
