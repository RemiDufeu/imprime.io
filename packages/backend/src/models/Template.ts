import { Schema, model, HydratedDocument } from 'mongoose'
import type { PageNumbering, PageSize } from '@imprime/common'

export interface ITemplate {
  title: string
  ownerId: string
  // Unset: the template has no code (see `isValidTemplateCode`).
  code?: string
  pageSize: PageSize
  // Unset numbers no page.
  pageNumbering?: PageNumbering
  createdAt?: Date
  updatedAt?: Date
}

// The box is a text shape, stored as Mixed as a page's shapes are.
const PageNumberingSchema = new Schema<PageNumbering>({
  box: { type: Schema.Types.Mixed, required: true },
  skipFirstPage: { type: Boolean },
}, { _id: false })

const TemplateSchema = new Schema<ITemplate>({
  title: { type: String, required: true, default: 'Untitled Template' },
  ownerId: { type: String, required: true, index: true },
  code: { type: String },
  pageSize: {
    width: { type: Number, required: true },
    height: { type: Number, required: true },
  },
  pageNumbering: { type: PageNumberingSchema },
}, { timestamps: true })

// A code names one template of its owner's: what an export by code finds.
// Partial, so that any number of templates go without one.
TemplateSchema.index(
  { ownerId: 1, code: 1 },
  { unique: true, partialFilterExpression: { code: { $type: 'string' } } }
)

export type TemplateDocument = HydratedDocument<ITemplate>

export const TemplateModel = model<ITemplate>('Template', TemplateSchema)
