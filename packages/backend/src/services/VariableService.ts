import { PresentationModel } from '../models/Presentation.js'
import { SlideModel } from '../models/Slide.js'
import { VariableDataModel } from '../models/VariableData.js'
import {
  toObjectId,
  variableCreateToModel,
  variableToDTO,
  variableUpdateToModel,
} from '../models/mappers.js'
import type { VariableDTO, VariableData } from '@imprime/common'
import { touchPresentation } from './PresentationService.js'
import { NotFoundError, ConflictError, ValidationError } from './errors.js'

const nameConflict = () =>
  new ConflictError('Variable name already exists in this presentation', 'VARIABLE_NAME_EXISTS')

function isDuplicateName(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000
}

export class VariableService {
  public async create(presentationId: string, data: VariableDTO.Create): Promise<VariableData[]> {
    const presentation = await PresentationModel.findById(presentationId).select('_id')
    if (!presentation) {
      throw new NotFoundError('Presentation not found', 'PRESENTATION_NOT_FOUND')
    }

    const exists = await VariableDataModel.exists({
      presentationId: presentation._id,
      name: data.name,
    })
    if (exists) {
      throw nameConflict()
    }

    try {
      await VariableDataModel.create(variableCreateToModel(presentation._id, data))
    } catch (err) {
      if (isDuplicateName(err)) throw nameConflict()
      throw err
    }
    await touchPresentation(presentation._id)
    return await this.list(presentation._id.toString())
  }

  public async update(
    presentationId: string,
    variableId: string,
    data: VariableDTO.Update
  ): Promise<VariableData[]> {
    const variable = await VariableDataModel.findOne({
      _id: toObjectId(variableId),
      presentationId: toObjectId(presentationId),
    })
    if (!variable) {
      throw new NotFoundError('Variable not found', 'VARIABLE_NOT_FOUND')
    }

    if (data.name && data.name !== variable.name) {
      const conflict = await VariableDataModel.exists({
        presentationId: variable.presentationId,
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

    try {
      await variable.save()
    } catch (err) {
      if (isDuplicateName(err)) throw nameConflict()
      throw err
    }
    await touchPresentation(variable.presentationId)

    return await this.list(presentationId)
  }

  public async delete(presentationId: string, variableId: string): Promise<VariableData[]> {
    const variable = await VariableDataModel.findOne({
      _id: toObjectId(variableId),
      presentationId: toObjectId(presentationId),
    })
    if (!variable) {
      throw new NotFoundError('Variable not found', 'VARIABLE_NOT_FOUND')
    }

    if (await this.isVariableInUse(variable.presentationId.toString(), variableId)) {
      throw new ValidationError(
        `Cannot delete variable that is currently in use`,
        'VARIABLE_IN_USE',
        [`Variable "${variable.name}" is being used in one or more text boxes`]
      )
    }

    await variable.deleteOne()
    await touchPresentation(variable.presentationId)
    return await this.list(presentationId)
  }

  private async list(presentationId: string): Promise<VariableData[]> {
    const variables = await VariableDataModel.find({
      presentationId: toObjectId(presentationId),
    })
    return variables.map(variableToDTO)
  }

  private async isVariableInUse(presentationId: string, variableId: string): Promise<boolean> {
    const slides = await SlideModel.find({
      presentationId: toObjectId(presentationId),
    }).select('shapes')

    return slides.some(slide =>
      (slide.shapes).some(shape => {
        if (shape.type !== 'text') return false
        return shape.paragraphes?.some(paragraph =>
          paragraph.children?.some(child =>
            'type' in child && child.type === 'variable' && child.variableId === variableId
          )
        )
      })
    )
  }
}