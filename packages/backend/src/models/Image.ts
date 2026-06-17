import mongoose, { Schema, Document } from 'mongoose'

export interface ImageDocument extends Document {
  _id: mongoose.Types.ObjectId
  data: string // base64 encoded image
  mimeType: string // image/jpeg, image/png, etc.
  originalName?: string
  size: number // size in bytes
  createdAt: Date
  updatedAt: Date
}

const ImageSchema = new Schema({
  data: { type: String, required: true },
  mimeType: { type: String, required: true, default: 'image/jpeg' },
  originalName: { type: String },
  size: { type: Number, required: true },
}, { timestamps: true })

ImageSchema.index({ createdAt: 1 })

export const ImageModel = mongoose.model<ImageDocument>('Image', ImageSchema)
