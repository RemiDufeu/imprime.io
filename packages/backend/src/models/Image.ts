import mongoose, { Schema, Document } from 'mongoose'

export interface ImageDocument extends Document {
  _id: mongoose.Types.ObjectId
  // The user who uploaded it: the only one who reads it, deletes it, or has
  // it drawn in an export. Image ids are ObjectIds, which follow each other.
  ownerId: string
  data: string // base64 encoded image
  mimeType: string // image/jpeg, image/png, etc.
  originalName?: string
  size: number // size in bytes
  // Set while no slide shows the image; see ORPHAN_GRACE_SECONDS.
  orphanedAt?: Date
  createdAt: Date
  updatedAt: Date
}

const ImageSchema = new Schema({
  ownerId: { type: String, required: true, index: true },
  data: { type: String, required: true },
  mimeType: { type: String, required: true, default: 'image/jpeg' },
  originalName: { type: String },
  size: { type: Number, required: true },
  orphanedAt: { type: Date },
}, { timestamps: true })

ImageSchema.index({ createdAt: 1 })

// An image that leaves its slide is not deleted at once: the editor can undo
// that, and the undo shows the image again by the same id. MongoDB's TTL
// monitor deletes it once it has been orphaned this long; documents without
// `orphanedAt` never expire.
export const ORPHAN_GRACE_SECONDS = 7 * 24 * 60 * 60
ImageSchema.index({ orphanedAt: 1 }, { expireAfterSeconds: ORPHAN_GRACE_SECONDS })

export const ImageModel = mongoose.model<ImageDocument>('Image', ImageSchema)
