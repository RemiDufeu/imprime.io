import type { Types } from 'mongoose'
import { PresentationModel } from '../models/Presentation.js'
import { SlideModel } from '../models/Slide.js'
import { VariableDataModel } from '../models/VariableData.js'
import { slideCreateToModel, slideUpdateToModel, toObjectId } from '../models/mappers.js'
import type { ImageShape, Shape, SlideDTO } from '@imprime/common'
import type { ImageService } from './ImageService.js'
import { NotFoundError, ValidationError } from './errors.js'

export class SlideService {
  constructor(private imageService: ImageService) { }

  async create(presentationId: string): Promise<void> {
    const presentation = await PresentationModel.findById(presentationId).select('_id')
    if (!presentation) {
      throw new NotFoundError('Presentation not found', 'PRESENTATION_NOT_FOUND')
    }
    const order = await SlideModel.countDocuments({ presentationId: presentation._id })
    await SlideModel.create(slideCreateToModel(presentation._id, order))
    await this.touchPresentation(presentation._id)
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

    const variables = await VariableDataModel.find({
      presentationId: slide.presentationId,
    }).select('_id')
    const validVariableIds = new Set(variables.map(v => v._id.toString()))

    const errors = this.validateVariableReferences(data.shapes, validVariableIds)
    if (errors.length) {
      throw new ValidationError('Invalid variable references', undefined, errors)
    }

    const oldImageIds = new Set(this.collectImageIds(slide.shapes))
    const newImageIds = new Set(this.collectImageIds(data.shapes))
    const removedImageIds = [...oldImageIds].filter(id => !newImageIds.has(id))

    for (const imageId of removedImageIds) {
      try {
        await this.imageService.delete(imageId)
      } catch (error) {
        console.error(`Failed to delete image ${imageId}:`, error)
      }
    }

    Object.assign(slide, slideUpdateToModel(data))
    await slide.save()
    await this.touchPresentation(slide.presentationId)
  }

  async delete(presentationId: string, slideId: string): Promise<void> {
    const slide = await SlideModel.findOne({
      _id: toObjectId(slideId),
      presentationId: toObjectId(presentationId),
    })
    if (!slide) {
      throw new NotFoundError('Slide not found', 'SLIDE_NOT_FOUND')
    }

    const imageIds = this.collectImageIds(slide.shapes)
    if (imageIds.length) {
      try {
        await this.imageService.deleteMany(imageIds)
      } catch (error) {
        console.error('Failed to delete associated images:', error)
      }
    }

    await slide.deleteOne()
    await this.touchPresentation(slide.presentationId)
  }

  private async touchPresentation(presentationId: Types.ObjectId): Promise<unknown> {
    return PresentationModel.updateOne(
      { _id: presentationId },
      { $currentDate: { updatedAt: true } }
    )
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
      }
    })
    return errors
  }

  private collectImageIds(shapes: Shape[]): string[] {
    return shapes
      .filter((s): s is ImageShape => s.type === 'image')
      .map(s => s.imageId)
      .filter(Boolean)
  }
}
