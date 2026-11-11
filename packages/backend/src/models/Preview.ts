import { Schema, model, Types, HydratedDocument } from 'mongoose'

export interface IPreview {
  templateId: Types.ObjectId
  // The template's owner, who alone may open the preview.
  ownerId: string
  // The values, as JSON: they are only ever read back whole, and a variable's
  // name — a key of the object — is anything its author typed, dots and `$`
  // included, which a stored object's keys must not be.
  variableValues: string
  expiresAt: Date
  createdAt?: Date
  updatedAt?: Date
}

const PreviewSchema = new Schema<IPreview>({
  templateId: { type: Schema.Types.ObjectId, ref: 'Template', required: true, index: true },
  ownerId: { type: String, required: true, index: true },
  variableValues: { type: String, required: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: true })

// MongoDB's TTL monitor deletes a preview once `expiresAt` has passed — within
// a minute or so of it, which is why reads check the date too.
PreviewSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export type PreviewDocument = HydratedDocument<IPreview>

export const PreviewModel = model<IPreview>('Preview', PreviewSchema)
