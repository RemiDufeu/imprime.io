import { Schema, model, Types, HydratedDocument } from 'mongoose'
import type { VariableItemField, VariableType, VariableValueType } from '@imprime/common'

export interface IVariableData {
  presentationId: Types.ObjectId
  type: VariableType
  name: string
  default?: VariableValueType
  required?: boolean
  itemFields?: VariableItemField[]
}

const VARIABLE_TYPES: VariableType[] = ['string', 'boolean', 'object-list']

// Declared with the nested `{ type: ... }` form because one of the paths is
// itself called `type`: the bare `{ type: String }` shorthand would be read as
// this schema's own type declaration instead of a path named `type`.
const VariableItemFieldSchema = new Schema<VariableItemField>(
  {
    name: { type: String, required: true },
    type: { type: String, required: true, enum: VARIABLE_TYPES },
  },
  { _id: false }
)

// Added after construction because the path refers to the schema being defined:
// an `object-list` field declares the fields of its own items. `default:
// undefined` keeps an absent list absent rather than materialising `[]`, which
// would otherwise reach the DTO as a declared-but-empty schema.
VariableItemFieldSchema.add({
  itemFields: { type: [VariableItemFieldSchema], default: undefined },
})

const VariableDataSchema = new Schema<IVariableData>({
  presentationId: { type: Schema.Types.ObjectId, ref: 'Presentation', required: true, index: true },
  type: { type: String, required: true, enum: VARIABLE_TYPES, default: 'string' },
  name: { type: String, required: true },
  default: { type: Schema.Types.Mixed },
  required: { type: Boolean, default: false },
  itemFields: { type: [VariableItemFieldSchema], default: undefined },
})

VariableDataSchema.index({ presentationId: 1, name: 1 }, { unique: true })

export type VariableDataDocument = HydratedDocument<IVariableData>

export const VariableDataModel = model<IVariableData>('VariableData', VariableDataSchema)
