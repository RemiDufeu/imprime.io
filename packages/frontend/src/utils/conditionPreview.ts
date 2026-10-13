import type { Shape, Template, VariableScope } from '@imprime/sdk'
import { isConditionMet, resolveVariable } from '@imprime/sdk'
import { findShapeById } from './shapeTree'
import { repeatsInScope } from './variableScope'

// How a shape's condition comes out with the variables' defaults — what an
// export given no values would do. 'unknown' when it reads a field of an item
// there is none of: the list it sits in has no default.
export type ConditionPreview = 'shown' | 'hidden' | 'unknown'

/**
 * The editor draws the authored tree and never resolves values to draw it; this
 * only tells the author that a shape would be left out. Item fields are read
 * from the first item of each repeat around the shape — the copy the editor
 * shows — through the same `isConditionMet` the export uses.
 */
export function previewCondition(template: Template | null, shape: Shape): ConditionPreview | null {
  const condition = shape.visibleWhen
  if (!condition) return null
  if (!template) return 'unknown'

  const page = template.pages.find(p => findShapeById(p.shapes, shape.id) !== null)
  if (!page) return 'unknown'

  const ctx = { variableValues: {}, template }
  const scope: VariableScope = []
  for (const group of repeatsInScope(page.shapes, shape.id, true)) {
    const variableId = group.repeat?.variableId
    if (!variableId) continue
    const items = resolveVariable(variableId, ctx, group.repeat?.itemPath, scope)
    if (!Array.isArray(items) || items.length === 0) {
      if (condition.itemPath !== undefined) return 'unknown'
      break
    }
    scope.push({ variableId, path: group.repeat?.itemPath ?? '', value: items[0] })
  }
  return isConditionMet(condition, ctx, scope) ? 'shown' : 'hidden'
}
