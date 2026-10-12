/**
 * Variable references in a shape tree.
 *
 * A tree points at variables by id in four places: a text run bound to a
 * variable, an image box's image, an if-group's condition, and a for-group's
 * list. Every walk over those references goes through here, so adding a fifth
 * kind is one change.
 */

import type { CustomText, Paragraph, Shape, VariableElement } from './types.js'
import { isContainerShape } from './types.js'

/** Every variable id `shapes` refers to, containers included. */
export function collectVariableIds(shapes: Shape[]): Set<string> {
  const ids = new Set<string>()
  const visit = (list: Shape[]) => {
    for (const shape of list) {
      if (shape.type === 'text') {
        for (const paragraph of shape.paragraphes ?? []) {
          for (const child of paragraph.children ?? []) {
            if ('type' in child && child.type === 'variable') ids.add(child.variableId)
          }
        }
      } else if (shape.type === 'image') {
        if (shape.imageVariable) ids.add(shape.imageVariable)
      } else if (isContainerShape(shape)) {
        if (shape.type === 'if-group' && shape.conditionVariable) ids.add(shape.conditionVariable)
        if (shape.type === 'for-group' && shape.itemsVariable) ids.add(shape.itemsVariable)
        visit(shape.children)
      }
    }
  }
  visit(shapes)
  return ids
}

/**
 * `shape` with each variable reference passed through `rebind`. A returned id
 * replaces the reference; null drops it: an image box, if-group or for-group is
 * left unbound, and a text run becomes plain text, `placeholder(run)`, in the
 * run's formatting.
 */
export function rebindVariables(
  shape: Shape,
  rebind: (variableId: string) => string | null,
  placeholder: (run: VariableElement) => string
): Shape {
  if (shape.type === 'text') {
    const rebindRun = (child: CustomText | VariableElement): CustomText | VariableElement => {
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
  const children = shape.children.map(child => rebindVariables(child, rebind, placeholder))

  if (shape.type === 'if-group' && shape.conditionVariable) {
    const conditionVariable = rebind(shape.conditionVariable)
    return conditionVariable !== null
      ? { ...shape, children, conditionVariable }
      : { ...shape, children, conditionVariable: undefined, itemPath: undefined }
  }
  if (shape.type === 'for-group' && shape.itemsVariable) {
    const itemsVariable = rebind(shape.itemsVariable)
    return itemsVariable !== null
      ? { ...shape, children, itemsVariable }
      : { ...shape, children, itemsVariable: undefined, itemPath: undefined }
  }
  return { ...shape, children }
}
