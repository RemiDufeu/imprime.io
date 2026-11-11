import type { Frame, Shape } from '@imprime/common'
import { getContentFrame, isContainerShape, PAGE_FRAME, shapeFromPage, shapeToPage } from '@imprime/common'
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

// The frame a shape's own x and y lie in — its parent's content frame, turned
// by every enclosing group — or null when it is not in the tree.
function findParentFrame(shapes: Shape[], id: string, frame: Frame = PAGE_FRAME): Frame | null {
  for (const shape of shapes) {
    if (shape.id === id) return frame
    if (isContainerShape(shape)) {
      const found = findParentFrame(shape.children, id, getContentFrame(frame, shape))
      if (found) return found
    }
  }
  return null
}

// The frame the children of group `parentId` lie in; the page's for null.
function childrenFrame(shapes: Shape[], parentId: string | null): Frame {
  if (parentId === null) return PAGE_FRAME
  const parent = getShape(shapes, parentId)
  if (!isContainerShape(parent)) {
    throw new ValidationError(`Shape "${parentId}" is a ${parent.type}, not a group`, 'NOT_A_GROUP')
  }
  return getContentFrame(findParentFrame(shapes, parentId) ?? PAGE_FRAME, parent)
}

/**
 * Shapes `ids`, as they lie on the page — at the place and the turn they have
 * there, whatever their parents — for a copy or a move to put back there.
 */
export function pickOnPage(shapes: Shape[], ids: readonly string[]): Shape[] {
  return ids.map(id => shapeToPage(getShape(shapes, id), findParentFrame(shapes, id) ?? PAGE_FRAME))
}

/**
 * `added`, each as it lies on the page (`pickOnPage`), put among the children
 * of group `parentId` — the page's for null — before the one at `index`, or
 * in front when absent, staying where they are on the page. In a group with
 * a layout, the layout places them anyway.
 */
export function placeOnPage(shapes: Shape[], added: Shape[], parentId: string | null, index?: number): Shape[] {
  const frame = childrenFrame(shapes, parentId)
  return insertShapes(shapes, parentId, added.map(shape => shapeFromPage(shape, frame)), index)
}

/**
 * Shapes `ids` taken out of wherever they are and put, in that order, among
 * the children of group `parentId` (the page for null) at `index`, staying
 * where they are on the page. A group cannot go into itself or one of its
 * own, nor a shape go along with a group that already holds it.
 */
export function moveShapes(shapes: Shape[], ids: readonly string[], parentId: string | null, index?: number): Shape[] {
  const moved = pickOnPage(shapes, ids)
  for (const shape of moved) {
    if (!isContainerShape(shape)) continue
    if (parentId !== null && (shape.id === parentId || findShape(shape.children, parentId))) {
      throw new ValidationError(`Group "${shape.id}" cannot go into itself or a group of its own`, 'INVALID_MOVE')
    }
    const inner = ids.find(id => id !== shape.id && findShape(shape.children, id))
    if (inner) {
      throw new ValidationError(`Shape "${inner}" is inside group "${shape.id}", which moves already`, 'INVALID_MOVE')
    }
  }
  return placeOnPage(removeShapes(shapes, ids), moved, parentId, index)
}

const round = (value: number) => Math.round(value * 10) / 10

const TEXT_PREVIEW_LENGTH = 60

function textPreview(shape: Extract<Shape, { type: 'text' }>): string {
  const text = shape.paragraphes
    .map(paragraph => paragraph.children
      .map(child => {
        if (!('type' in child)) return child.text
        if (child.type === 'page-number') return child.kind === 'total' ? '{pages}' : '{page}'
        return `{${child.itemPath ?? 'variable'}}`
      })
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
