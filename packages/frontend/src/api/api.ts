import { ImprimeClient } from '@imprime/sdk'
import type { Presentation, PresentationSummary, Shape, Slide, SlideDTO, ImageDTO, FontDTO, FontVariant, VariableDTO, VariableValueType, EmailSettingsDTO, SsoSettingsDTO, SsoProvider, AccessSettingsDTO } from '@imprime/sdk'
import { API_BASE } from '../config'

// Create a single SDK client instance
const client = new ImprimeClient({
  baseUrl: API_BASE,
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

  async addSlide(presentationId: string, slide?: SlideDTO.Create): Promise<Slide> {
    return client.addSlide(presentationId, slide)
  },

  async deleteSlide(presentationId: string, slideId: string): Promise<void> {
    return client.deleteSlide(presentationId, slideId)
  },

  async exportToPDF(presentationId: string, variableValues?: Record<string, VariableValueType>): Promise<Blob> {
    return client.exportToPDF(presentationId, variableValues)
  },

  async downloadPDF(presentationId: string, filename?: string, variableValues?: Record<string, VariableValueType>): Promise<void> {
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
 * Fonts API using Imprime SDK
 */
export const fontsAPI = {
  async list(): Promise<FontDTO.Response[]> {
    return client.listFonts()
  },

  async create(family: string, regular: FontDTO.FaceUpload): Promise<FontDTO.Response> {
    return client.createFont(family, regular)
  },

  async setFace(fontId: string, variant: FontVariant, face: FontDTO.FaceUpload): Promise<FontDTO.Response> {
    return client.setFontFace(fontId, variant, face)
  },

  async getFace(fontId: string, variant: FontVariant): Promise<FontDTO.FaceData> {
    return client.getFontFace(fontId, variant)
  },

  async deleteFace(fontId: string, variant: Exclude<FontVariant, 'regular'>): Promise<FontDTO.Response> {
    return client.deleteFontFace(fontId, variant)
  },

  async delete(fontId: string): Promise<void> {
    return client.deleteFont(fontId)
  },
}

/**
 * Instance settings API using Imprime SDK (admins only)
 */
export const settingsAPI = {
  async getEmail(): Promise<EmailSettingsDTO.Response> {
    return client.getEmailSettings()
  },

  async updateEmail(settings: EmailSettingsDTO.Update): Promise<EmailSettingsDTO.Response> {
    return client.updateEmailSettings(settings)
  },

  async sendTestEmail(request: EmailSettingsDTO.TestRequest): Promise<void> {
    return client.sendTestEmail(request)
  },

  async getAccess(): Promise<AccessSettingsDTO.Response> {
    return client.getAccessSettings()
  },

  async updateAccess(settings: AccessSettingsDTO.Update): Promise<AccessSettingsDTO.Response> {
    return client.updateAccessSettings(settings)
  },

  async getSso(): Promise<SsoSettingsDTO.Response> {
    return client.getSsoSettings()
  },

  async updateSsoProvider(provider: SsoProvider, data: SsoSettingsDTO.ProviderUpdate): Promise<SsoSettingsDTO.ProviderStatus> {
    return client.updateSsoProvider(provider, data)
  },

  async removeSsoProvider(provider: SsoProvider): Promise<SsoSettingsDTO.ProviderStatus> {
    return client.removeSsoProvider(provider)
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
