import { Schema, model, HydratedDocument } from 'mongoose'

// What the font knows of one of its faces. The file itself is a `FontFile`.
export interface IFontFace {
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
    regular: IFontFace
    bold?: IFontFace
    italic?: IFontFace
    boldItalic?: IFontFace
  }
  createdAt?: Date
  updatedAt?: Date
}

const FontFaceSchema = new Schema<IFontFace>({
  size: { type: Number, required: true },
  originalName: { type: String },
}, { _id: false })

const FontSchema = new Schema<IFont>({
  family: { type: String, required: true },
  familyKey: { type: String, required: true, unique: true },
  version: { type: Number, required: true, default: 1 },
  faces: {
    regular: { type: FontFaceSchema, required: true },
    bold: { type: FontFaceSchema },
    italic: { type: FontFaceSchema },
    boldItalic: { type: FontFaceSchema },
  },
}, { timestamps: true })

export type FontDocument = HydratedDocument<IFont>

export const FontModel = model<IFont>('Font', FontSchema)
