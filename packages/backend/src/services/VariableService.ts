import { TemplateModel } from '../models/Template.js'
import { PageModel } from '../models/Page.js'
import { VariableDataModel } from '../models/VariableData.js'
import {
  isObjectIdString,
  toObjectId,
  variableCreateToModel,
  variableToDTO,
  variableUpdateToModel,
} from '../models/mappers.js'
import type { VariableDTO, VariableData, VariableType, VariableValueType } from '@imprime/common'
import { collectVariableIds } from '@imprime/common'
import { touchTemplate } from './TemplateService.js'
import { readImageDataUrl } from './ImageService.js'
import { NotFoundError, ConflictError, ValidationError } from './errors.js'

const nameConflict = () =>
  new ConflictError('Variable name already exists in this template', 'VARIABLE_NAME_EXISTS')

const variableIdTaken = () => new ConflictError('Variable id already in use', 'VARIABLE_ID_TAKEN')

function isDuplicateName(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000
}

// An image variable's default is drawn whenever an export leaves it empty:
// one the export cannot draw would fail every such export, so it is refused
// here instead. Values of the other types are not checked.
function assertDrawableDefault(type: VariableType, value: VariableValueType | null | undefined): void {
  if (type !== 'image' || value === undefined || value === null) return
  if (typeof value !== 'string' || !readImageDataUrl(value)) {
    throw new ValidationError(
      'The default of an image variable must be a PNG or JPEG data URL',
      'INVALID_VARIABLE_DEFAULT',
    )
  }
}

export class VariableService {
  public async create(templateId: string, data: VariableDTO.Create): Promise<VariableData[]> {
    const template = await TemplateModel.findById(templateId).select('_id')
    if (!template) {
      throw new NotFoundError('Template not found', 'TEMPLATE_NOT_FOUND')
    }

    if (data._id !== undefined) {
      if (!isObjectIdString(data._id)) {
        throw new ValidationError('Invalid variable id', 'INVALID_VARIABLE_ID')
      }
      if (await VariableDataModel.exists({ _id: toObjectId(data._id) })) {
        throw variableIdTaken()
      }
    }

    assertDrawableDefault(data.type, data.default)

    const exists = await VariableDataModel.exists({
      templateId: template._id,
      name: data.name,
    })
    if (exists) {
      throw nameConflict()
    }

    try {
      await VariableDataModel.create({
        ...variableCreateToModel(template._id, data),
        ...(data._id !== undefined ? { _id: toObjectId(data._id) } : {}),
      })
    } catch (err) {
      if (isDuplicateName(err)) throw nameConflict()
      throw err
    }
    await touchTemplate(template._id)
    return await this.list(template._id.toString())
  }

  public async update(
    templateId: string,
    variableId: string,
    data: VariableDTO.Update
  ): Promise<VariableData[]> {
    const variable = await VariableDataModel.findOne({
      _id: toObjectId(variableId),
      templateId: toObjectId(templateId),
    })
    if (!variable) {
      throw new NotFoundError('Variable not found', 'VARIABLE_NOT_FOUND')
    }

    if (data.name && data.name !== variable.name) {
      const conflict = await VariableDataModel.exists({
        templateId: variable.templateId,
        name: data.name,
        _id: { $ne: variable._id },
      })
      if (conflict) {
        throw nameConflict()
      }
    }

    const previousType = variable.type
    Object.assign(variable, variableUpdateToModel(data))

    if (variable.type !== 'object-list') {
      variable.itemFields = undefined
    }
    if (data.type !== undefined && data.type !== previousType && data.default === undefined) {
      variable.default = undefined
    }
    if (data.required === true && data.default === undefined) {
      variable.default = undefined
    }
    assertDrawableDefault(variable.type, variable.default)

    try {
      await variable.save()
    } catch (err) {
      if (isDuplicateName(err)) throw nameConflict()
      throw err
    }
    await touchTemplate(variable.templateId)

    return await this.list(templateId)
  }

  public async delete(templateId: string, variableId: string): Promise<VariableData[]> {
    const variable = await VariableDataModel.findOne({
      _id: toObjectId(variableId),
      templateId: toObjectId(templateId),
    })
    if (!variable) {
      throw new NotFoundError('Variable not found', 'VARIABLE_NOT_FOUND')
    }

    if (await this.isVariableInUse(variable.templateId.toString(), variableId)) {
      throw new ValidationError(
        `Cannot delete variable that is currently in use`,
        'VARIABLE_IN_USE',
        [`Variable "${variable.name}" is used by text, a condition or a repeated group`]
      )
    }

    await variable.deleteOne()
    await touchTemplate(variable.templateId)
    return await this.list(templateId)
  }

  private async list(templateId: string): Promise<VariableData[]> {
    const variables = await VariableDataModel.find({
      templateId: toObjectId(templateId),
    })
    return variables.map(variableToDTO)
  }

  // Anywhere in the trees: text runs inside containers, if-group conditions
  // and for-group lists all point at the variable by id.
  private async isVariableInUse(templateId: string, variableId: string): Promise<boolean> {
    const pages = await PageModel.find({
      templateId: toObjectId(templateId),
    }).select('shapes')

    return pages.some(page => collectVariableIds(page.shapes).has(variableId))
  }
}