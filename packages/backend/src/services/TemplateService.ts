import { TemplateModel } from '../models/Template.js'
import { PageModel } from '../models/Page.js'
import { VariableDataModel } from '../models/VariableData.js'
import { PreviewModel } from '../models/Preview.js'
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
import type { Template, TemplateDTO, TemplateSummary, TextBoxShape } from '@imprime/common'
import {
  collectImageIds,
  collectVariableIds,
  isValidPageSize,
  isValidTemplateCode,
  MAX_PAGE_DIMENSION,
  MIN_PAGE_DIMENSION,
  TEMPLATE_CODE_MAX_LENGTH,
} from '@imprime/common'
import type { ImageService } from './ImageService.js'
import { ConflictError, NotFoundError, ValidationError } from './errors.js'

const codeTaken = () =>
  new ConflictError('Another of your templates already has this code', 'TEMPLATE_CODE_TAKEN')

function isDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000
}

const invalidNumbering = (message: string, details?: string[]) =>
  new ValidationError(message, 'INVALID_PAGE_NUMBERING', details)

// A text shape, as far as the box is checked: its tree is otherwise taken as
// sent, as a page's shapes are — the MCP's schema is what checks it whole.
function isTextBox(value: unknown): value is TextBoxShape {
  return typeof value === 'object' && value !== null
    && 'type' in value && value.type === 'text'
    && 'paragraphes' in value && Array.isArray(value.paragraphes)
}

// Checked as sent, before the model casts it: Mongoose would turn 12 into "12".
function assertValidCode(code: unknown): void {
  if (!isValidTemplateCode(code)) {
    throw new ValidationError(
      `A template code is 1 to ${TEMPLATE_CODE_MAX_LENGTH} letters, digits, "-" or "_"`,
      'INVALID_TEMPLATE_CODE'
    )
  }
}

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

  /** The `_id` of `ownerId`'s template with this code. */
  public async getIdByCode(code: string, ownerId: string): Promise<string> {
    const template = await TemplateModel.findOne({ ownerId, code }).select('_id')
    if (!template) {
      throw new NotFoundError('Template not found', 'TEMPLATE_NOT_FOUND')
    }
    return template._id.toString()
  }

  /** Whether another of `ownerId`'s templates than `exceptId` has this code. */
  public async isCodeTaken(code: string, ownerId: string, exceptId?: string): Promise<boolean> {
    const filter = exceptId ? { ownerId, code, _id: { $ne: toObjectId(exceptId) } } : { ownerId, code }
    return (await TemplateModel.exists(filter)) !== null
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
    if (data.code !== undefined) {
      assertValidCode(data.code)
      if (await this.isCodeTaken(data.code, ownerId)) throw codeTaken()
    }
    let template
    try {
      template = await TemplateModel.create({ ...templateCreateToModel(data), ownerId })
    } catch (err) {
      if (isDuplicateKey(err)) throw codeTaken()
      throw err
    }
    await PageModel.create(pageCreateToModel(template._id, 0))
    return await this.getById(template._id.toString())
  }

  public async update(id: string, data: TemplateDTO.Update): Promise<Template> {
    const template = await TemplateModel.findById(id)
    if (!template) {
      throw new NotFoundError('Template not found', 'TEMPLATE_NOT_FOUND')
    }

    if (data.code !== undefined && data.code !== null) {
      assertValidCode(data.code)
      if (await this.isCodeTaken(data.code, template.ownerId, id)) throw codeTaken()
    }
    if (data.pageNumbering !== undefined && data.pageNumbering !== null) {
      await this.assertPageNumbering(template._id, data.pageNumbering)
    }

    const update = templateUpdateToModel(data)
    if (Object.keys(update).length) {
      Object.assign(template, update)
      try {
        await template.save()
      } catch (err) {
        if (isDuplicateKey(err)) throw codeTaken()
        throw err
      }
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

  // The box is a text box, and its variables are the template's: the box is
  // drawn on every page, and one pointing at nothing would print nothing
  // there.
  private async assertPageNumbering(templateId: Types.ObjectId, numbering: unknown): Promise<void> {
    if (typeof numbering !== 'object' || numbering === null || !('box' in numbering) || !isTextBox(numbering.box)) {
      throw invalidNumbering('pageNumbering must be an object whose box is a text shape')
    }
    if ('skipFirstPage' in numbering && numbering.skipFirstPage !== undefined && typeof numbering.skipFirstPage !== 'boolean') {
      throw invalidNumbering('skipFirstPage must be a boolean')
    }
    const variables = await VariableDataModel.find({ templateId }).select('_id')
    const known = new Set(variables.map(variable => variable._id.toString()))
    const unknown = [...collectVariableIds([numbering.box])].filter(variableId => !known.has(variableId))
    if (unknown.length) {
      throw invalidNumbering(
        'The page-number box refers to variables the template does not have',
        unknown.map(variableId => `variableId "${variableId}" does not exist in this template`)
      )
    }
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
    await PreviewModel.deleteMany({ templateId: template._id })
    await TemplateModel.findByIdAndDelete(id)
  }
}
