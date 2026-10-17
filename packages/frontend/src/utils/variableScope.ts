import type { GroupShape, Page, RepeatBinding, VariableData, VariableItemField, VariableType } from '@imprime/sdk'
import { ITEM_PATH_SEPARATOR, joinItemPath } from '@imprime/sdk'
import { findAncestorPath, findShapeById } from './shapeTree'

// One field of a repeat's current item, reachable from a given shape. The
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
 * The repeats whose item a shape reads, outermost first: the page's, when it
 * is repeated, then those of the groups the shape sits inside, and — with
 * `includeSelf` — its own when it is a repeated group. A shape's condition is
 * checked copy by copy, so it reads its own repeat's item; the repeat's own
 * list cannot, and leaves it out. `shapeId` null stands for the page itself,
 * whose own repeat is then the only one, under the same `includeSelf` rule.
 */
export function repeatsInScope(page: Page, shapeId: string | null, includeSelf: boolean): RepeatBinding[] {
  let groups: GroupShape[] = []
  if (shapeId !== null) {
    const ancestors = findAncestorPath(page.shapes, shapeId)
    if (!ancestors) return []
    const self = includeSelf ? findShapeById(page.shapes, shapeId)?.shape : undefined
    groups = self?.type === 'group' ? [...ancestors, self] : ancestors
  }
  const pageRepeat = shapeId !== null || includeSelf ? page.repeat : undefined
  return [pageRepeat, ...groups.map(group => group.repeat)]
    .filter((repeat): repeat is RepeatBinding => repeat?.variableId !== undefined)
}

/**
 * The item fields a shape — or, with `shapeId` null, the page itself — can
 * address, taken from the repeats it sits inside (see `repeatsInScope`).
 * Outermost first, so a picker lists the enclosing loops in the order they
 * are nested.
 *
 * `type` filters to what the caller can consume: 'string' for a text run,
 * 'boolean' for a condition, 'image' for an image box, 'object-list' for a
 * nested repeat.
 */
export function itemFieldsInScope(
  page: Page | null,
  shapeId: string | null,
  variables: VariableData[],
  type: VariableType,
  includeSelf = false,
): ItemFieldOption[] {
  if (!page) return []
  const options: ItemFieldOption[] = []
  for (const repeat of repeatsInScope(page, shapeId, includeSelf)) {
    const variable = variables.find(v => v._id === repeat.variableId)
    if (!variable) continue

    const basePath = repeat.itemPath ?? ''
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

// How a reference reads to the author: `logo`, or `items.photo` for a field of
// an iterated item — the label the pickers offer. Undefined when the variable
// no longer exists.
export function variableReferenceLabel(
  variables: VariableData[],
  variableId: string,
  itemPath: string | undefined,
): string | undefined {
  const variable = variables.find(v => v._id === variableId)
  if (!variable) return undefined
  return itemPath ? `${variable.name}.${itemPath}` : variable.name
}
