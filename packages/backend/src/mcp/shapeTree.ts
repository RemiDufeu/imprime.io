import type { Shape } from '@imprime/common'
import { isContainerShape } from '@imprime/common'
import { NotFoundError, ValidationError } from '../services/errors.js'

/**
 * A page's tree, edited by shape id on behalf of an agent. Pure: each helper
 * rebuilds the branches it touches, and throws when the id it is given does
 * not lead anywhere, which the tool reports as is.
 */

export function findShape(shapes: Shape[], id: string): Shape | undefined {
  for (const shape of shapes) {
    if (shape.id === id) return shape
    if (isContainerShape(shape)) {
      const found = findShape(shape.children, id)
      if (found) return found
    }
  }
  return undefined
}

export function getShape(shapes: Shape[], id: string): Shape {
  const shape = findShape(shapes, id)
  if (!shape) throw new NotFoundError(`No shape "${id}" on this page`, 'SHAPE_NOT_FOUND')
  return shape
}

// `added` among the children of group `parentId` — the page's shapes when
// null — before the one at `index`, or after the last when absent.
export function insertShapes(shapes: Shape[], parentId: string | null, added: Shape[], index?: number): Shape[] {
  const insert = (list: Shape[]) => {
    const at = index === undefined ? list.length : Math.min(index, list.length)
    return [...list.slice(0, at), ...added, ...list.slice(at)]
  }
  if (parentId === null) return insert(shapes)

  const parent = getShape(shapes, parentId)
  if (!isContainerShape(parent)) {
    throw new ValidationError(`Shape "${parentId}" is a ${parent.type}, not a group`, 'NOT_A_GROUP')
  }
  return replaceShape(shapes, parentId, { ...parent, children: insert(parent.children) })
}

export function replaceShape(shapes: Shape[], id: string, next: Shape): Shape[] {
  return shapes.map(shape => {
    if (shape.id === id) return next
    return isContainerShape(shape) ? { ...shape, children: replaceShape(shape.children, id, next) } : shape
  })
}

// A group goes with its children.
export function removeShapes(shapes: Shape[], ids: readonly string[]): Shape[] {
  for (const id of ids) getShape(shapes, id)

  const removed = new Set(ids)
  const remove = (list: Shape[]): Shape[] => list
    .filter(shape => !removed.has(shape.id))
    .map(shape => (isContainerShape(shape) ? { ...shape, children: remove(shape.children) } : shape))
  return remove(shapes)
}

const round = (value: number) => Math.round(value * 10) / 10

const TEXT_PREVIEW_LENGTH = 60

function textPreview(shape: Extract<Shape, { type: 'text' }>): string {
  const text = shape.paragraphes
    .map(paragraph => paragraph.children
      .map(child => ('type' in child ? `{${child.itemPath ?? 'variable'}}` : child.text))
      .join(''))
    .join(' / ')
  return text.length > TEXT_PREVIEW_LENGTH ? `${text.slice(0, TEXT_PREVIEW_LENGTH)}…` : text
}

function describeShape(shape: Shape): string {
  const name = shape.name ? ` "${shape.name}"` : ''
  const box = `(${round(shape.x)}, ${round(shape.y)}) ${round(shape.width)}×${round(shape.height)}`
  const notes: string[] = []
  if (shape.type === 'text') notes.push(JSON.stringify(textPreview(shape)))
  if (isContainerShape(shape)) {
    if (shape.layout && shape.layout !== 'none') notes.push(`layout ${shape.layout}`)
    if (shape.repeat) notes.push('repeated')
  }
  if (shape.visibleWhen) notes.push('conditional')
  if (shape.hidden) notes.push('hidden')
  return `${shape.id} ${shape.type}${name} ${box}${notes.length ? ` — ${notes.join(', ')}` : ''}`
}

/**
 * One line per shape, indented by depth: its id, type, name and box (parent
 * relative, after layout). What a tool answers with after a write, so the
 * agent learns the ids it did not choose without reading the tree back.
 */
export function outlineShapes(shapes: Shape[], depth = 0): string {
  return shapes
    .map(shape => {
      const line = `${'  '.repeat(depth)}- ${describeShape(shape)}`
      return isContainerShape(shape) && shape.children.length > 0
        ? `${line}\n${outlineShapes(shape.children, depth + 1)}`
        : line
    })
    .join('\n')
}
