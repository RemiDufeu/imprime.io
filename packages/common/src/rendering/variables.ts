import type { Presentation, VariableItem, VariableValueType } from '../types.js'

// Values are keyed by variable *name* (that's the surface the export endpoint,
// the MCP tool and the UI all expose). The presentation is carried alongside so
// a missing runtime value can fall back to the variable's `default`.
export interface ResolveContext {
  variableValues: Record<string, VariableValueType>
  presentation?: Presentation
}

/**
 * One level of for-group iteration. Frames are pushed by `expandForGroup` and
 * live only for the duration of `resolveShapes` — they are not part of
 * `ResolveContext`, which is built once per export and is presentation-wide.
 */
export interface VariableScopeFrame {
  variableId: string
  // Dotted path, from the variable's root, to the list this frame iterates:
  // '' for the top-level list, 'moves' for a for-group nested on the `moves`
  // field. It is the prefix a reference must carry to address this frame.
  path: string
  value: VariableItem
}

export type VariableScope = VariableScopeFrame[]

/**
 * A value counts as absent when it is null/undefined, a blank string, or an
 * empty list — those all fall back to the variable's `default`. `false` is a
 * real value, not an absence.
 */
export function isEmptyVariableValue(value: VariableValueType | undefined | null): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
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
 * variables by `_id` (`conditionVariable`, `itemsVariable`, a text run's
 * `variableId`), hence the id → name indirection.
 *
 * With `itemPath` set, the reference addresses a field of a for-group's current
 * item instead, and is resolved against `scope` alone: a path is inert outside
 * the loop that binds it, so it fails closed rather than being reinterpreted
 * against the variable's whole value.
 *
 * Single definition on purpose: the condition of an if-group, the items of a
 * for-group and the text of a variable run must agree on what "this variable is
 * empty" means.
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
  const variable = ctx.presentation?.variableData?.find(v => v._id === variableId)
  if (!variable) return undefined

  const runtime = ctx.variableValues[variable.name]
  return isEmptyVariableValue(runtime) ? variable.default : runtime
}
