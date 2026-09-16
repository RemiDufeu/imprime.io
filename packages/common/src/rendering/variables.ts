import type { Presentation, VariableValueType } from '../types.js'

// Values are keyed by variable *name* (that's the surface the export endpoint,
// the MCP tool and the UI all expose). The presentation is carried alongside so
// a missing runtime value can fall back to the variable's `default`.
export interface ResolveContext {
  variableValues: Record<string, VariableValueType>
  presentation?: Presentation
}

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
  if (Array.isArray(value)) return value.join(', ')
  return ''
}

/**
 * What a variable evaluates to for this render: the supplied runtime value, or
 * the variable's `default` when that value is absent. Shapes reference
 * variables by `_id` (`conditionVariable`, `itemsVariable`, a text run's
 * `variableId`), hence the id → name indirection.
 *
 * Single definition on purpose: the condition of an if-group, the items of a
 * for-group and the text of a variable run must agree on what "this variable is
 * empty" means.
 */
export function resolveVariable(
  variableId: string | undefined,
  ctx: ResolveContext | undefined,
): VariableValueType | undefined {
  if (!variableId || !ctx) return undefined
  const variable = ctx.presentation?.variableData?.find(v => v._id === variableId)
  if (!variable) return undefined

  const runtime = ctx.variableValues[variable.name]
  return isEmptyVariableValue(runtime) ? variable.default : runtime
}
