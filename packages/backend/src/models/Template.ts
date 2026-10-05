import { Schema, model, HydratedDocument } from 'mongoose'
import type { PageSize } from '@imprime/common'
import { DEFAULT_PAGE_SIZE } from '@imprime/common'

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
  // Templates stored before formats existed have none until the
  // migrate:templates script writes it; the default covers them meanwhile.
  pageSize: {
    width: { type: Number, required: true, default: DEFAULT_PAGE_SIZE.width },
    height: { type: Number, required: true, default: DEFAULT_PAGE_SIZE.height },
  },
}, { timestamps: true })

export type TemplateDocument = HydratedDocument<ITemplate>

export const TemplateModel = model<ITemplate>('Template', TemplateSchema)
