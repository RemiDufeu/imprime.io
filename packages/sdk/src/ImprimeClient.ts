import type {
  Presentation,
  PresentationSummary,
  Slide,
  Shape,
  RectangleShape,
  EllipseShape,
  TextBoxShape,
  ImageShape,
  ImageDTO,
  PresentationDTO,
  VariableDTO,
} from '@imprime/common'

export interface ImprimeClientOptions {
  baseUrl?: string
  timeout?: number
}

/**
 * TypeScript SDK for Imprime API
 *
 * Provides a type-safe client for creating and managing presentations programmatically.
 *
 * @example
 * ```typescript
 * const client = new ImprimeClient({ baseUrl: 'http://localhost:3001/api' })
 *
 * // Create a presentation
 * const presentation = await client.createPresentation('My Presentation')
 *
 * // Add a slide
 * const updated = await client.addSlide(presentation._id)
 *
 * // Add shapes
 * await client.addRectangle(presentation._id, updated.slides[0]._id, {
 *   x: 100, y: 100, width: 200, height: 100, fill: '#3b82f6'
 * })
 * ```
 */
export class ImprimeClient {
  private baseUrl: string
  private timeout: number

  constructor(options: ImprimeClientOptions = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:3001/api'
    this.timeout = options.timeout || 30000
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
        headers: {
          'Content-Type': 'application/json',
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
   * Add a new blank slide to a presentation.
   * The server returns no body — refetch the presentation if you need the new slide's id.
   */
  async addSlide(presentationId: string): Promise<void> {
    return this.request<void>(`/presentations/${presentationId}/slides`, {
      method: 'POST',
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
   * Add a text box to a slide
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
    }
  ): Promise<void> {
    const shape: TextBoxShape = {
      id: `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type: 'text',
      x: options.x,
      y: options.y,
      width: options.width || 200,
      height: options.height || 50,
      paragraphes: [
        {
          type : 'paragraph',
          children : [{text : ''}]
        }
      ],
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
  async exportToPDF(presentationId: string, variableValues?: Record<string, string>): Promise<Blob> {
    const url = `${this.baseUrl}/export/${presentationId}/pdf`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    try {
      const response = await fetch(url, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
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
  async downloadPDF(presentationId: string, filename?: string, variableValues?: Record<string, string>): Promise<void> {
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
