import { presentationsAPI } from '../../api/api'
import type { Presentation } from '@imprime/sdk'
import type { StateCreator } from 'zustand'
import type { HistorySlice } from './HistorySlice'
import type { SlideSlice } from './SlideSlice'
import type { SelectionSlice } from './SelectionSlice'
import type { TextEditorSlice } from './TextEditorSlice'
import type { VariableSlice } from './VariableSlice'

export interface PresentationSlice {
  presentation: Presentation | null
  isLoading: boolean
  error: string | null

  loadPresentation: (id: string) => Promise<void>
  updatePresentationTitle: (title: string) => Promise<void>
  // The half undo and redo replay, unrecorded. Writes the title alone, never
  // the server's copy of the presentation: that would overwrite shape edits
  // still being saved.
  _saveTitle: (title: string) => Promise<void>
}

export const createPresentationSlice: StateCreator<
  PresentationSlice & HistorySlice & SlideSlice & SelectionSlice & TextEditorSlice & VariableSlice,
  [],
  [],
  PresentationSlice
> = (set, get) => ({
  presentation: null,
  isLoading: false,
  error: null,

  loadPresentation: async (id: string) => {
    // Typing in progress belongs to the presentation being left: committed
    // now, while it is still the one in the store.
    get().endTextSession()
    set({ isLoading: true, error: null })

    try {
      const data = await presentationsAPI.getById(id)
      // Everything that pointed into the previous presentation goes: a slide
      // index past this one's last slide shows nothing at all, and a selection
      // or a variable form would name what is not here. The clipboard stays —
      // a paste binds its variables to this presentation.
      set({
        presentation: data,
        currentSlideIndex: 0,
        selectedShapeId: null,
        variableForm: null,
        variablesPanelOpen: false,
      })
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

  _saveTitle: async (title: string) => {
    const { presentation } = get()
    if (!presentation) return
    await presentationsAPI.update(presentation._id, { title })
    const current = get().presentation
    if (current) set({ presentation: { ...current, title } })
  },
})
