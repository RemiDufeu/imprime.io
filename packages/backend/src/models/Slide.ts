import { Schema, model, Types, HydratedDocument } from 'mongoose'
import type { Shape } from '@imprime/common'
import { isContainerShape } from '@imprime/common'

// `shapes` is stored as Mixed — Mongoose can't validate the discriminated
export interface ISlide {
  presentationId: Types.ObjectId
  order: number
  shapes: Shape[]
  // Derived from `shapes` on every save (see the hook below), so "does any
  // slide still show this image?" is an indexed query rather than a walk of
  // every tree. An image can be shared: duplicating or pasting an image shape
  // keeps its `imageId`, on any slide of any presentation.
  imageIds: string[]
  createdAt?: Date
  updatedAt?: Date
}

// Every image a shape tree shows, containers included.
export function collectImageIds(shapes: Shape[]): string[] {
  const ids: string[] = []
  for (const shape of shapes) {
    if (shape.type === 'image') {
      if (shape.imageId) ids.push(shape.imageId)
    } else if (isContainerShape(shape)) {
      ids.push(...collectImageIds(shape.children))
    }
  }
  return ids
}

const SlideSchema = new Schema<ISlide>({
  presentationId: { type: Schema.Types.ObjectId, ref: 'Presentation', required: true, index: true },
  order: { type: Number, required: true },
  shapes: [{ type: Schema.Types.Mixed }],
  imageIds: { type: [String], index: true },
}, { timestamps: true })

// Kept here rather than in the service so no write path can forget it.
// `updateOne` and `bulkWrite` skip hooks: they must not touch `shapes`.
SlideSchema.pre('save', function () {
  if (this.isNew || this.isModified('shapes')) {
    this.imageIds = [...new Set(collectImageIds(this.shapes))]
  }
})

export type SlideDocument = HydratedDocument<ISlide>

export const SlideModel = model<ISlide>('Slide', SlideSchema)
