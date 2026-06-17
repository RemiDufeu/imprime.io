import { Schema, model, Types, HydratedDocument } from 'mongoose'
import type { Shape } from '@imprime/common'

// `shapes` is stored as Mixed — Mongoose can't validate the discriminated
export interface ISlide {
  presentationId: Types.ObjectId
  order: number
  shapes: Shape[]
  createdAt?: Date
  updatedAt?: Date
}

const SlideSchema = new Schema<ISlide>({
  presentationId: { type: Schema.Types.ObjectId, ref: 'Presentation', required: true, index: true },
  order: { type: Number, required: true },
  shapes: [{ type: Schema.Types.Mixed }],
}, { timestamps: true })

export type SlideDocument = HydratedDocument<ISlide>

export const SlideModel = model<ISlide>('Slide', SlideSchema)
