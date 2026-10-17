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
import type {
  ItemFieldIssue,
  VariableDTO,
  VariableData,
  VariableItemField,
  VariableType,
  VariableValueType,
} from '@imprime/common'
import { collectPageVariableIds, exceedsMaxItems, exceedsMaxLength, findItemFieldIssue } from '@imprime/common'
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

// A limit is a positive whole number — of characters, or of items. Checked as
// sent, before the model casts it: Mongoose would turn "12" into 12.
function assertLimitValue(value: unknown, message: string, code: string): void {
  if (value !== undefined && !(Number.isInteger(value) && Number(value) > 0)) {
    throw new ValidationError(message, code)
  }
}

function assertMaxLengthValue(value: unknown): void {
  assertLimitValue(value, 'A max length must be a positive whole number', 'INVALID_VARIABLE_MAX_LENGTH')
}

function assertMaxItemsValue(value: unknown): void {
  assertLimitValue(value, 'A max number of items must be a positive whole number', 'INVALID_VARIABLE_MAX_ITEMS')
}

// The limits of a list's item fields, nested lists included, checked as sent
// like the variable's own.
function assertItemFieldLimits(fields: VariableItemField[] | undefined): void {
  for (const field of fields ?? []) {
    assertMaxLengthValue(field.maxLength)
    assertMaxItemsValue(field.maxItems)
    assertItemFieldLimits(field.itemFields)
  }
}

// What an item field's issue in a default says, after "The default".
function describeDefaultIssue(issue: ItemFieldIssue): string {
  switch (issue.problem) {
    case 'missing':
      return ` leaves the required field "${issue.path}" empty`
    case 'too-long':
      return `'s "${issue.path}" is longer than its max length of ${issue.field.maxLength} characters`
    case 'too-many':
      return `'s "${issue.path}" has more than its max of ${issue.field.maxItems} items`
  }
}

// A default is drawn whenever an export gives no value, so it must keep to the
// declaration: no longer than the limit and, for a list, no more items than
// its limit, and no item leaving a required field empty or a field's value
// longer than its limit.
function assertDefaultFits(
  variable: Pick<VariableData, 'type' | 'maxLength' | 'maxItems' | 'default' | 'itemFields'>,
): void {
  if (exceedsMaxLength(variable, variable.default)) {
    throw new ValidationError(
      `The default is longer than the max length of ${variable.maxLength} characters`,
      'INVALID_VARIABLE_DEFAULT',
    )
  }
  if (exceedsMaxItems(variable, variable.default)) {
    throw new ValidationError(
      `The default has more than the max of ${variable.maxItems} items`,
      'INVALID_VARIABLE_DEFAULT',
    )
  }
  if (variable.type !== 'object-list') return
  const issue = findItemFieldIssue(variable.default, variable.itemFields, 'default')
  if (!issue) return
  throw new ValidationError(`The default${describeDefaultIssue(issue)}`, 'INVALID_VARIABLE_DEFAULT')
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
    assertMaxLengthValue(data.maxLength)
    assertMaxItemsValue(data.maxItems)
    assertItemFieldLimits(data.itemFields)
    const model = variableCreateToModel(template._id, data)
    if (model.type !== 'string') model.maxLength = undefined
    if (model.type !== 'object-list') model.maxItems = undefined
    assertDefaultFits(model)

    const exists = await VariableDataModel.exists({
      templateId: template._id,
      name: data.name,
    })
    if (exists) {
      throw nameConflict()
    }

    try {
      await VariableDataModel.create({
        ...model,
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

    if (data.maxLength !== null) assertMaxLengthValue(data.maxLength)
    if (data.maxItems !== null) assertMaxItemsValue(data.maxItems)
    assertItemFieldLimits(data.itemFields)

    const previousType = variable.type
    Object.assign(variable, variableUpdateToModel(data))

    if (variable.type !== 'object-list') {
      variable.itemFields = undefined
      variable.maxItems = undefined
    }
    if (variable.type !== 'string') {
      variable.maxLength = undefined
    }
    if (data.type !== undefined && data.type !== previousType && data.default === undefined) {
      variable.default = undefined
    }
    if (data.required === true && data.default === undefined) {
      variable.default = undefined
    }
    assertDrawableDefault(variable.type, variable.default)
    assertDefaultFits(variable)

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
        [`Variable "${variable.name}" is used by text, an image, a condition, or a repeated group or page`]
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

  // Anywhere in the trees: text runs inside groups, image boxes, conditions
  // and repeats all point at the variable by id — and so do a page's own
  // condition and repeat.
  private async isVariableInUse(templateId: string, variableId: string): Promise<boolean> {
    const pages = await PageModel.find({
      templateId: toObjectId(templateId),
    }).select('shapes visibleWhen repeat')

    return pages.some(page => collectPageVariableIds(page).has(variableId))
  }
}