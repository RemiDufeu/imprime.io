import type { Page, RepeatBinding, Shape, Template, VariableScope, VisibilityCondition } from '@imprime/sdk'
import { isConditionMet, resolveVariable } from '@imprime/sdk'
import { findShapeById } from './shapeTree'
import { repeatsInScope } from './variableScope'

// How a shape's condition comes out with the variables' defaults — what an
// export given no values would do. 'unknown' when it reads a field of an item
// there is none of: the list it sits in has no default.
export type ConditionPreview = 'shown' | 'hidden' | 'unknown'

// Item fields are read from the first item of each repeat in `repeats` — the
// copy the editor shows — through the same `isConditionMet` the export uses.
function previewWithin(condition: VisibilityCondition, repeats: RepeatBinding[], template: Template): ConditionPreview {
  const ctx = { variableValues: {}, template }
  const scope: VariableScope = []
  for (const repeat of repeats) {
    const variableId = repeat.variableId
    if (!variableId) continue
    const items = resolveVariable(variableId, ctx, repeat.itemPath, scope)
    if (!Array.isArray(items) || items.length === 0) {
      if (condition.itemPath !== undefined) return 'unknown'
      break
    }
    scope.push({ variableId, path: repeat.itemPath ?? '', value: items[0] })
  }
  return isConditionMet(condition, ctx, scope) ? 'shown' : 'hidden'
}

/**
 * The editor draws the authored tree and never resolves values to draw it; this
 * only tells the author that a shape would be left out.
 */
export function previewCondition(template: Template | null, shape: Shape): ConditionPreview | null {
  const condition = shape.visibleWhen
  if (!condition) return null
  if (!template) return 'unknown'

  const page = template.pages.find(p => findShapeById(p.shapes, shape.id) !== null)
  if (!page) return 'unknown'

  return previewWithin(condition, repeatsInScope(page, shape.id, true), template)
}

// How a page comes out with the variables' defaults, binding by binding. The
// editor shows the page whatever they say.
export interface PagePreview {
  // 'empty' when the list it is repeated for has no item — unset, unknown,
  // not a list or empty — so the export has no copy of it. null when it is
  // not repeated.
  repeat: 'filled' | 'empty' | null
  // Its own condition, read on the copy the editor shows: the first item.
  condition: ConditionPreview | null
}

export function previewPage(template: Template, page: Page): PagePreview {
  let repeat: PagePreview['repeat'] = null
  if (page.repeat) {
    const items = resolveVariable(page.repeat.variableId, { variableValues: {}, template })
    repeat = Array.isArray(items) && items.length > 0 ? 'filled' : 'empty'
  }
  const condition = page.visibleWhen
    ? previewWithin(page.visibleWhen, repeatsInScope(page, null, true), template)
    : null
  return { repeat, condition }
}

// The export would leave the page out with the defaults.
export const isPageLeftOut = (preview: PagePreview): boolean =>
  preview.repeat === 'empty' || preview.condition === 'hidden'
