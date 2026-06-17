import { variablesAPI } from '../../api/api'
import type { VariableData, VariableDTO } from '@imprime/sdk'
import type { StateCreator } from 'zustand'
import type { PresentationSlice } from './PresentationSlice'
import { message } from 'antd'

export interface VariableSlice {
  isLoadingVariables: boolean
  variableError: string | null

  createVariable: (variable: VariableDTO.Create) => Promise<VariableData[]>
  updateVariable: (variableId: string, updates: VariableDTO.Update) => Promise<void>
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
    if (!presentation) return

    set({ isLoadingVariables: true, variableError: null })

    try {
      const result = await variablesAPI.update(presentation._id, variableId, updates)

      set({
        presentation: {
          ...presentation,
          variableData: result.variables,
        },
      })
    } catch (err) {
      set({ variableError: 'Failed to update variable' })
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
    } catch (err : any) {
      let errorCode: string | undefined
      let errorMessage = 'Failed to delete variable'

      if (err?.message) {
        try {
          const jsonMatch = err.message.match(/\{.*\}/)
          if (jsonMatch) {
            const errorData = JSON.parse(jsonMatch[0])
            errorCode = errorData.code
            errorMessage = errorData.error || errorMessage
          }
        } catch (parseError) {
          errorMessage = err.message
        }
      }

      set({ variableError: errorMessage })

      if (errorCode === 'VARIABLE_IN_USE') {
        message.error('Variable used in the template')
      } else {
        message.error('Failed to delete variable')
      }
    } finally {
      set({ isLoadingVariables: false })
    }
  },
})
