import { TemplateModel } from '../models/Template.js'
import { PageModel } from '../models/Page.js'
import { VariableDataModel } from '../models/VariableData.js'
import {
  templateCreateToModel,
  templateToDTO,
  templateToSummaryDTO,
  templateUpdateToModel,
  pageCreateToModel,
  pagesReorderToOrderUpdates,
  pageToDTO,
  toObjectId,
  variableToDTO,
} from '../models/mappers.js'
import type { Types } from 'mongoose'
import type { Template, TemplateDTO, TemplateSummary } from '@imprime/common'
import { collectImageIds, isValidPageSize, MAX_PAGE_DIMENSION, MIN_PAGE_DIMENSION } from '@imprime/common'
import type { ImageService } from './ImageService.js'
import { NotFoundError, ValidationError } from './errors.js'

export function touchTemplate(templateId: Types.ObjectId): Promise<unknown> {
  return TemplateModel.updateOne(
    { _id: templateId },
    { $currentDate: { updatedAt: true } }
  )
}

export class TemplateService {
  constructor(private imageService: ImageService) {}

  public async list(ownerId: string): Promise<TemplateSummary[]> {
    const templates = await TemplateModel.find({ ownerId }).sort({ updatedAt: -1 })
    return templates.map(templateToSummaryDTO)
  }

  public async getById(id: string): Promise<Template> {
    const [template, pages, variables] = await Promise.all([
      TemplateModel.findById(id),
      PageModel.find({ templateId: toObjectId(id) }).sort({ order: 1 }),
      VariableDataModel.find({ templateId: toObjectId(id) }),
    ])
    if (!template) {
      throw new NotFoundError('Template not found', 'TEMPLATE_NOT_FOUND')
    }
    return {
      ...templateToDTO(template),
      pages: pages.map(pageToDTO),
      variableData: variables.map(variableToDTO),
    }
  }

  public async create(data: TemplateDTO.Create, ownerId: string): Promise<Template> {
    if (data.pageSize !== undefined && !isValidPageSize(data.pageSize)) {
      throw new ValidationError(
        `Page width and height must be whole numbers from ${MIN_PAGE_DIMENSION} to ${MAX_PAGE_DIMENSION}`,
        'INVALID_PAGE_SIZE'
      )
    }
    const template = await TemplateModel.create({ ...templateCreateToModel(data), ownerId })
    await PageModel.create(pageCreateToModel(template._id, 0))
    return await this.getById(template._id.toString())
  }

  public async update(id: string, data: TemplateDTO.Update): Promise<Template> {
    const template = await TemplateModel.findById(id)
    if (!template) {
      throw new NotFoundError('Template not found', 'TEMPLATE_NOT_FOUND')
    }

    const update = templateUpdateToModel(data)
    if (Object.keys(update).length) {
      Object.assign(template, update)
      await template.save()
    }

    if (data.pages) {
      const reorders = pagesReorderToOrderUpdates(data.pages)
      await Promise.all(reorders.map(r =>
        PageModel.updateOne(
          { _id: r._id, templateId: template._id },
          { order: r.order }
        )
      ))
    }

    return await this.getById(id)
  }

  public async delete(id: string): Promise<void> {
    const template = await TemplateModel.findById(id)
    if (!template) {
      throw new NotFoundError('Template not found', 'TEMPLATE_NOT_FOUND')
    }

    const pages = await PageModel.find({ templateId: template._id })
    const imageIds = pages.flatMap(page => collectImageIds(page.shapes))

    // Pages first: an image another template still shows is kept, and
    // these pages must no longer count as showing theirs.
    await PageModel.deleteMany({ templateId: template._id })
    if (imageIds.length) {
      try {
        await this.imageService.deleteUnused(imageIds, template.ownerId)
      } catch (error) {
        console.error('Failed to delete associated images:', error)
      }
    }
    await VariableDataModel.deleteMany({ templateId: template._id })
    await TemplateModel.findByIdAndDelete(id)
  }
}
