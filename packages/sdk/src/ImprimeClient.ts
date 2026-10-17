import type {
  Template,
  TemplateSummary,
  Page,
  PageSize,
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
  TemplateDTO,
  TemplateFileDTO,
  PageDTO,
  VariableDTO,
  VariableValueType,
  EnabledAuthProviders,
  OAuthConsentRequest,
  EmailSettingsDTO,
  SsoSettingsDTO,
  SsoProvider,
  AccessSettingsDTO,
  ImageFit,
  ImageAlign,
  ImageCrop,
  ExportDTO,
  PreviewDTO,
} from '@imprime/common'
import { DEFAULT_IMAGE_ALIGN, DEFAULT_IMAGE_FIT, EXPORT_WARNINGS_HEADER } from '@imprime/common'

// The warnings of an export, from the header they travel in. A header that is
// not the JSON the API writes yields none rather than failing a PDF that was
// made.
function parseExportWarnings(header: string | null): ExportDTO.Warning[] {
  if (!header) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(header)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.flatMap((item: unknown): ExportDTO.Warning[] => {
    if (typeof item !== 'object' || item === null) return []
    if (!('code' in item && 'page' in item && 'shapes' in item && 'message' in item)) return []
    const { code, page, shapes, message } = item
    return code === 'CONTENT_OFF_PAGE' && typeof page === 'number' && typeof shapes === 'number' && typeof message === 'string'
      ? [{ code, page, shapes, message }]
      : []
  })
}

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
 * Provides a type-safe client for creating and managing templates programmatically.
 *
 * @example
 * ```typescript
 * const client = new ImprimeClient({ baseUrl: 'http://localhost:3023/api' })
 *
 * // Create a template
 * const template = await client.createTemplate('My Template')
 *
 * // Add a page
 * const page = await client.addPage(template._id)
 *
 * // Add shapes
 * await client.addRectangle(template._id, page._id, {
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
  // Template Operations
  // ============================================

  /**
   * List all templates (light summary — no pages/variables)
   */
  async listTemplates(): Promise<TemplateSummary[]> {
    return this.request<TemplateSummary[]>('/templates')
  }

  /**
   * Get a specific template by ID
   */
  async getTemplate(id: string): Promise<Template> {
    return this.request<Template>(`/templates/${id}`)
  }

  /**
   * Create a new template, with one blank page
   * @param pageSize - one of `PAGE_FORMATS`' sizes, or a custom one; 1920×1080 when omitted
   * @param code - what `exportPDFByCode` finds it by; 409 `TEMPLATE_CODE_TAKEN`
   *   when another of your templates has it
   */
  async createTemplate(title?: string, pageSize?: PageSize, code?: string): Promise<Template> {
    const data: TemplateDTO.Create = { title, pageSize, code }
    return this.request<Template>('/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  /**
   * Update a template: its title, its code (null removes it; 409
   * `TEMPLATE_CODE_TAKEN` when another of your templates has it), the order
   * of its pages
   */
  async updateTemplate(id: string, data: TemplateDTO.Update): Promise<Template> {
    return this.request<Template>(`/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  /**
   * A template as a file — its pages, variables and images — which
   * `importTemplate` turns back into a template, on this instance or another.
   */
  async exportTemplateFile(id: string): Promise<TemplateFileDTO.File> {
    return this.request<TemplateFileDTO.File>(`/templates/${id}/file`)
  }

  /**
   * Save a template's file, named `<title>.imprime.json`. Only available in
   * browser environments.
   */
  async downloadTemplateFile(id: string): Promise<void> {
    this.assertBrowser('downloadTemplateFile')
    const file = await this.exportTemplateFile(id)
    const blob = new Blob([JSON.stringify(file)], { type: 'application/json' })
    this.saveBlob(blob, `${file.title || 'template'}.imprime.json`)
  }

  /**
   * A new template from a file `exportTemplateFile` wrote, every part of it
   * under a new id. Typed `unknown` because it is usually read from disk:
   * the server checks it whole, and answers 400 `INVALID_TEMPLATE_FILE` for
   * anything else. The template takes the file's code: one of yours has it
   * already, and the import is refused with 409 `TEMPLATE_CODE_TAKEN` — send
   * it again with another code, or none.
   */
  async importTemplate(file: unknown): Promise<Template> {
    return this.request<Template>('/templates/import', {
      method: 'POST',
      body: JSON.stringify(file),
    })
  }

  /**
   * Delete a template
   */
  async deleteTemplate(id: string): Promise<void> {
    return this.request<void>(`/templates/${id}`, {
      method: 'DELETE',
    })
  }

  // ============================================
  // Page Operations
  // ============================================

  /**
   * Add a page to a template and return it: blank and last by default,
   * or at `page.order` with `page.shapes`, `page.visibleWhen` and
   * `page.repeat`. `page._id` restores a deleted page under its former id.
   */
  async addPage(templateId: string, page: PageDTO.Create = {}): Promise<Page> {
    return this.request<Page>(`/templates/${templateId}/pages`, {
      method: 'POST',
      body: JSON.stringify(page),
    })
  }

  /**
   * Update a page: its shapes, its condition, its repeat — each field given
   * replaces the page's, `null` removes a condition or a repeat, and the rest
   * is left alone. Fire-and-forget: the server returns 204 No Content,
   * callers are expected to apply the change optimistically client-side.
   */
  async updatePage(templateId: string, pageId: string, update: PageDTO.Update): Promise<void> {
    return this.request<void>(`/templates/${templateId}/pages/${pageId}`, {
      method: 'PATCH',
      body: JSON.stringify(update),
    })
  }

  /**
   * Delete a page from a template. Returns 204 — refetch the template to sync.
   * Fails with 400 `LAST_PAGE` for the template's only page.
   */
  async deletePage(templateId: string, pageId: string): Promise<void> {
    return this.request<void>(`/templates/${templateId}/pages/${pageId}`, {
      method: 'DELETE',
    })
  }

  // ============================================
  // Shape Operations (High-level helpers)
  // ============================================

  /**
   * Add a shape to a page
   */
  async addShape(templateId: string, pageId: string, shape: Shape): Promise<void> {
    const template = await this.getTemplate(templateId)
    const page = template.pages.find(s => s._id === pageId)

    if (!page) {
      throw new Error(`Page ${pageId} not found in template ${templateId}`)
    }

    const updatedShapes = [...page.shapes, shape]
    await this.updatePage(templateId, pageId, { shapes: updatedShapes })
  }

  /**
   * Add a rectangle to a page
   */
  async addRectangle(
    templateId: string,
    pageId: string,
    options: {
      x: number
      y: number
      width: number
      height: number
      fill?: string
      rotation?: number
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
      rotation: options.rotation,
    }
    return this.addShape(templateId, pageId, shape)
  }

  /**
   * Add an ellipse/circle to a page
   */
  async addEllipse(
    templateId: string,
    pageId: string,
    options: {
      x: number
      y: number
      width: number
      height: number
      fill?: string
      rotation?: number
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
      rotation: options.rotation,
    }
    return this.addShape(templateId, pageId, shape)
  }

  /**
   * Add a text box to a page. Each line of `text` becomes a paragraph (a list
   * item when `list` is set); the formatting options apply to all of them.
   */
  async addText(
    templateId: string,
    pageId: string,
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
      rotation?: number
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
      rotation: options.rotation,
      paragraphes,
    }
    return this.addShape(templateId, pageId, shape)
  }

  /**
   * Update a shape's properties
   */
  async updateShape(
    templateId: string,
    pageId: string,
    shapeId: string,
    updates: Partial<Shape>
  ): Promise<void> {
    const template = await this.getTemplate(templateId)
    const page = template.pages.find(s => s._id === pageId)

    if (!page) {
      throw new Error(`Page ${pageId} not found in template ${templateId}`)
    }

    const updatedShapes = page.shapes.map(shape =>
      shape.id === shapeId ? { ...shape, ...updates } as Shape : shape
    )
    await this.updatePage(templateId, pageId, { shapes: updatedShapes })
  }

  /**
   * Delete a shape from a page
   */
  async deleteShape(templateId: string, pageId: string, shapeId: string): Promise<void> {
    const template = await this.getTemplate(templateId)
    const page = template.pages.find(s => s._id === pageId)

    if (!page) {
      throw new Error(`Page ${pageId} not found in template ${templateId}`)
    }

    const updatedShapes = page.shapes.filter(s => s.id !== shapeId)
    await this.updatePage(templateId, pageId, { shapes: updatedShapes })
  }

  // ============================================
  // Image Operations
  // ============================================

  /**
   * Upload a PNG or JPEG image (base64). Its format is read from the data,
   * which must agree with `mimeType`.
   * @param data - Base64 encoded image data, or a base64 data URL
   * @param mimeType - 'image/png' or 'image/jpeg'
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
   * Add an image box to a page
   * @param templateId - Template ID
   * @param pageId - Page ID
   * @param options - Image box options. The box shows the uploaded image
   *   `imageId`, or the value of the image variable `imageVariable` at export
   *   (`itemPath`: a field of the item an enclosing repeated group iterates);
   *   without either it is empty. `fit` defaults to 'contain' and `align` to
   *   centred; `crop` is in fractions (0 to 1) of the image's natural size.
   */
  async addImage(
    templateId: string,
    pageId: string,
    options: {
      imageId?: string
      imageVariable?: string
      itemPath?: string
      x: number
      y: number
      width: number
      height: number
      fit?: ImageFit
      align?: ImageAlign
      crop?: ImageCrop
      opacity?: number
      cornerRadius?: number
      rotation?: number
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
      imageVariable: options.imageVariable,
      itemPath: options.itemPath,
      fit: options.fit ?? DEFAULT_IMAGE_FIT,
      align: options.align ?? DEFAULT_IMAGE_ALIGN,
      crop: options.crop,
      opacity: options.opacity,
      cornerRadius: options.cornerRadius,
      rotation: options.rotation,
    }
    return this.addShape(templateId, pageId, shape)
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
   * Delete an imported family. Text using it, in every template, is drawn
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
   * Get all variables for a template
   */
  async listVariables(templateId: string): Promise<VariableDTO.List> {
    return this.request<VariableDTO.List>(`/templates/${templateId}/variables`)
  }

  /**
   * Create a new variable in a template
   */
  async createVariable(
    templateId: string,
    variable: VariableDTO.Create
  ): Promise<VariableDTO.List> {
    return this.request<VariableDTO.List>(`/templates/${templateId}/variables`, {
      method: 'POST',
      body: JSON.stringify(variable),
    })
  }

  /**
   * Update an existing variable
   */
  async updateVariable(
    templateId: string,
    variableId: string,
    updates: VariableDTO.Update
  ): Promise<VariableDTO.List> {
    return this.request<VariableDTO.List>(`/templates/${templateId}/variables/${variableId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    })
  }

  /**
   * Delete a variable from a template
   * Will fail if the variable is currently in use in any text shape
   */
  async deleteVariable(templateId: string, variableId: string): Promise<VariableDTO.List> {
    return this.request<VariableDTO.List>(`/templates/${templateId}/variables/${variableId}`, {
      method: 'DELETE',
    })
  }

  // ============================================
  // Export Operations
  // ============================================

  /**
   * POST `body` to an endpoint answering with a PDF, and read the warnings
   * its header carries.
   */
  private async requestPdf(
    endpoint: string,
    body: unknown
  ): Promise<{ pdf: Blob; warnings: ExportDTO.Warning[] }> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        signal: controller.signal,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...this.authHeaders(),
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}: ${errorText}`)
      }

      return {
        pdf: await response.blob(),
        warnings: parseExportWarnings(response.headers.get(EXPORT_WARNINGS_HEADER)),
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  // Checked before the request, which is wasted outside a browser.
  private assertBrowser(method: string): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      throw new Error(`${method} is only available in browser environments`)
    }
  }

  /** Hands `blob` to the browser as a download named `filename`. */
  private saveBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  /**
   * Export template to PDF, with what the caller should know about it.
   * @param variableValues - Optional record of variable name to value; an
   *   image variable (or image field of a list item) takes a PNG or JPEG data URL
   * @returns The PDF, and its warnings: one per page whose content went beyond
   *   the page's edge and was left out — typically a repeated list longer than
   *   the page. Empty when everything fits.
   */
  async exportPDF(
    templateId: string,
    variableValues?: Record<string, VariableValueType>
  ): Promise<{ pdf: Blob; warnings: ExportDTO.Warning[] }> {
    return this.requestPdf(`/export/${templateId}/pdf`, { ...variableValues })
  }

  /**
   * Export to PDF the template of yours that has this `code`, as `exportPDF`
   * does by id. Fails with 404 when none has it.
   */
  async exportPDFByCode(
    code: string,
    variableValues?: Record<string, VariableValueType>
  ): Promise<{ pdf: Blob; warnings: ExportDTO.Warning[] }> {
    return this.requestPdf(`/export/code/${encodeURIComponent(code)}/pdf`, { ...variableValues })
  }

  /**
   * Export template to PDF — the PDF alone; `exportPDF` also returns its
   * warnings.
   * @param variableValues - Optional record of variable name to value; an
   *   image variable (or image field of a list item) takes a PNG or JPEG data URL
   */
  async exportToPDF(templateId: string, variableValues?: Record<string, VariableValueType>): Promise<Blob> {
    return (await this.exportPDF(templateId, variableValues)).pdf
  }

  /**
   * Download template as PDF file
   * Helper method that triggers a browser download
   * Note: This method is only available in browser environments
   * @param variableValues - Optional record of variable name to value
   * @returns The export's warnings (see `exportPDF`)
   */
  async downloadPDF(
    templateId: string,
    filename?: string,
    variableValues?: Record<string, VariableValueType>
  ): Promise<ExportDTO.Warning[]> {
    this.assertBrowser('downloadPDF')
    const { pdf, warnings } = await this.exportPDF(templateId, variableValues)
    this.saveBlob(pdf, filename || `template-${templateId}.pdf`)
    return warnings
  }

  // ============================================
  // Preview Operations
  // ============================================

  /**
   * Make a preview: the template drawn with these values, as its PDF would
   * be, kept for a day. Fails as `exportPDF` would with them.
   * @returns Its `_id` — the editor shows it at `getPreviewPath(_id)` — when
   *   it expires, and the PDF's page count and warnings
   */
  async createPreview(
    templateId: string,
    variableValues?: Record<string, VariableValueType>
  ): Promise<PreviewDTO.Created> {
    return this.request<PreviewDTO.Created>(`/templates/${templateId}/previews`, {
      method: 'POST',
      body: JSON.stringify({ ...variableValues }),
    })
  }

  /**
   * A preview's pages, resolved against the template as it is now. 404
   * `PREVIEW_NOT_FOUND` once it has expired.
   */
  async getPreview(previewId: string): Promise<PreviewDTO.Response> {
    return this.request<PreviewDTO.Response>(`/previews/${previewId}`)
  }

  /** The PDF a preview shows, with its warnings (see `exportPDF`). */
  async exportPreviewPDF(previewId: string): Promise<{ pdf: Blob; warnings: ExportDTO.Warning[] }> {
    return this.requestPdf(`/previews/${previewId}/pdf`, {})
  }

  /**
   * Download the PDF a preview shows, as a file named `filename`. Only
   * available in browser environments.
   * @returns The export's warnings (see `exportPDF`)
   */
  async downloadPreviewPDF(previewId: string, filename: string): Promise<ExportDTO.Warning[]> {
    this.assertBrowser('downloadPreviewPDF')
    const { pdf, warnings } = await this.exportPreviewPDF(previewId)
    this.saveBlob(pdf, filename)
    return warnings
  }
}
