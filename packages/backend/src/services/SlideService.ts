import { PresentationModel } from '../models/Presentation.js'
import { SlideModel } from '../models/Slide.js'
import { VariableDataModel } from '../models/VariableData.js'
import { isObjectIdString, slideCreateToModel, slideToDTO, slideUpdateToModel, toObjectId } from '../models/mappers.js'
import type { Shape, Slide, SlideDTO } from '@imprime/common'
import { isContainerShape } from '@imprime/common'
import type { Types } from 'mongoose'
import { collectImageIds, type ImageService } from './ImageService.js'
import { touchPresentation } from './PresentationService.js'
import { ConflictError, NotFoundError, ValidationError } from './errors.js'

const slideIdTaken = () => new ConflictError('Slide id already in use', 'SLIDE_ID_TAKEN')

function isDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000
}

export class SlideService {
  constructor(private imageService: ImageService) { }

  async create(presentationId: string, data: SlideDTO.Create = {}): Promise<Slide> {
    const presentation = await PresentationModel.findById(presentationId).select('_id')
    if (!presentation) {
      throw new NotFoundError('Presentation not found', 'PRESENTATION_NOT_FOUND')
    }
    if (data.order !== undefined && !Number.isInteger(data.order)) {
      throw new ValidationError('order must be an integer')
    }
    if (data.shapes !== undefined && !Array.isArray(data.shapes)) {
      throw new ValidationError('shapes must be an array')
    }
    if (data._id !== undefined) {
      if (!isObjectIdString(data._id)) {
        throw new ValidationError('Invalid slide id', 'INVALID_SLIDE_ID')
      }
      if (await SlideModel.exists({ _id: toObjectId(data._id) })) {
        throw slideIdTaken()
      }
    }

    const shapes = data.shapes ?? []
    await this.assertVariableReferences(presentation._id, shapes)

    const siblings = await SlideModel.find({ presentationId: presentation._id })
      .sort({ order: 1 })
      .select('_id order')
    const position = Math.max(0, Math.min(data.order ?? siblings.length, siblings.length))

    const slide = await SlideModel.create({
      ...slideCreateToModel(presentation._id, position, shapes),
      ...(data._id !== undefined ? { _id: toObjectId(data._id) } : {}),
    }).catch((err: unknown) => {
      // The id was free a moment ago: a concurrent restore took it.
      throw isDuplicateKey(err) ? slideIdTaken() : err
    })

    // Dense orders, with a gap at `position` for the new slide. Rewriting them
    // all also repairs the duplicates a count-based order used to leave behind
    // after a deletion.
    const renumbered = siblings
      .map((sibling, index) => ({ sibling, order: index < position ? index : index + 1 }))
      .filter(({ sibling, order }) => sibling.order !== order)
    if (renumbered.length) {
      await SlideModel.bulkWrite(renumbered.map(({ sibling, order }) => ({
        updateOne: { filter: { _id: sibling._id }, update: { order } },
      })))
    }

    try {
      await this.imageService.markReferenced(collectImageIds(shapes))
    } catch (error) {
      console.error('Failed to keep the images of a restored slide:', error)
    }

    await touchPresentation(presentation._id)
    return slideToDTO(slide)
  }

  async updateShapes(
    presentationId: string,
    slideId: string,
    data: SlideDTO.Update
  ): Promise<void> {
    const slide = await SlideModel.findOne({
      _id: toObjectId(slideId),
      presentationId: toObjectId(presentationId),
    })
    if (!slide) {
      throw new NotFoundError('Slide not found', 'SLIDE_NOT_FOUND')
    }

    await this.assertVariableReferences(slide.presentationId, data.shapes)

    const oldImageIds = new Set(collectImageIds(slide.shapes))
    const newImageIds = new Set(collectImageIds(data.shapes))
    const removedImageIds = [...oldImageIds].filter(id => !newImageIds.has(id))
    const addedImageIds = [...newImageIds].filter(id => !oldImageIds.has(id))

    // Not deleted: the editor can undo the removal. See ORPHAN_GRACE_SECONDS.
    try {
      await this.imageService.markOrphaned(removedImageIds)
      await this.imageService.markReferenced(addedImageIds)
    } catch (error) {
      console.error('Failed to update image references:', error)
    }

    Object.assign(slide, slideUpdateToModel(data))
    await slide.save()
    await touchPresentation(slide.presentationId)
  }

  async delete(presentationId: string, slideId: string): Promise<void> {
    const slide = await SlideModel.findOne({
      _id: toObjectId(slideId),
      presentationId: toObjectId(presentationId),
    })
    if (!slide) {
      throw new NotFoundError('Slide not found', 'SLIDE_NOT_FOUND')
    }

    // Orphaned rather than deleted, so restoring the slide shows them again.
    try {
      await this.imageService.markOrphaned(collectImageIds(slide.shapes))
    } catch (error) {
      console.error('Failed to release the images of a deleted slide:', error)
    }

    await slide.deleteOne()
    await touchPresentation(slide.presentationId)
  }

  private async assertVariableReferences(presentationId: Types.ObjectId, shapes: Shape[]): Promise<void> {
    if (shapes.length === 0) return
    const variables = await VariableDataModel.find({ presentationId }).select('_id')
    const validVariableIds = new Set(variables.map(v => v._id.toString()))

    const errors = this.validateVariableReferences(shapes, validVariableIds)
    if (errors.length) {
      throw new ValidationError('Invalid variable references', undefined, errors)
    }
  }

  private validateVariableReferences(shapes: Shape[], validVariableIds: Set<string>): string[] {
    const errors: string[] = []
    shapes.forEach((shape, shapeIndex) => {
      if (shape.type === 'text') {
        shape.paragraphes?.forEach((paragraph, paraIndex) => {
          paragraph.children?.forEach((child, childIndex) => {
            if ('type' in child && child.type === 'variable') {
              if (!validVariableIds.has(child.variableId)) {
                errors.push(
                  `Invalid variable reference in shape ${shapeIndex}, paragraph ${paraIndex}, child ${childIndex}: ` +
                  `variableId "${child.variableId}" does not exist in this presentation`
                )
              }
            }
          })
        })
      } else if (isContainerShape(shape)) {
        errors.push(...this.validateVariableReferences(shape.children, validVariableIds))
      }
    })
    return errors
  }
}
