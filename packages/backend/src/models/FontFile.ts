import { Schema, model, HydratedDocument, Types } from 'mongoose'
import { FONT_VARIANTS, type FontVariant } from '@imprime/common'

// The file of one face of a `Font`. Kept out of the font's document so a
// family's faces do not share MongoDB's 16 MB document limit, and so listing
// fonts never loads a file.
export interface IFontFile {
  fontId: Types.ObjectId
  variant: FontVariant
  data: Buffer
}

const FontFileSchema = new Schema<IFontFile>({
  fontId: { type: Schema.Types.ObjectId, required: true, index: true },
  variant: { type: String, required: true, enum: [...FONT_VARIANTS] },
  data: { type: Buffer, required: true },
})

FontFileSchema.index({ fontId: 1, variant: 1 }, { unique: true })

export type FontFileDocument = HydratedDocument<IFontFile>

export const FontFileModel = model<IFontFile>('FontFile', FontFileSchema)
