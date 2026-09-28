import { variablesAPI } from '../../api/api'
import type { VariableData, VariableDTO } from '@imprime/sdk'
import type { StateCreator } from 'zustand'
import type { PresentationSlice } from './PresentationSlice'
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
}

type StoreWithPresentation = VariableSlice & PresentationSlice

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

      set({
        presentation: {
          ...presentation,
          variableData: result.variables,
        },
      })
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

    try {
      const result = await variablesAPI.update(presentation._id, variableId, updates)

      set({
        presentation: {
          ...presentation,
          variableData: result.variables,
        },
      })
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

    try {
      const result = await variablesAPI.delete(presentation._id, variableId)

      set({
        presentation: {
          ...presentation,
          variableData: result.variables,
        },
      })
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
})
