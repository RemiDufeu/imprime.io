import type {
  Presentation,
  PresentationSummary,
  Slide,
  Shape,
  RectangleShape,
  EllipseShape,
  TextBoxShape,
  Paragraph,
  TextAlign,
  TextVerticalAlign,
  ListType,
  ImageShape,
  ImageDTO,
  FontDTO,
  FontVariant,
  PresentationDTO,
  SlideDTO,
  VariableDTO,
  VariableValueType,
  EnabledAuthProviders,
  OAuthConsentRequest,
  EmailSettingsDTO,
  SsoSettingsDTO,
  SsoProvider,
  AccessSettingsDTO,
} from '@imprime/common'

export interface ImprimeClientOptions {
  baseUrl?: string
  timeout?: number
  /**
   * Clé d'API pour l'accès programmatique (envoyée dans l'en-tête `x-api-key`).
   * Dans le navigateur, laissez vide : l'authentification passe par le cookie de session.
   */
  apiKey?: string
}

/**
 * TypeScript SDK for Imprime API
 *
 * Provides a type-safe client for creating and managing presentations programmatically.
 *
 * @example
 * ```typescript
 * const client = new ImprimeClient({ baseUrl: 'http://localhost:3023/api' })
 *
 * // Create a presentation
 * const presentation = await client.createPresentation('My Presentation')
 *
 * // Add a slide
 * const slide = await client.addSlide(presentation._id)
 *
 * // Add shapes
 * await client.addRectangle(presentation._id, slide._id, {
 *   x: 100, y: 100, width: 200, height: 100, fill: '#3b82f6'
 * })
 * ```
 */
export class ImprimeClient {
  private baseUrl: string
  private timeout: number
  private apiKey?: string

  constructor(options: ImprimeClientOptions = {}) {
    this.baseUrl = options.baseUrl!
    this.timeout = options.timeout || 30000
    this.apiKey = options.apiKey
  }

  /** En-têtes d'authentification (clé d'API si fournie). */
  private authHeaders(): Record<string, string> {
    return this.apiKey ? { 'x-api-key': this.apiKey } : {}
  }

  /**
   * Make an HTTP request to the Imprime API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...this.authHeaders(),
          ...options.headers,
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      // Handle empty responses (e.g., DELETE)
      if (response.status === 204 || response.headers.get('content-length') === '0') {
        return undefined as T
      }

      return response.json() as Promise<T>
    } finally {
      clearTimeout(timeoutId)
    }
  }

  // ============================================
  // Auth Operations
  // ============================================

  /**
   * Retourne les providers d'authentification activés côté serveur
   * (email/password + réseaux sociaux configurés).
   */
  async getAuthProviders(): Promise<EnabledAuthProviders> {
    return this.request<EnabledAuthProviders>('/auth-providers')
  }

  /**
   * The authorization an OAuth consent page asks the signed-in user to allow,
   * by the `consent_code` of its URL: the application's name and where the
   * access goes. Fails with 404 for an unknown, expired or someone else's code.
   */
  async getOAuthConsent(consentCode: string): Promise<OAuthConsentRequest> {
    return this.request<OAuthConsentRequest>(`/oauth-consent/${encodeURIComponent(consentCode)}`)
  }

  // ============================================
  // Presentation Operations
  // ============================================

  /**
   * List all presentations (light summary — no slides/variables)
   */
  async listPresentations(): Promise<PresentationSummary[]> {
    return this.request<PresentationSummary[]>('/presentations')
  }

  /**
   * Get a specific presentation by ID
   */
  async getPresentation(id: string): Promise<Presentation> {
    return this.request<Presentation>(`/presentations/${id}`)
  }

  /**
   * Create a new presentation
   */
  async createPresentation(title?: string): Promise<Presentation> {
    return this.request<Presentation>('/presentations', {
      method: 'POST',
      body: JSON.stringify({ title }),
    })
  }

  /**
   * Update a presentation (title and/or slides)
   */
  async updatePresentation(id: string, data: PresentationDTO.Update): Promise<Presentation> {
    return this.request<Presentation>(`/presentations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  /**
   * Delete a presentation
   */
  async deletePresentation(id: string): Promise<void> {
    return this.request<void>(`/presentations/${id}`, {
      method: 'DELETE',
    })
  }

  // ============================================
  // Slide Operations
  // ============================================

  /**
   * Add a slide to a presentation and return it: blank and last by default,
   * or at `slide.order` with `slide.shapes`. `slide._id` restores a deleted
   * slide under its former id.
   */
  async addSlide(presentationId: string, slide: SlideDTO.Create = {}): Promise<Slide> {
    return this.request<Slide>(`/presentations/${presentationId}/slides`, {
      method: 'POST',
      body: JSON.stringify(slide),
    })
  }

  /**
   * Update a slide's shapes. Fire-and-forget: the server returns 204 No Content,
   * callers are expected to apply the change optimistically client-side.
   */
  async updateSlide(presentationId: string, slideId: string, shapes: Shape[]): Promise<void> {
    return this.request<void>(`/presentations/${presentationId}/slides/${slideId}`, {
      method: 'PATCH',
      body: JSON.stringify({ shapes }),
    })
  }

  /**
   * Delete a slide from a presentation. Returns 204 — refetch the presentation to sync.
   */
  async deleteSlide(presentationId: string, slideId: string): Promise<void> {
    return this.request<void>(`/presentations/${presentationId}/slides/${slideId}`, {
      method: 'DELETE',
    })
  }

  // ============================================
  // Shape Operations (High-level helpers)
  // ============================================

  /**
   * Add a shape to a slide
   */
  async addShape(presentationId: string, slideId: string, shape: Shape): Promise<void> {
    const presentation = await this.getPresentation(presentationId)
    const slide = presentation.slides.find(s => s._id === slideId)

    if (!slide) {
      throw new Error(`Slide ${slideId} not found in presentation ${presentationId}`)
    }

    const updatedShapes = [...slide.shapes, shape]
    await this.updateSlide(presentationId, slideId, updatedShapes)
  }

  /**
   * Add a rectangle to a slide
   */
  async addRectangle(
    presentationId: string,
    slideId: string,
    options: {
      x: number
      y: number
      width: number
      height: number
      fill?: string
    }
  ): Promise<void> {
    const shape: RectangleShape = {
      id: `rectangle-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'rectangle',
      x: options.x,
      y: options.y,
      width: options.width,
      height: options.height,
      fill: options.fill || '#3b82f6',
    }
    return this.addShape(presentationId, slideId, shape)
  }

  /**
   * Add an ellipse/circle to a slide
   */
  async addEllipse(
    presentationId: string,
    slideId: string,
    options: {
      x: number
      y: number
      width: number
      height: number
      fill?: string
    }
  ): Promise<void> {
    const shape: EllipseShape = {
      id: `ellipse-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'ellipse',
      x: options.x,
      y: options.y,
      width: options.width,
      height: options.height,
      fill: options.fill || '#f59e0b',
    }
    return this.addShape(presentationId, slideId, shape)
  }

  /**
   * Add a text box to a slide. Each line of `text` becomes a paragraph (a list
   * item when `list` is set); the formatting options apply to all of them.
   */
  async addText(
    presentationId: string,
    slideId: string,
    options: {
      x: number
      y: number
      text: string
      width?: number
      height?: number
      fontSize?: number
      fontFamily?: string
      color?: string
      align?: TextAlign
      lineHeight?: number
      verticalAlign?: TextVerticalAlign
      list?: ListType
    }
  ): Promise<void> {
    const paragraphes: Paragraph[] = options.text.split('\n').map(line => ({
      type: 'paragraph',
      align: options.align,
      lineHeight: options.lineHeight,
      list: options.list,
      children: [{
        text: line,
        fontSize: options.fontSize !== undefined ? `${options.fontSize}px` : undefined,
        fontFamily: options.fontFamily,
        color: options.color,
      }],
    }))

    const shape: TextBoxShape = {
      id: `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'text',
      x: options.x, 
      y: options.y,
      width: options.width || 200,
      height: options.height || 50,
      verticalAlign: options.verticalAlign,
      paragraphes,
    }
    return this.addShape(presentationId, slideId, shape)
  }

  /**
   * Update a shape's properties
   */
  async updateShape(
    presentationId: string,
    slideId: string,
    shapeId: string,
    updates: Partial<Shape>
  ): Promise<void> {
    const presentation = await this.getPresentation(presentationId)
    const slide = presentation.slides.find(s => s._id === slideId)

    if (!slide) {
      throw new Error(`Slide ${slideId} not found in presentation ${presentationId}`)
    }

    const updatedShapes = slide.shapes.map(shape =>
      shape.id === shapeId ? { ...shape, ...updates } as Shape : shape
    )
    await this.updateSlide(presentationId, slideId, updatedShapes)
  }

  /**
   * Delete a shape from a slide
   */
  async deleteShape(presentationId: string, slideId: string, shapeId: string): Promise<void> {
    const presentation = await this.getPresentation(presentationId)
    const slide = presentation.slides.find(s => s._id === slideId)

    if (!slide) {
      throw new Error(`Slide ${slideId} not found in presentation ${presentationId}`)
    }

    const updatedShapes = slide.shapes.filter(s => s.id !== shapeId)
    await this.updateSlide(presentationId, slideId, updatedShapes)
  }

  // ============================================
  // Image Operations
  // ============================================

  /**
   * Upload an image (base64)
   * @param data - Base64 encoded image data
   * @param mimeType - MIME type (e.g., 'image/jpeg', 'image/png')
   * @param originalName - Original filename
   * @returns Image ID and metadata
   */
  async uploadImage(data: string, mimeType: string, originalName?: string): Promise<ImageDTO.Response> {
    return this.request<ImageDTO.Response>('/images', {
      method: 'POST',
      body: JSON.stringify({ data, mimeType, originalName }),
    })
  }

  /**
   * Get an image by ID
   * @param imageId - Image document ID
   * @returns Image data and metadata
   */
  async getImage(imageId: string): Promise<ImageDTO.ResponseWithData> {
    return this.request<ImageDTO.ResponseWithData>(`/images/${imageId}`)
  }

  /**
   * Add an image to a slide
   * @param presentationId - Presentation ID
   * @param slideId - Slide ID
   * @param options - Image options
   * @returns Updated presentation
   */
  async addImage(
    presentationId: string,
    slideId: string,
    options: {
      imageId: string
      x: number
      y: number
      width: number
      height: number
      alt?: string
    }
  ): Promise<void> {
    const shape: ImageShape = {
      id: `image-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'image',
      x: options.x,
      y: options.y,
      width: options.width,
      height: options.height,
      imageId: options.imageId,
      alt: options.alt,
    }
    return this.addShape(presentationId, slideId, shape)
  }

  // ============================================
  // Font Operations
  // ============================================

  /**
   * List the font families imported into the instance. A text run uses one by
   * setting `fontFamily` to its `family`.
   */
  async listFonts(): Promise<FontDTO.Response[]> {
    return this.request<FontDTO.Response[]>('/fonts')
  }

  /**
   * Import a font family with its regular face. Admin only.
   * @param family - Name runs will refer to it by; unique in the instance and
   *   distinct from the built-in fonts
   * @param regular - Base64 TrueType (.ttf) or OpenType (.otf) file
   */
  async createFont(family: string, regular: FontDTO.FaceUpload): Promise<FontDTO.Response> {
    return this.request<FontDTO.Response>('/fonts', {
      method: 'POST',
      body: JSON.stringify({ family, regular }),
    })
  }

  /**
   * Add or replace one face of an imported family. Admin only.
   * @param variant - 'regular' | 'bold' | 'italic' | 'boldItalic'
   */
  async setFontFace(fontId: string, variant: FontVariant, face: FontDTO.FaceUpload): Promise<FontDTO.Response> {
    return this.request<FontDTO.Response>(`/fonts/${fontId}/faces/${variant}`, {
      method: 'PUT',
      body: JSON.stringify(face),
    })
  }

  /**
   * Get the file of one face, base64-encoded
   */
  async getFontFace(fontId: string, variant: FontVariant): Promise<FontDTO.FaceData> {
    return this.request<FontDTO.FaceData>(`/fonts/${fontId}/faces/${variant}`)
  }

  /**
   * Remove an optional face; runs asking for it fall back to the closest face
   * left. The regular face cannot be removed. Admin only.
   */
  async deleteFontFace(fontId: string, variant: Exclude<FontVariant, 'regular'>): Promise<FontDTO.Response> {
    return this.request<FontDTO.Response>(`/fonts/${fontId}/faces/${variant}`, {
      method: 'DELETE',
    })
  }

  /**
   * Delete an imported family. Text using it, in every presentation, is drawn
   * in the default font. Admin only.
   */
  async deleteFont(fontId: string): Promise<void> {
    return this.request<void>(`/fonts/${fontId}`, {
      method: 'DELETE',
    })
  }

  // ============================================
  // Settings Operations
  // ============================================

  /**
   * Get the instance's email settings: its SMTP server, and whether accounts
   * must verify their address. The SMTP password is never returned. Admin only.
   */
  async getEmailSettings(): Promise<EmailSettingsDTO.Response> {
    return this.request<EmailSettingsDTO.Response>('/settings/email')
  }

  /**
   * Replace the instance's email settings. They apply at once, without a
   * restart. Omit `smtp.password` to keep the stored one (same user only). Admin only.
   */
  async updateEmailSettings(settings: EmailSettingsDTO.Update): Promise<EmailSettingsDTO.Response> {
    return this.request<EmailSettingsDTO.Response>('/settings/email', {
      method: 'PUT',
      body: JSON.stringify(settings),
    })
  }

  /**
   * Send a test email through `request.smtp`, or through the stored server
   * when it is omitted. Nothing is saved. Admin only.
   */
  async sendTestEmail(request: EmailSettingsDTO.TestRequest): Promise<void> {
    return this.request<void>('/settings/email/test', {
      method: 'POST',
      body: JSON.stringify(request),
    })
  }

  /**
   * Get the instance's single sign-on providers: for each, the callback URL to
   * register with the provider and the stored application, if any. Client
   * secrets are never returned. Admin only.
   */
  async getSsoSettings(): Promise<SsoSettingsDTO.Response> {
    return this.request<SsoSettingsDTO.Response>('/settings/sso')
  }

  /**
   * Configure one provider. It is offered on the sign-in page at once,
   * without a restart. Omit `clientSecret` to keep the stored one (same
   * `clientId` only). Admin only.
   */
  async updateSsoProvider(
    provider: SsoProvider,
    data: SsoSettingsDTO.ProviderUpdate,
  ): Promise<SsoSettingsDTO.ProviderStatus> {
    return this.request<SsoSettingsDTO.ProviderStatus>(`/settings/sso/${provider}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  /**
   * Who may get into the instance: the password policy, and the domains
   * whose addresses may have an account. Admin only.
   */
  async getAccessSettings(): Promise<AccessSettingsDTO.Response> {
    return this.request<AccessSettingsDTO.Response>('/settings/access')
  }

  /**
   * Replace the access settings, at once. Users they now shut out are signed
   * out: everyone but administrators when single sign-on becomes the only
   * way in, those outside the domains when the list changes. Admin only.
   */
  async updateAccessSettings(settings: AccessSettingsDTO.Update): Promise<AccessSettingsDTO.Response> {
    return this.request<AccessSettingsDTO.Response>('/settings/access', {
      method: 'PUT',
      body: JSON.stringify(settings),
    })
  }

  /** Remove one provider's application: it leaves the sign-in page at once. Admin only. */
  async removeSsoProvider(provider: SsoProvider): Promise<SsoSettingsDTO.ProviderStatus> {
    return this.request<SsoSettingsDTO.ProviderStatus>(`/settings/sso/${provider}`, {
      method: 'DELETE',
    })
  }

  // ============================================
  // Variable Operations
  // ============================================

  /**
   * Get all variables for a presentation
   */
  async listVariables(presentationId: string): Promise<VariableDTO.List> {
    return this.request<VariableDTO.List>(`/presentations/${presentationId}/variables`)
  }

  /**
   * Create a new variable in a presentation
   */
  async createVariable(
    presentationId: string,
    variable: VariableDTO.Create
  ): Promise<VariableDTO.List> {
    return this.request<VariableDTO.List>(`/presentations/${presentationId}/variables`, {
      method: 'POST',
      body: JSON.stringify(variable),
    })
  }

  /**
   * Update an existing variable
   */
  async updateVariable(
    presentationId: string,
    variableId: string,
    updates: VariableDTO.Update
  ): Promise<VariableDTO.List> {
    return this.request<VariableDTO.List>(`/presentations/${presentationId}/variables/${variableId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
  }

  /**
   * Delete a variable from a presentation
   * Will fail if the variable is currently in use in any text shape
   */
  async deleteVariable(presentationId: string, variableId: string): Promise<VariableDTO.List> {
    return this.request<VariableDTO.List>(`/presentations/${presentationId}/variables/${variableId}`, {
      method: 'DELETE',
    })
  }

  // ============================================
  // Export Operations
  // ============================================

  /**
   * Export presentation to PDF
   * @param variableValues - Optional record of variable ID to value mappings
   * @returns PDF blob URL that can be used for download
   */
  async exportToPDF(presentationId: string, variableValues?: Record<string, VariableValueType>): Promise<Blob> {
    const url = `${this.baseUrl}/export/${presentationId}/pdf`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...this.authHeaders(),
        },
        body: JSON.stringify({ ...variableValues }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      return response.blob()
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Download presentation as PDF file
   * Helper method that triggers a browser download
   * Note: This method is only available in browser environments
   * @param variableValues - Optional record of variable ID to value mappings
   */
  async downloadPDF(presentationId: string, filename?: string, variableValues?: Record<string, VariableValueType>): Promise<void> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      throw new Error('downloadPDF is only available in browser environments')
    }

    const blob = await this.exportToPDF(presentationId, variableValues)
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename || `presentation-${presentationId}.pdf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }
}
