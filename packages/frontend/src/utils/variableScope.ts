import type { Shape, VariableData, VariableItemField, VariableType } from '@imprime/sdk'
import { ITEM_PATH_SEPARATOR, joinItemPath } from '@imprime/sdk'
import { findAncestorPath } from './shapeTree'

// One field of a for-group's current item, reachable from a given shape. The
// editor cannot show what a field will hold — it never resolves values — so the
// pickers offer declared fields and the renderer resolves them at export.
export interface ItemFieldOption {
  variableId: string
  variableName: string
  // Dotted path from the variable's root, exactly what lands in a shape's or a
  // text run's `itemPath`.
  itemPath: string
  type: VariableType
  label: string
}

/**
 * Walk a dotted path through a declared item schema and return the field it
 * names, or `undefined` when any segment is missing — which is exactly what a
 * path pointing at a field that no longer exists looks like.
 *
 * The empty path names no field: it addresses the variable itself, whose type
 * lives on the definition rather than in the schema.
 */
export function itemFieldAtPath(
  fields: VariableItemField[] | undefined,
  path: string,
): VariableItemField | undefined {
  if (path === '') return undefined

  let current = fields ?? []
  let field: VariableItemField | undefined
  for (const segment of path.split(ITEM_PATH_SEPARATOR)) {
    field = current.find(f => f.name === segment)
    if (!field) return undefined
    current = field.itemFields ?? []
  }
  return field
}

// The fields declared *inside* the path, i.e. the ones an iteration over it
// would expose. Only an `object-list` has any.
function fieldsAtPath(variable: VariableData, path: string): VariableItemField[] {
  if (path === '') return variable.itemFields ?? []
  const field = itemFieldAtPath(variable.itemFields, path)
  return field?.type === 'object-list' ? field.itemFields ?? [] : []
}

/**
 * The item fields a shape can address, taken from the for-groups it sits
 * inside. Outermost group first, so a picker lists the enclosing loops in the
 * order they are nested.
 *
 * `type` filters to what the caller can consume: 'string' for a text run,
 * 'boolean' for an if-group condition, 'object-list' for a nested for-group.
 */
export function itemFieldsInScope(
  shapes: Shape[],
  shapeId: string,
  variables: VariableData[],
  type: VariableType,
): ItemFieldOption[] {
  const ancestors = findAncestorPath(shapes, shapeId)
  if (!ancestors) return []

  const options: ItemFieldOption[] = []
  for (const ancestor of ancestors) {
    if (ancestor.type !== 'for-group' || !ancestor.itemsVariable) continue
    const variable = variables.find(v => v._id === ancestor.itemsVariable)
    if (!variable) continue

    const basePath = ancestor.itemPath ?? ''
    for (const field of fieldsAtPath(variable, basePath)) {
      if (field.type !== type) continue
      const itemPath = joinItemPath(basePath, field.name)
      options.push({
        variableId: variable._id,
        variableName: variable.name,
        itemPath,
        type: field.type,
        label: `${variable.name}.${itemPath}`,
      })
    }
  }
  return options
}

// The value a Select carries for an item-field option. A variable id alone
// cannot identify one, since several loops on the same variable are in scope at
// different depths. Item field names are restricted to the same character set
// as variable names, so neither separator can occur inside a segment.
const SEPARATOR = '::'

export function encodeItemFieldValue(variableId: string, itemPath: string): string {
  return `${variableId}${SEPARATOR}${itemPath}`
}

export function decodeItemFieldValue(
  value: string | undefined,
): { variableId: string; itemPath?: string } | undefined {
  if (!value) return undefined
  const index = value.indexOf(SEPARATOR)
  if (index === -1) return { variableId: value }
  return { variableId: value.slice(0, index), itemPath: value.slice(index + SEPARATOR.length) }
}
