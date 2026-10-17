import { Schema, model, Types, HydratedDocument } from 'mongoose'
import type { PageRepeat, Shape, VisibilityCondition } from '@imprime/common'
import { collectImageIds } from '@imprime/common'

// `shapes` is stored as Mixed — Mongoose can't validate the discriminated
export interface IPage {
  templateId: Types.ObjectId
  order: number
  shapes: Shape[]
  // Unset is always exported, and not repeated.
  visibleWhen?: VisibilityCondition
  repeat?: PageRepeat
  // Derived from `shapes` on every save (see the hook below), so "does any
  // page still show this image?" is an indexed query rather than a walk of
  // every tree. An image can be shared: duplicating or pasting an image shape
  // keeps its `imageId`, on any page of any template.
  imageIds: string[]
  createdAt?: Date
  updatedAt?: Date
}

const VisibilityConditionSchema = new Schema<VisibilityCondition>({
  variableId: { type: String },
  itemPath: { type: String },
  negate: { type: Boolean },
}, { _id: false })

const PageRepeatSchema = new Schema<PageRepeat>({
  variableId: { type: String },
}, { _id: false })

const PageSchema = new Schema<IPage>({
  templateId: { type: Schema.Types.ObjectId, ref: 'Template', required: true, index: true },
  order: { type: Number, required: true },
  shapes: [{ type: Schema.Types.Mixed }],
  visibleWhen: { type: VisibilityConditionSchema },
  repeat: { type: PageRepeatSchema },
  imageIds: { type: [String], index: true },
}, { timestamps: true })

// Kept here rather than in the service so no write path can forget it.
// `updateOne` and `bulkWrite` skip hooks: they must not touch `shapes`.
PageSchema.pre('save', function () {
  if (this.isNew || this.isModified('shapes')) {
    this.imageIds = [...new Set(collectImageIds(this.shapes))]
  }
})

export type PageDocument = HydratedDocument<IPage>

export const PageModel = model<IPage>('Page', PageSchema)
