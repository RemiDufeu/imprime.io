import mongoose, { Types } from 'mongoose'
import type {
  Presentation,
  PresentationDTO,
  PresentationSummary,
  Slide,
  SlideDTO,
  VariableData,
  VariableDTO,
} from '@imprime/common'
import type { IPresentation, PresentationDocument } from './Presentation.js'
import type { ISlide, SlideDocument } from './Slide.js'
import type { IVariableData, VariableDataDocument } from './VariableData.js'

export function slideToDTO(doc: SlideDocument): Slide {
  return {
    _id: doc._id.toString(),
    order: doc.order,
    shapes: doc.shapes,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

export function variableToDTO(doc: VariableDataDocument): VariableData {
  return {
    _id: doc._id.toString(),
    type: doc.type,
    name: doc.name,
    default: doc.default,
    required: doc.required,
  }
}

export function presentationToSummaryDTO(doc: PresentationDocument): PresentationSummary {
  return {
    _id: doc._id.toString(),
    title: doc.title,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

export function presentationToDTO(doc: PresentationDocument): Omit<Presentation, 'slides' | 'variableData'> {
  return presentationToSummaryDTO(doc)
}

export function presentationCreateToModel(
  dto: PresentationDTO.Create
): Pick<IPresentation, 'title'> {
  return {
    title: dto.title || 'Untitled Presentation',
  }
}

export function presentationUpdateToModel(
  dto: PresentationDTO.Update
): Partial<Pick<IPresentation, 'title'>> {
  const update: Partial<Pick<IPresentation, 'title'>> = {}
  if (dto.title !== undefined) update.title = dto.title
  return update
}

export function slideCreateToModel(
  presentationId: Types.ObjectId,
  order: number
): Pick<ISlide, 'presentationId' | 'order' | 'shapes'> {
  return {
    presentationId,
    order,
    shapes: [],
  }
}

export function slideUpdateToModel(
  dto: SlideDTO.Update
): Partial<Pick<ISlide, 'shapes'>> {
  return { shapes: dto.shapes }
}

export function slidesReorderToOrderUpdates(
  slides: Slide[]
): Array<{ _id: string; order: number }> {
  return slides.map((slide, idx) => ({ _id: slide._id, order: idx }))
}

export function variableCreateToModel(
  presentationId: Types.ObjectId,
  dto: VariableDTO.Create
): Pick<IVariableData, 'presentationId' | 'type' | 'name' | 'default' | 'required'> {
  return {
    presentationId,
    type: dto.type,
    name: dto.name,
    default: dto.default,
    required: dto.required ?? false,
  }
}

export function variableUpdateToModel(
  dto: VariableDTO.Update
): Partial<Pick<IVariableData, 'type' | 'name' | 'default' | 'required'>> {
  const update: Partial<Pick<IVariableData, 'type' | 'name' | 'default' | 'required'>> = {}
  if (dto.type !== undefined) update.type = dto.type
  if (dto.name !== undefined) update.name = dto.name
  if (dto.default !== undefined) update.default = dto.default
  if (dto.required !== undefined) update.required = dto.required
  return update
}

export function toObjectId(id: string): Types.ObjectId {
  return new mongoose.Types.ObjectId(id)
}
