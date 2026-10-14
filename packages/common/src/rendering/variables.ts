import type {
  Template,
  VariableData,
  VariableItem,
  VariableItemField,
  VariableValueType,
  VisibilityCondition,
} from '../types.js'

// Values are keyed by variable *name* (that's the surface the export endpoint,
// the MCP tool and the UI all expose). The template is carried alongside so
// a missing runtime value can fall back to the variable's `default`.
export interface ResolveContext {
  variableValues: Record<string, VariableValueType>
  template?: Template
}

/**
 * One level of repeat iteration. Frames are pushed as `resolveShapes` expands a
 * repeated group, and live only for the duration of that call — they are not
 * part of `ResolveContext`, which is built once per export and is template-wide.
 */
export interface VariableScopeFrame {
  variableId: string
  // Dotted path, from the variable's root, to the list this frame iterates:
  // '' for the top-level list, 'moves' for a repeat nested on the `moves`
  // field. It is the prefix a reference must carry to address this frame.
  path: string
  value: VariableItem
}

export type VariableScope = VariableScopeFrame[]

/**
 * A value counts as absent when it is null/undefined, a blank string, or an
 * empty list — those all fall back to the variable's `default`. `false` is a
 * real value, not an absence. Takes anything, as an item's field can hold
 * whatever an integration sent.
 */
export function isEmptyVariableValue(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

// What carries a character limit: a variable, or a list's item field.
type Limited = Pick<VariableData | VariableItemField, 'type' | 'maxLength'>

/**
 * The character limit of a variable or an item field, or undefined when it
 * has none: unset, not a positive integer (written through the API), or not a
 * 'string' one.
 */
export function getVariableMaxLength(limited: Limited): number | undefined {
  const { type, maxLength } = limited
  if (type !== 'string') return undefined
  return typeof maxLength === 'number' && Number.isInteger(maxLength) && maxLength > 0 ? maxLength : undefined
}

/**
 * Length of a string as `maxLength` counts it: in characters (code points), so
 * an emoji is one, not the two UTF-16 units `String.length` gives.
 */
export function countCharacters(value: string): number {
  return Array.from(value).length
}

/**
 * The value has more characters than the variable or item field allows. An
 * empty value is not checked: a variable's default stands in for it, and an
 * empty item field is `required`'s business.
 */
export function exceedsMaxLength(limited: Limited, value: unknown): boolean {
  const max = getVariableMaxLength(limited)
  return max !== undefined && typeof value === 'string' && !isEmptyVariableValue(value) && countCharacters(value) > max
}

// A value of a list's items that breaks its field's declaration.
export interface ItemFieldIssue {
  // Where the value is, as the caller wrote it: `albums[0].tracks[2].title`.
  path: string
  field: VariableItemField
  problem: 'missing' | 'too-long'
}

/**
 * The first value of a list's items, nested lists included, that breaks its
 * field's declaration: a required field left empty, or a string with more
 * characters than its field's max length. `label` is the list's own path.
 * Anything that is not a list has no items, and an item that is not an object
 * no fields. A field is read from the item's own properties only: one named
 * like an `Object.prototype` member must not read the prototype's.
 */
export function findItemFieldIssue(
  items: unknown,
  fields: VariableItemField[] | undefined,
  label: string,
): ItemFieldIssue | undefined {
  if (!Array.isArray(items)) return undefined
  const list: unknown[] = items
  for (const [index, item] of list.entries()) {
    if (item === null || typeof item !== 'object') continue
    for (const field of fields ?? []) {
      const value: unknown = Object.hasOwn(item, field.name) ? Reflect.get(item, field.name) : undefined
      const path = `${label}[${index}].${field.name}`
      if (field.required === true && isEmptyVariableValue(value)) return { path, field, problem: 'missing' }
      if (exceedsMaxLength(field, value)) return { path, field, problem: 'too-long' }
      if (field.type === 'object-list') {
        const nested = findItemFieldIssue(value, field.itemFields, path)
        if (nested) return nested
      }
    }
  }
  return undefined
}

/** Flatten a value for display inside a text run. */
export function stringifyVariableValue(value: VariableValueType | undefined | null): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  // A list reaching a text run has no one-line rendering — its items are
  // objects. Render nothing rather than leak '[object Object]'.
  if (Array.isArray(value)) return ''
  return ''
}

// Item paths are dotted and rooted at the variable, with '' as the root itself.
// Defined here, next to the code that decomposes a path, because the editor
// composes paths for its pickers and the two must not drift: a separator change
// on one side alone would make every reference fail closed, silently.
export const ITEM_PATH_SEPARATOR = '.'

export function joinItemPath(prefix: string, field: string): string {
  return prefix === '' ? field : `${prefix}${ITEM_PATH_SEPARATOR}${field}`
}

// `prefix` addresses the same list as `path`, or an ancestor of it. The empty
// prefix is the variable's root and matches everything.
function isPathPrefix(prefix: string, path: string): boolean {
  return prefix === '' || path === prefix || path.startsWith(`${prefix}${ITEM_PATH_SEPARATOR}`)
}

// An item's property is a scalar or a nested list, never a bare object, so a
// path never walks deeper than the list its frame binds: what remains after the
// frame's own path is exactly one field name. A longer remainder addresses a
// list no frame binds, and fails closed.
function readItemField(item: VariableItem, field: string): VariableValueType | undefined {
  if (field === '' || field.includes(ITEM_PATH_SEPARATOR)) return undefined
  return item[field]
}

// The frame a reference addresses: same variable, and the longest path that is
// a prefix of the reference's own. Scanning from the innermost frame outwards
// means the innermost wins when two frames tie.
function frameFor(
  variableId: string,
  itemPath: string,
  scope: VariableScope,
): VariableScopeFrame | undefined {
  let best: VariableScopeFrame | undefined
  for (let i = scope.length - 1; i >= 0; i--) {
    const frame = scope[i]
    if (frame.variableId !== variableId) continue
    if (!isPathPrefix(frame.path, itemPath)) continue
    if (best === undefined || frame.path.length > best.path.length) best = frame
  }
  return best
}

/**
 * What a variable evaluates to for this render: the supplied runtime value, or
 * the variable's `default` when that value is absent. Shapes reference
 * variables by `_id` (a condition's or a repeat's `variableId`, a text run's
 * `variableId`), hence the id → name indirection.
 *
 * With `itemPath` set, the reference addresses a field of a repeat's current
 * item instead, and is resolved against `scope` alone: a path is inert outside
 * the loop that binds it, so it fails closed rather than being reinterpreted
 * against the variable's whole value.
 *
 * Single definition on purpose: a shape's condition, a group's repeat and the
 * text of a variable run must agree on what "this variable is empty" means.
 */
export function resolveVariable(
  variableId: string | undefined,
  ctx: ResolveContext | undefined,
  itemPath?: string,
  scope: VariableScope = [],
): VariableValueType | undefined {
  if (!variableId) return undefined

  if (itemPath !== undefined) {
    const frame = frameFor(variableId, itemPath, scope)
    if (!frame) return undefined
    const rest =
      frame.path === ''
        ? itemPath
        : itemPath.slice(frame.path.length + ITEM_PATH_SEPARATOR.length)
    return readItemField(frame.value, rest)
  }

  if (!ctx) return undefined
  const variable = ctx.template?.variableData?.find(v => v._id === variableId)
  if (!variable) return undefined

  const runtime = ctx.variableValues[variable.name]
  return isEmptyVariableValue(runtime) ? variable.default : runtime
}

/**
 * Whether a shape's `visibleWhen` lets it show: the value must be exactly
 * `true`, or exactly `false` with `negate`. Nothing is coerced, so a missing
 * value hides the shape both ways — a boolean variable that may be absent
 * needs a `default`.
 */
export function isConditionMet(
  condition: VisibilityCondition | undefined,
  ctx: ResolveContext | undefined,
  scope: VariableScope = [],
): boolean {
  if (!condition) return true
  const value = resolveVariable(condition.variableId, ctx, condition.itemPath, scope)
  return condition.negate ? value === false : value === true
}
