/**
 * Variable references in a shape tree.
 *
 * A tree points at variables by id in four places: a text run bound to a
 * variable, an image box's image, any shape's `visibleWhen` condition, and a
 * group's `repeat` list. Every walk over those references goes through here,
 * so adding a fifth kind is one change. A page itself points at variables
 * through its own `visibleWhen` and `repeat`.
 */

import type { Page, Paragraph, RepeatBinding, Shape, TextRun, VariableElement, VisibilityCondition } from './types.js'
import { isContainerShape } from './types.js'

/** Every variable id `shapes` refers to, containers included. */
export function collectVariableIds(shapes: Shape[]): Set<string> {
  const ids = new Set<string>()
  const visit = (list: Shape[]) => {
    for (const shape of list) {
      if (shape.visibleWhen?.variableId) ids.add(shape.visibleWhen.variableId)
      if (shape.type === 'text') {
        for (const paragraph of shape.paragraphes ?? []) {
          for (const child of paragraph.children ?? []) {
            if ('type' in child && child.type === 'variable') ids.add(child.variableId)
          }
        }
      } else if (shape.type === 'image') {
        if (shape.imageVariable) ids.add(shape.imageVariable)
      } else if (isContainerShape(shape)) {
        if (shape.repeat?.variableId) ids.add(shape.repeat.variableId)
        visit(shape.children)
      }
    }
  }
  visit(shapes)
  return ids
}

/** Every variable id a page refers to: its condition, its repeat and its shapes. */
export function collectPageVariableIds(page: Pick<Page, 'shapes' | 'visibleWhen' | 'repeat'>): Set<string> {
  const ids = collectVariableIds(page.shapes ?? [])
  if (page.visibleWhen?.variableId) ids.add(page.visibleWhen.variableId)
  if (page.repeat?.variableId) ids.add(page.repeat.variableId)
  return ids
}

// A condition or a repeat whose variable is dropped keeps the binding with no
// variable: the shape stays conditional — never shown — and the group stays a
// repeat of nothing, rather than silently becoming unconditional.
function rebindBinding<T extends VisibilityCondition | RepeatBinding>(
  binding: T | undefined,
  rebind: (variableId: string) => string | null,
): T | undefined {
  if (!binding?.variableId) return binding
  const variableId = rebind(binding.variableId)
  if (variableId === binding.variableId) return binding
  return variableId !== null
    ? { ...binding, variableId }
    : { ...binding, variableId: undefined, itemPath: undefined }
}

/**
 * `shape` with each variable reference passed through `rebind`. A returned id
 * replaces the reference; null drops it: an image box is left unbound, a
 * condition or a repeat is left without a variable (see `rebindBinding`), and
 * a text run becomes plain text, `placeholder(run)`, in the run's formatting.
 */
export function rebindVariables(
  shape: Shape,
  rebind: (variableId: string) => string | null,
  placeholder: (run: VariableElement) => string
): Shape {
  const own = rebindOwnReferences(shape, rebind, placeholder)
  const visibleWhen = rebindBinding(own.visibleWhen, rebind)
  return visibleWhen === own.visibleWhen ? own : { ...own, visibleWhen }
}

// The references particular to the shape's type.
function rebindOwnReferences(
  shape: Shape,
  rebind: (variableId: string) => string | null,
  placeholder: (run: VariableElement) => string
): Shape {
  if (shape.type === 'text') {
    const rebindRun = (child: TextRun): TextRun => {
      if (!('type' in child) || child.type !== 'variable') return child
      const variableId = rebind(child.variableId)
      if (variableId !== null) return variableId === child.variableId ? child : { ...child, variableId }
      const { type: _type, variableId: _id, itemPath: _path, children: _children, ...formatting } = child
      return { ...formatting, text: placeholder(child) }
    }
    const paragraphes = shape.paragraphes.map((paragraph): Paragraph => ({
      ...paragraph,
      children: paragraph.children.map(rebindRun),
    }))
    return { ...shape, paragraphes }
  }

  if (shape.type === 'image') {
    if (!shape.imageVariable) return shape
    const imageVariable = rebind(shape.imageVariable)
    if (imageVariable === shape.imageVariable) return shape
    return imageVariable !== null
      ? { ...shape, imageVariable }
      : { ...shape, imageVariable: undefined, itemPath: undefined }
  }

  if (!isContainerShape(shape)) return shape
  return {
    ...shape,
    children: shape.children.map(child => rebindVariables(child, rebind, placeholder)),
    repeat: rebindBinding(shape.repeat, rebind),
  }
}
