import { PreviewModel, type PreviewDocument } from '../models/Preview.js'
import {
  isObjectIdString,
  previewCreateToModel,
  previewToCreatedDTO,
  previewValuesFromModel,
  toObjectId,
} from '../models/mappers.js'
import type { PreviewDTO, VariableValueType } from '@imprime/common'
import type { TemplateService } from './TemplateService.js'
import type { ExportResult, ExportService, PageImagesResult } from './ExportService.js'
import type { RasterOptions } from './pdfRaster.js'
import { NotFoundError } from './errors.js'

// How long a preview can be opened: a day, so that a link an agent hands over
// is still good when it is followed.
export const PREVIEW_TTL_SECONDS = 24 * 60 * 60

export const previewNotFound = () => new NotFoundError('Preview not found, or expired', 'PREVIEW_NOT_FOUND')

/**
 * Previews: a template drawn with a set of values, as its PDF would be. Only
 * the values are kept: the template is read again each time a preview is
 * opened or printed, as it then is.
 */
export class PreviewService {
  constructor(private templateService: TemplateService, private exportService: ExportService) { }

  /**
   * Refused as the PDF would be — a value its variable refuses, no page left:
   * a preview of what can never be printed would only mislead.
   */
  public async create(
    templateId: string,
    ownerId: string,
    variableValues: Record<string, VariableValueType>
  ): Promise<PreviewDTO.Created> {
    const template = await this.templateService.getById(templateId)
    const resolved = this.exportService.resolve(template, variableValues)

    const expiresAt = new Date(Date.now() + PREVIEW_TTL_SECONDS * 1000)
    const preview = await PreviewModel.create(
      previewCreateToModel(toObjectId(templateId), ownerId, variableValues, expiresAt)
    )
    return previewToCreatedDTO(preview, resolved)
  }

  /**
   * The preview's pages, resolved against the template as it is now: an edit
   * since the preview was made shows, and fails it as it would the PDF.
   */
  public async getById(id: string): Promise<PreviewDTO.Response> {
    const preview = await this.findLive(id)
    const template = await this.templateService.getById(preview.templateId.toString())
    const { pages, warnings } = this.exportService.resolve(template, previewValuesFromModel(preview))
    return {
      _id: preview._id.toString(),
      templateId: template._id,
      title: template.title,
      pageSize: template.pageSize,
      pages,
      warnings,
      expiresAt: preview.expiresAt,
    }
  }

  /** The PDF the preview shows, and its template's title to name it by. */
  public async exportToPDF(id: string, ownerId: string): Promise<ExportResult & { title: string }> {
    const preview = await this.findLive(id)
    const template = await this.templateService.getById(preview.templateId.toString())
    const result = await this.exportService.exportToPDF(template, ownerId, {
      variableValues: previewValuesFromModel(preview),
    })
    return { ...result, title: template.title }
  }

  /** Pages of the PDF the preview shows, as PNG images (see `exportPageImages`). */
  public async getPageImages(id: string, ownerId: string, raster: RasterOptions): Promise<PageImagesResult> {
    const preview = await this.findLive(id)
    const template = await this.templateService.getById(preview.templateId.toString())
    return this.exportService.exportPageImages(
      template,
      ownerId,
      { variableValues: previewValuesFromModel(preview) },
      raster
    )
  }

  // Not past its date: the TTL monitor deletes an expired preview only on its
  // next pass.
  private async findLive(id: string): Promise<PreviewDocument> {
    const preview = isObjectIdString(id)
      ? await PreviewModel.findOne({ _id: toObjectId(id), expiresAt: { $gt: new Date() } })
      : null
    if (!preview) throw previewNotFound()
    return preview
  }
}
