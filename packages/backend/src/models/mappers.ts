import mongoose, { Types } from 'mongoose'
import type {
  FontDTO,
  FontVariant,
  Presentation,
  PresentationDTO,
  PresentationSummary,
  Slide,
  SlideDTO,
  VariableData,
  VariableDTO,
} from '@imprime/common'
import type { FontDocument, IFont, IFontFace } from './Font.js'
import type { IFontFile } from './FontFile.js'
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

export function fontToDTO(doc: FontDocument): FontDTO.Response {
  const faces: FontDTO.Response['faces'] = { regular: fontFaceToDTO(doc.faces.regular) }
  if (doc.faces.bold) faces.bold = fontFaceToDTO(doc.faces.bold)
  if (doc.faces.italic) faces.italic = fontFaceToDTO(doc.faces.italic)
  if (doc.faces.boldItalic) faces.boldItalic = fontFaceToDTO(doc.faces.boldItalic)

  return {
    _id: doc._id.toString(),
    family: doc.family,
    version: doc.version,
    faces,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

function fontFaceToDTO(face: IFontFace): FontDTO.FaceInfo {
  return { size: face.size, originalName: face.originalName }
}

// `family` is the validated, trimmed name.
export function fontCreateToModel(
  family: string,
  regular: IFontFace
): Pick<IFont, 'family' | 'familyKey' | 'version' | 'faces'> {
  return {
    family,
    familyKey: family.toLowerCase(),
    version: 1,
    faces: { regular },
  }
}

// The font comes from the document just created or the verified route param,
// never from the request body.
export function fontFileCreateToModel(fontId: Types.ObjectId, variant: FontVariant, data: Buffer): IFontFile {
  return { fontId, variant, data }
}

export function toObjectId(id: string): Types.ObjectId {
  return new mongoose.Types.ObjectId(id)
}
