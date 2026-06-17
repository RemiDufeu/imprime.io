import { Schema, model, HydratedDocument } from 'mongoose'

export interface IPresentation {
  title: string
  createdAt?: Date
  updatedAt?: Date
}

const PresentationSchema = new Schema<IPresentation>({
  title: { type: String, required: true, default: 'Untitled Presentation' },
}, { timestamps: true })

export type PresentationDocument = HydratedDocument<IPresentation>

export const PresentationModel = model<IPresentation>('Presentation', PresentationSchema)
