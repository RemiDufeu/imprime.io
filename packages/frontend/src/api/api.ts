import { ImprimeClient } from '@imprime/sdk'
import type { Presentation, PresentationSummary, Shape, ImageDTO, VariableDTO } from '@imprime/sdk'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

// Create a single SDK client instance
const client = new ImprimeClient({
  baseUrl: API_BASE_URL,
})

/**
 * Presentations API using Imprime SDK
 *
 * This module provides a thin wrapper around the Imprime SDK
 * to maintain compatibility with existing frontend code.
 */
export const presentationsAPI = {
  async getAll(): Promise<PresentationSummary[]> {
    return client.listPresentations()
  },

  async getById(id: string): Promise<Presentation> {
    return client.getPresentation(id)
  },

  async create(title?: string): Promise<Presentation> {
    return client.createPresentation(title)
  },

  async update(id: string, data: Partial<Presentation>): Promise<Presentation> {
    return client.updatePresentation(id, data)
  },

  async delete(id: string): Promise<void> {
    return client.deletePresentation(id)
  },

  async updateSlide(presentationId: string, slideId: string, shapes: Shape[]): Promise<void> {
    return client.updateSlide(presentationId, slideId, shapes)
  },

  async addSlide(presentationId: string): Promise<void> {
    return client.addSlide(presentationId)
  },

  async deleteSlide(presentationId: string, slideId: string): Promise<void> {
    return client.deleteSlide(presentationId, slideId)
  },

  async exportToPDF(presentationId: string, variableValues?: Record<string, string>): Promise<Blob> {
    return client.exportToPDF(presentationId, variableValues)
  },

  async downloadPDF(presentationId: string, filename?: string, variableValues?: Record<string, string>): Promise<void> {
    return client.downloadPDF(presentationId, filename, variableValues)
  },
}

/**
 * Images API using Imprime SDK
 */
export const imagesAPI = {
  async upload(data: string, mimeType: string, originalName?: string): Promise<ImageDTO.Response> {
    return client.uploadImage(data, mimeType, originalName)
  },

  async getById(imageId: string): Promise<ImageDTO.ResponseWithData> {
    return client.getImage(imageId)
  },
}

/**
 * Variables API using Imprime SDK
 */
export const variablesAPI = {
  async getAll(presentationId: string): Promise<VariableDTO.List> {
    return client.listVariables(presentationId)
  },

  async create(presentationId: string, variable: VariableDTO.Create): Promise<VariableDTO.List> {
    return client.createVariable(presentationId, variable)
  },

  async update(presentationId: string, variableId: string, updates: VariableDTO.Update): Promise<VariableDTO.List> {
    return client.updateVariable(presentationId, variableId, updates)
  },

  async delete(presentationId: string, variableId: string): Promise<VariableDTO.List> {
    return client.deleteVariable(presentationId, variableId)
  },
}

// Export the SDK client for advanced usage
export { client as imprimeClient }
