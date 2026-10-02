import { Schema, model, HydratedDocument } from 'mongoose'

export interface IFontFile {
  data: Buffer
  size: number
  originalName?: string
}

// A font family of the instance: every user can draw with it, only admins
// manage it.
export interface IFont {
  family: string
  // `family` lower-cased: the uniqueness key, so 'Brand' and 'brand' cannot
  // both exist.
  familyKey: string
  // Bumped by every face change; part of the name both renderers register the
  // family under, so neither keeps a replaced file from its cache.
  version: number
  faces: {
    regular: IFontFile
    bold?: IFontFile
    italic?: IFontFile
    boldItalic?: IFontFile
  }
  createdAt?: Date
  updatedAt?: Date
}

const FontFileSchema = new Schema<IFontFile>({
  data: { type: Buffer, required: true },
  size: { type: Number, required: true },
  originalName: { type: String },
}, { _id: false })

const FontSchema = new Schema<IFont>({
  family: { type: String, required: true },
  familyKey: { type: String, required: true, unique: true },
  version: { type: Number, required: true, default: 1 },
  faces: {
    regular: { type: FontFileSchema, required: true },
    bold: { type: FontFileSchema },
    italic: { type: FontFileSchema },
    boldItalic: { type: FontFileSchema },
  },
}, { timestamps: true })

export type FontDocument = HydratedDocument<IFont>

export const FontModel = model<IFont>('Font', FontSchema)
