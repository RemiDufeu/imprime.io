/**
 * Variable references in a shape tree.
 *
 * A tree points at variables by id in four places: a text run bound to a
 * variable, an image box's image, any shape's `visibleWhen` condition, and a
 * group's `repeat` list. Every walk over those references goes through here,
 * so adding a fifth kind is one change. A page itself points at variables
 * through its own `visibleWhen` and `repeat`.
 */

import type { Page, Paragraph, RepeatBinding, Shape, TextRun, VariableData, VariableElement, VisibilityCondition } from './types.js'
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
  if (variableId !== null) return { ...binding, variableId }
  const unbound = { ...binding }
  delete unbound.variableId
  delete unbound.itemPath
  return unbound
}

/**
 * `shape` with each variable reference passed through `rebind`. A returned id
 * replaces the reference; null drops it: an image box is left unbound, a
 * condition or a repeat is left without a variable (see `rebindBinding`), and
 * a text run becomes plain text, `placeholder(run)`, in the run's formatting.
 *
 * A field the shape lacks, or loses, is left out, never set to undefined: the
 * server stores the tree as it is (template import, duplicate, copy_shapes),
 * and MongoDB writes an undefined field as null — a group with `repeat: null`
 * shows in the editor as a repeat.
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
    if (imageVariable !== null) return { ...shape, imageVariable }
    const { imageVariable: _variable, itemPath: _path, ...unbound } = shape
    return unbound
  }

  if (!isContainerShape(shape)) return shape
  const repeat = rebindBinding(shape.repeat, rebind)
  return {
    ...shape,
    children: shape.children.map(child => rebindVariables(child, rebind, placeholder)),
    ...(repeat ? { repeat } : {}),
  }
}

/**
 * A shape copied from one template into another — or into the same one — with
 * its variable references as the target knows them: kept by id, else matched
 * by name and type (another template's, or one deleted and recreated since),
 * else dropped, a text run then becoming its name as plain text (see
 * `rebindVariables`). `dropped` names the variables it lost. The editor's
 * paste and the MCP's copy_shapes bind alike.
 */
export function bindVariables(
  shape: Shape,
  from: VariableData[],
  to: VariableData[]
): { shape: Shape; dropped: VariableData[] } {
  const present = new Set(to.map(variable => variable._id))
  const original = new Map(from.map(variable => [variable._id, variable]))
  const dropped = new Map<string, VariableData>()
  const bound = rebindVariables(
    shape,
    variableId => {
      if (present.has(variableId)) return variableId
      const source = original.get(variableId)
      const match = source && to.find(variable => variable.name === source.name && variable.type === source.type)
      if (match) return match._id
      if (source) dropped.set(source._id, source)
      return null
    },
    run => {
      const name = original.get(run.variableId)?.name ?? 'variable'
      return `{${run.itemPath ? `${name}.${run.itemPath}` : name}}`
    },
  )
  return { shape: bound, dropped: [...dropped.values()] }
}
