import { templatesAPI } from '../../api/api'
import type { Template } from '@imprime/sdk'
import type { StateCreator } from 'zustand'
import type { HistorySlice } from './HistorySlice'
import type { PageSlice } from './PageSlice'
import type { SelectionSlice } from './SelectionSlice'
import type { TextEditorSlice } from './TextEditorSlice'
import type { VariableSlice } from './VariableSlice'

export interface TemplateSlice {
  template: Template | null
  isLoading: boolean
  error: string | null

  loadTemplate: (id: string) => Promise<void>
  updateTemplateTitle: (title: string) => Promise<void>
  // The half undo and redo replay, unrecorded. Writes the title alone, never
  // the server's copy of the template: that would overwrite shape edits
  // still being saved.
  _saveTitle: (title: string) => Promise<void>
}

export const createTemplateSlice: StateCreator<
  TemplateSlice & HistorySlice & PageSlice & SelectionSlice & TextEditorSlice & VariableSlice,
  [],
  [],
  TemplateSlice
> = (set, get) => ({
  template: null,
  isLoading: false,
  error: null,

  loadTemplate: async (id: string) => {
    // Typing in progress belongs to the template being left: committed
    // now, while it is still the one in the store.
    get().endTextSession()
    set({ isLoading: true, error: null })

    try {
      const data = await templatesAPI.getById(id)
      // Everything that pointed into the previous template goes: a page
      // index past this one's last page shows nothing at all, and a selection
      // or a variable form would name what is not here. The clipboard stays —
      // a paste binds its variables to this template.
      set({
        template: data,
        currentPageIndex: 0,
        selectedShapeId: null,
        variableForm: null,
        variablesPanelOpen: false,
      })
      // Steps recorded on another template cannot be replayed on this one.
      get().clearHistory()
    } catch {
      set({ error: 'Failed to load template' })
    } finally {
      set({ isLoading: false })
    }
  },

  updateTemplateTitle: async (title: string) => {
    const { template, _saveTitle, _recordHistory } = get()
    if (!template || title === template.title) return
    const previous = template.title

    try {
      await _saveTitle(title)
      _recordHistory({ kind: 'title', title: previous })
    } catch {
      set({ error: 'Failed to update title' })
    }
  },

  _saveTitle: async (title: string) => {
    const { template } = get()
    if (!template) return
    await templatesAPI.update(template._id, { title })
    const current = get().template
    if (current) set({ template: { ...current, title } })
  },
})
