import type {
  Template,
  Page,
  VariableValueType,
  VariableItemField,
  ResolveContext,
  DataUrlImage,
  ExportDTO
} from '@imprime/common'
import {
  resolvePages,
  isEmptyVariableValue,
  exceedsMaxLength,
  exceedsMaxItems,
  findItemFieldIssue,
  toImageDataUrl,
  getRotatedBounds,
} from '@imprime/common'
import { readImageDataUrl, type ImageService } from './ImageService.js'
import type { PageImage, RasterOptions } from './pdfRaster.js'
import { PdfRenderPool, type RenderOutput } from './pdfRenderPool.js'
import type { FontService } from './FontService.js'
import { ValidationError } from './errors.js'
import { readPdfRenderLimits } from '../config/pdfRendering.js'

export interface RenderOptions {
  variableValues?: Record<string, VariableValueType>
}

export interface ExportResult {
  pdf: Buffer
  warnings: ExportDTO.Warning[]
}

export interface PageImagesResult {
  images: PageImage[]
  // How many pages the PDF has, of which `images` holds those asked for.
  pageCount: number
  warnings: ExportDTO.Warning[]
}

export interface ResolvedTemplate {
  pages: Page[]
  warnings: ExportDTO.Warning[]
}

// The font families the runs of `pages` ask for: an export fetches the
// imported ones among them.
function usedFontFamilies(pages: Page[]): string[] {
  const families = new Set<string>()
  for (const page of pages) {
    for (const shape of page.shapes) {
      if (shape.type !== 'text') continue
      for (const paragraph of shape.paragraphes) {
        for (const run of paragraph.children) {
          if (run.fontFamily) families.add(run.fontFamily)
        }
      }
    }
  }
  return [...families]
}

/**
 * Templates made into PDFs: the values checked, the pages resolved, their
 * images and fonts read — all here, on the server's thread — then the PDF
 * drawn on a worker thread (`PdfRenderPool`, `pdfDocument.ts`), which never
 * reads the database. How many are drawn at once, and how long each may
 * take, is the pool's to bound (`config/pdfRendering.ts`).
 */
export class ExportService {
  private readonly renderPool = new PdfRenderPool(readPdfRenderLimits())

  constructor(private imageService: ImageService, private fontService: FontService) { }

  /**
   * Required variables, and the required fields of a list's items, must have a
   * value; a string, no more characters than its variable's or field's max
   * length; a list, no more items than its variable's or field's max items;
   * and every image a value holds — an
   * image variable's, or an image field's of a list's items, nested lists
   * included — must be one the export can draw. The error names the value, as
   * the caller wrote it: `photos[2].file`. An empty one is left to the
   * variable's default, or to an empty box.
   *
   * Returns the images read, by value: the resolved boxes hold the same
   * strings (`resolvedImage`), so they are not read twice.
   */
  private validateVariables(
    template: Template,
    variableValues: Record<string, VariableValueType>
  ): Map<string, DataUrlImage> {
    const requiredVariables = template.variableData?.filter(v => v.required) || []

    for (const variable of requiredVariables) {
      if (isEmptyVariableValue(variableValues[variable.name])) {
        throw new ValidationError(`Required variable "${variable.name}" is missing`, 'REQUIRED_VARIABLE_MISSING')
      }
    }

    const tooLong = (label: string, maxLength: number | undefined) => new ValidationError(
      `Variable "${label}" is longer than its max length of ${maxLength} characters`,
      'VARIABLE_TOO_LONG'
    )
    const tooMany = (label: string, maxItems: number | undefined) => new ValidationError(
      `Variable "${label}" has more than its max of ${maxItems} items`,
      'VARIABLE_TOO_MANY_ITEMS'
    )

    const images = new Map<string, DataUrlImage>()
    const checkImage = (value: unknown, label: string) => {
      if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return
      if (typeof value === 'string' && images.has(value)) return
      const image = typeof value === 'string' ? readImageDataUrl(value) : undefined
      if (!image || typeof value !== 'string') {
        throw new ValidationError(`Variable "${label}" is not a PNG or JPEG data URL`, 'INVALID_IMAGE_VALUE')
      }
      images.set(value, image)
    }
    const checkItems = (items: unknown, fields: VariableItemField[] | undefined, label: string) => {
      if (!Array.isArray(items)) return
      items.forEach((item: unknown, index) => {
        if (item === null || typeof item !== 'object') return
        for (const field of fields ?? []) {
          // Own properties only: a field named like an Object.prototype member
          // must not read the prototype's.
          const value: unknown = Object.hasOwn(item, field.name) ? Reflect.get(item, field.name) : undefined
          const path = `${label}[${index}].${field.name}`
          if (field.type === 'image') checkImage(value, path)
          else if (field.type === 'object-list') checkItems(value, field.itemFields, path)
        }
      })
    }
    for (const variable of template.variableData ?? []) {
      const value = variableValues[variable.name]
      if (exceedsMaxLength(variable, value)) throw tooLong(variable.name, variable.maxLength)
      if (exceedsMaxItems(variable, value)) throw tooMany(variable.name, variable.maxItems)
      if (variable.type === 'image') checkImage(value, variable.name)
      else if (variable.type === 'object-list') {
        const issue = findItemFieldIssue(value, variable.itemFields, variable.name)
        if (issue?.problem === 'missing') {
          throw new ValidationError(`Required variable "${issue.path}" is missing`, 'REQUIRED_VARIABLE_MISSING')
        }
        if (issue?.problem === 'too-long') throw tooLong(issue.path, issue.field.maxLength)
        if (issue?.problem === 'too-many') throw tooMany(issue.path, issue.field.maxItems)
        checkItems(value, variable.itemFields, variable.name)
      }
    }
    return images
  }

  /**
   * Every image a resolved box draws from a variable's value, `variableImages`
   * (already read by `validateVariables`) included. A value that was not
   * checked there — a default, or a string variable bound to a box through
   * the API — is read now, and fails the export the same way.
   */
  private readVariableImages(
    resolvedPages: Page[],
    variableImages: Map<string, DataUrlImage>
  ): Map<string, DataUrlImage> {
    const images = new Map(variableImages)

    for (const page of resolvedPages) {
      for (const shape of page.shapes) {
        if (shape.type !== 'image') continue
        const value = shape.resolvedImage
        if (value === undefined || images.has(value)) continue
        const image = readImageDataUrl(value)
        if (!image) {
          throw new ValidationError(
            'An image variable holds something that is not a PNG or JPEG data URL',
            'INVALID_IMAGE_VALUE'
          )
        }
        images.set(value, image)
      }
    }

    return images
  }

  /**
   * `images`, with the uploaded images the resolved boxes draw added by id.
   *
   * Only `ownerId`'s uploaded images: a shape's image id is anyone's to write,
   * and an export must not draw someone else's. One not found is left out.
   */
  private async fetchUploadedImages(
    resolvedPages: Page[],
    ownerId: string,
    images: Map<string, DataUrlImage>
  ): Promise<Map<string, DataUrlImage>> {
    const imageIds = new Set<string>()
    const imageDataMap = new Map(images)

    for (const page of resolvedPages) {
      for (const shape of page.shapes) {
        if (shape.type === 'image' && shape.resolvedImage === undefined && shape.imageId) {
          imageIds.add(shape.imageId)
        }
      }
    }

    if (imageIds.size === 0) {
      return imageDataMap
    }

    const imagePromises = Array.from(imageIds).map(async (imageId) => {
      try {
        const image = await this.imageService.getById(imageId, ownerId)
        const dataUrl = toImageDataUrl(image.data, image.mimeType)
        return { imageId, asset: { dataUrl, width: image.width, height: image.height } }
      } catch (error) {
        console.error(`Error fetching image ${imageId}:`, error)
        return null
      }
    })

    const results = await Promise.all(imagePromises)

    for (const result of results) {
      if (result) {
        imageDataMap.set(result.imageId, result.asset)
      }
    }

    return imageDataMap
  }

  /**
   * What the data makes of `template`: the pages its PDF has, in order, each
   * shape a leaf placed on its page with its text and image written — what
   * `exportToPDF` draws, and what a preview shows — and what the caller should
   * know about them: the content left out because it starts beyond its page,
   * one warning per page concerned. Fails as the export does: a value its
   * variable refuses, an image that cannot be drawn, no page left.
   *
   * The images read from the values come along, so that they are not read twice.
   */
  private resolveTemplate(
    template: Template,
    variableValues: Record<string, VariableValueType>
  ): ResolvedTemplate & { variableImages: Map<string, DataUrlImage> } {
    const validatedImages = this.validateVariables(template, variableValues)

    const ctx: ResolveContext = { variableValues, template }
    const { pageSize } = template
    // Repeated pages copied, pages whose condition fails left out: what is
    // left is the PDF's pages, and a PDF needs one.
    const exported = resolvePages(template.pages, ctx, template.pageNumbering)
    if (exported.length === 0) {
      throw new ValidationError(
        'No page to export: every page is left out by its condition, or repeated for an empty list',
        'NO_PAGE_TO_EXPORT'
      )
    }
    // A shape starting beyond the page is left out — react-pdf would start a
    // new page for it — and the caller told, since content that grew with its
    // data can land there without anyone placing it so. A turned shape starts
    // where its turned box does.
    const warnings: ExportDTO.Warning[] = []
    const pages: Page[] = exported.map((page, index) => {
      const { shapes } = page
      const onPage = shapes.filter(s => {
        const bounds = getRotatedBounds(s)
        return bounds.y < pageSize.height && bounds.x < pageSize.width
      })
      const leftOut = shapes.length - onPage.length
      if (leftOut > 0) {
        warnings.push({
          code: 'CONTENT_OFF_PAGE',
          page: index + 1,
          shapes: leftOut,
          message: `Page ${index + 1}: ${leftOut} shape${leftOut > 1 ? 's' : ''} start beyond the edge of the page and ${leftOut > 1 ? 'are' : 'is'} left out of the PDF.`,
        })
      }
      return { ...page, shapes: onPage }
    })

    return { pages, warnings, variableImages: this.readVariableImages(pages, validatedImages) }
  }

  /** `resolveTemplate`, without the images it read: what a preview shows. */
  public resolve(template: Template, variableValues: Record<string, VariableValueType>): ResolvedTemplate {
    const { pages, warnings } = this.resolveTemplate(template, variableValues)
    return { pages, warnings }
  }

  /**
   * The PDF, and what the caller should know about it (see `resolveTemplate`).
   * `ownerId` owns the template: only their images are drawn.
   *
   * Drawn on a worker: the export may wait its turn for one, fails with 429
   * when it may not, and with 408 past PDF_RENDER_TIMEOUT_SECONDS.
   */
  public async exportToPDF(template: Template, ownerId: string, options: RenderOptions = {}): Promise<ExportResult> {
    const { pdf, warnings } = await this.render(template, ownerId, options)
    return { pdf, warnings }
  }

  /**
   * Pages of the PDF `exportToPDF` makes, as PNG images: the PDF itself, drawn
   * by pdf.js — what an agent looks at to check its work. In the same job as
   * the PDF, on the same worker, under the same timeout.
   */
  public async exportPageImages(
    template: Template,
    ownerId: string,
    options: RenderOptions,
    raster: RasterOptions
  ): Promise<PageImagesResult> {
    const { images, pageCount, warnings } = await this.render(template, ownerId, options, raster)
    return { images, pageCount, warnings }
  }

  // The resolved pages drawn on a worker, with the images and fonts they
  // need — read while the worker is lent, so that a refused export reads
  // nothing — and, with `raster`, their PNG images.
  private async render(
    template: Template,
    ownerId: string,
    options: RenderOptions,
    raster?: RasterOptions
  ): Promise<RenderOutput & { pageCount: number; warnings: ExportDTO.Warning[] }> {
    const { pageSize } = template
    const { pages, warnings, variableImages } = this.resolveTemplate(template, options.variableValues || {})

    const output = await this.renderPool.render(ownerId, async isRegistered => {
      const [images, fonts] = await Promise.all([
        this.fetchUploadedImages(pages, ownerId, variableImages),
        this.fontService.getForExport(usedFontFamilies(pages), isRegistered),
      ])
      return { pages, pageSize, images, fonts, raster }
    })
    return { ...output, pageCount: pages.length, warnings }
  }
}
