import { Schema, model, Types, HydratedDocument } from 'mongoose'

export interface IVariableData {
  presentationId: Types.ObjectId
  type: 'string'
  name: string
  default?: string
  required?: boolean
}

const VariableDataSchema = new Schema<IVariableData>({
  presentationId: { type: Schema.Types.ObjectId, ref: 'Presentation', required: true, index: true },
  type: { type: String, required: true, enum: ['string'], default: 'string' },
  name: { type: String, required: true },
  default: { type: String },
  required: { type: Boolean, default: false },
})

export type VariableDataDocument = HydratedDocument<IVariableData>

export const VariableDataModel = model<IVariableData>('VariableData', VariableDataSchema)
