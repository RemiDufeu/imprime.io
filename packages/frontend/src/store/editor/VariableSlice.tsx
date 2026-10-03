import { variablesAPI } from '../../api/api'
import type { VariableData, VariableDTO } from '@imprime/sdk'
import type { StateCreator } from 'zustand'
import type { PresentationSlice } from './PresentationSlice'
import type { HistorySlice } from './HistorySlice'
import { parseApiError } from '../../utils/apiError'
import { message } from 'antd'

// Which definition the create/edit form is open on.
export type VariableFormTarget = { mode: 'create' } | { mode: 'edit'; variableId: string }

export interface VariableSlice {
  isLoadingVariables: boolean
  variableError: string | null

  // The browse panel and the form are two surfaces, and the form outlives the
  // panel: it is a modal owned by the header, because rc-dropdown closes its
  // popup on Tab (`hooks/useAccessibility`) and took a half-typed definition
  // with it. Both flags live here so neither surface has to be handed a
  // callback to drive the other.
  variablesPanelOpen: boolean
  variableForm: VariableFormTarget | null
  setVariablesPanelOpen: (open: boolean) => void
  openVariableForm: (target: VariableFormTarget) => void
  closeVariableForm: () => void

  createVariable: (variable: VariableDTO.Create) => Promise<VariableData[]>
  updateVariable: (variableId: string, updates: VariableDTO.Update) => Promise<VariableData[]>
  deleteVariable: (variableId: string) => Promise<void>
  // Bring a variable to `snapshot`, unrecorded: what undo and redo replay.
  // Null deletes it; a variable that is gone is created again under its id.
  _restoreVariable: (variableId: string, snapshot: VariableData | null) => Promise<void>
  _setVariables: (variables: VariableData[]) => void
}

type StoreWithPresentation = VariableSlice & PresentationSlice & HistorySlice

export const createVariableSlice: StateCreator<
  StoreWithPresentation,
  [],
  [],
  VariableSlice
> = (set, get) => ({
  isLoadingVariables: false,
  variableError: null,

  variablesPanelOpen: false,
  variableForm: null,

  setVariablesPanelOpen: (open) => set({ variablesPanelOpen: open }),

  // One action for the whole transition, so no caller can open the form and
  // leave the panel sitting behind the modal's mask.
  openVariableForm: (target) => set({ variableForm: target, variablesPanelOpen: false }),

  closeVariableForm: () => set({ variableForm: null }),

  createVariable: async (variable) => {
    const { presentation } = get()
    if (!presentation) return []

    set({ isLoadingVariables: true, variableError: null })

    try {
      const result = await variablesAPI.create(presentation._id, variable)

      get()._setVariables(result.variables)
      const created = result.variables.find(v => v.name === variable.name)
      if (created) get()._recordHistory({ kind: 'variable', variableId: created._id, snapshot: null })
    } catch (err) {
      set({ variableError: 'Failed to create variable' })
      throw err
    } finally {
      set({ isLoadingVariables: false })
    }

    const { presentation : presentationAfter } = get()
    return presentationAfter?.variableData ?? []
  },

  updateVariable: async (variableId: string, updates: VariableDTO.Update) => {
    const { presentation } = get()
    if (!presentation) return []

    set({ isLoadingVariables: true, variableError: null })
    const previous = presentation.variableData?.find(v => v._id === variableId) ?? null

    try {
      const result = await variablesAPI.update(presentation._id, variableId, updates)

      get()._setVariables(result.variables)
      get()._recordHistory({ kind: 'variable', variableId, snapshot: previous })
      return result.variables
    } catch (err) {
      // Rethrown so the form can attach a name conflict to its own field
      // instead of showing it as a detached toast.
      set({ variableError: parseApiError(err).message ?? 'Failed to update variable' })
      throw err
    } finally {
      set({ isLoadingVariables: false })
    }
  },

  deleteVariable: async (variableId: string) => {
    const { presentation } = get()
    if (!presentation) return

    set({ isLoadingVariables: true, variableError: null })
    const previous = presentation.variableData?.find(v => v._id === variableId) ?? null

    try {
      const result = await variablesAPI.delete(presentation._id, variableId)

      get()._setVariables(result.variables)
      get()._recordHistory({ kind: 'variable', variableId, snapshot: previous })
    } catch (err) {
      const { code, message: detail } = parseApiError(err)

      set({ variableError: detail ?? 'Failed to delete variable' })

      if (code === 'VARIABLE_IN_USE') {
        message.error('Variable used in the template')
      } else {
        message.error('Failed to delete variable')
      }
    } finally {
      set({ isLoadingVariables: false })
    }
  },

  _restoreVariable: async (variableId, snapshot) => {
    const { presentation } = get()
    if (!presentation) return
    const current = presentation.variableData?.find(v => v._id === variableId)

    let result: VariableDTO.List
    if (!snapshot) {
      if (!current) return
      result = await variablesAPI.delete(presentation._id, variableId)
    } else {
      const { _id, ...definition } = snapshot
      result = current
        // Every field, so the update leaves nothing of the newer definition.
        ? await variablesAPI.update(presentation._id, variableId, { ...definition, default: definition.default ?? null })
        : await variablesAPI.create(presentation._id, { ...definition, _id })
    }

    get()._setVariables(result.variables)
  },

  _setVariables: (variables) => {
    // Read again rather than reuse the presentation from before the request:
    // shape edits made meanwhile would be lost.
    const current = get().presentation
    if (current) set({ presentation: { ...current, variableData: variables } })
  },
})
