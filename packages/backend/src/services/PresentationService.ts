import { PresentationModel } from '../models/Presentation.js'
import { SlideModel } from '../models/Slide.js'
import { VariableDataModel } from '../models/VariableData.js'
import {
  presentationCreateToModel,
  presentationToDTO,
  presentationToSummaryDTO,
  presentationUpdateToModel,
  slideCreateToModel,
  slidesReorderToOrderUpdates,
  slideToDTO,
  toObjectId,
  variableToDTO,
} from '../models/mappers.js'
import type { ImageShape, Presentation, PresentationDTO, PresentationSummary, Shape } from '@imprime/common'
import type { ImageService } from './ImageService.js'
import { NotFoundError } from './errors.js'

function collectImageIds(shapes: Shape[]): string[] {
  return shapes
    .filter((s): s is ImageShape => s.type === 'image')
    .map(s => s.imageId)
    .filter(Boolean)
}

export class PresentationService {
  constructor(private imageService: ImageService) {}

  public async list(): Promise<PresentationSummary[]> {
    const presentations = await PresentationModel.find().sort({ updatedAt: -1 })
    return presentations.map(presentationToSummaryDTO)
  }

  public async getById(id: string): Promise<Presentation> {
    const [presentation, slides, variables] = await Promise.all([
      PresentationModel.findById(id),
      SlideModel.find({ presentationId: toObjectId(id) }).sort({ order: 1 }),
      VariableDataModel.find({ presentationId: toObjectId(id) }),
    ])
    if (!presentation) {
      throw new NotFoundError('Presentation not found', 'PRESENTATION_NOT_FOUND')
    }
    return {
      ...presentationToDTO(presentation),
      slides: slides.map(slideToDTO),
      variableData: variables.map(variableToDTO),
    }
  }

  public async create(data: PresentationDTO.Create): Promise<Presentation> {
    const presentation = await PresentationModel.create(presentationCreateToModel(data))
    await SlideModel.create(slideCreateToModel(presentation._id, 0))
    return await this.getById(presentation._id.toString())
  }

  public async update(id: string, data: PresentationDTO.Update): Promise<Presentation> {
    const presentation = await PresentationModel.findById(id)
    if (!presentation) {
      throw new NotFoundError('Presentation not found', 'PRESENTATION_NOT_FOUND')
    }

    const update = presentationUpdateToModel(data)
    if (Object.keys(update).length) {
      Object.assign(presentation, update)
      await presentation.save()
    }

    if (data.slides) {
      const reorders = slidesReorderToOrderUpdates(data.slides)
      await Promise.all(reorders.map(r =>
        SlideModel.updateOne(
          { _id: r._id, presentationId: presentation._id },
          { order: r.order }
        )
      ))
    }

    return await this.getById(id)
  }

  public async delete(id: string): Promise<void> {
    const presentation = await PresentationModel.findById(id)
    if (!presentation) {
      throw new NotFoundError('Presentation not found', 'PRESENTATION_NOT_FOUND')
    }

    const slides = await SlideModel.find({ presentationId: presentation._id })
    const imageIds = slides.flatMap(slide => collectImageIds(slide.shapes))
    if (imageIds.length) {
      try {
        await this.imageService.deleteMany(imageIds)
      } catch (error) {
        console.error('Failed to delete associated images:', error)
      }
    }

    await SlideModel.deleteMany({ presentationId: presentation._id })
    await VariableDataModel.deleteMany({ presentationId: presentation._id })
    await PresentationModel.findByIdAndDelete(id)
  }
}
