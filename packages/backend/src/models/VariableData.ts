import { Schema, model, Types, HydratedDocument } from 'mongoose'
import type { VariableType, VariableValueType } from '@imprime/common'

export interface IVariableData {
  presentationId: Types.ObjectId
  type: VariableType
  name: string
  default?: VariableValueType
  required?: boolean
}

const VariableDataSchema = new Schema<IVariableData>({
  presentationId: { type: Schema.Types.ObjectId, ref: 'Presentation', required: true, index: true },
  type: { type: String, required: true, enum: ['string', 'boolean', 'string-list'], default: 'string' },
  name: { type: String, required: true },
  default: { type: Schema.Types.Mixed },
  required: { type: Boolean, default: false },
})

export type VariableDataDocument = HydratedDocument<IVariableData>

export const VariableDataModel = model<IVariableData>('VariableData', VariableDataSchema)
