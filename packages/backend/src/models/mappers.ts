import mongoose, { Types } from 'mongoose'
import type {
  FontDTO,
  Presentation,
  PresentationDTO,
  PresentationSummary,
  Slide,
  SlideDTO,
  VariableData,
  VariableDTO,
} from '@imprime/common'
import type { FontDocument, IFont, IFontFile } from './Font.js'
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
    itemFields: doc.itemFields,
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
): Pick<IVariableData, 'presentationId' | 'type' | 'name' | 'default' | 'required' | 'itemFields'> {
  return {
    presentationId,
    type: dto.type,
    name: dto.name,
    default: dto.default,
    required: dto.required ?? false,
    itemFields: dto.itemFields,
  }
}

export function variableUpdateToModel(
  dto: VariableDTO.Update
): Partial<Pick<IVariableData, 'type' | 'name' | 'default' | 'required' | 'itemFields'>> {
  const update: Partial<Pick<IVariableData, 'type' | 'name' | 'default' | 'required' | 'itemFields'>> = {}
  if (dto.type !== undefined) update.type = dto.type
  if (dto.name !== undefined) update.name = dto.name
  if (dto.default !== undefined) update.default = dto.default ?? undefined
  if (dto.required !== undefined) update.required = dto.required
  if (dto.itemFields !== undefined) update.itemFields = dto.itemFields
  return update
}

// Reads only the faces' metadata, so it accepts a document loaded without the
// file data.
export function fontToDTO(doc: FontDocument): FontDTO.Response {
  const faces: FontDTO.Response['faces'] = { regular: fontFileToDTO(doc.faces.regular) }
  if (doc.faces.bold) faces.bold = fontFileToDTO(doc.faces.bold)
  if (doc.faces.italic) faces.italic = fontFileToDTO(doc.faces.italic)
  if (doc.faces.boldItalic) faces.boldItalic = fontFileToDTO(doc.faces.boldItalic)

  return {
    _id: doc._id.toString(),
    family: doc.family,
    version: doc.version,
    faces,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

function fontFileToDTO(file: IFontFile): FontDTO.FaceInfo {
  return { size: file.size, originalName: file.originalName }
}

// `family` is the validated, trimmed name.
export function fontCreateToModel(
  family: string,
  regular: IFontFile
): Pick<IFont, 'family' | 'familyKey' | 'version' | 'faces'> {
  return {
    family,
    familyKey: family.toLowerCase(),
    version: 1,
    faces: { regular },
  }
}

export function toObjectId(id: string): Types.ObjectId {
  return new mongoose.Types.ObjectId(id)
}
