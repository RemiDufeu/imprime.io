import { Schema, model, HydratedDocument } from 'mongoose'
import type { PageSize } from '@imprime/common'

export interface ITemplate {
  title: string
  ownerId: string
  pageSize: PageSize
  createdAt?: Date
  updatedAt?: Date
}

const TemplateSchema = new Schema<ITemplate>({
  title: { type: String, required: true, default: 'Untitled Template' },
  ownerId: { type: String, required: true, index: true },
  pageSize: {
    width: { type: Number, required: true },
    height: { type: Number, required: true },
  },
}, { timestamps: true })

export type TemplateDocument = HydratedDocument<ITemplate>

export const TemplateModel = model<ITemplate>('Template', TemplateSchema)
