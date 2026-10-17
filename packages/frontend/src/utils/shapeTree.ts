import type { ContainerShape, Frame, Shape } from '@imprime/sdk'
import { getContentFrame, isContainerShape, PAGE_FRAME, pointFromPage, shapeFromPage, shapeToPage } from '@imprime/sdk'

// Re-exported so tree helpers and their callers import the guard from one place.
export { isContainerShape }

export interface ShapeLocation {
  shape: Shape
  parentGroupId: string | null
  // Where the shape's own x/y lie on the page: its parent's content frame,
  // turned by every enclosing group's rotation. `shapeToPage(shape,
  // parentFrame)` is the shape as it lies on the page.
  parentFrame: Frame
}

// Locate a shape anywhere in the tree along with its parent group and the
// frame its coordinates are in (needed for hit-testing during drag).
export function findShapeById(
  shapes: Shape[],
  id: string,
  parentGroupId: string | null = null,
  frame: Frame = PAGE_FRAME,
): ShapeLocation | null {
  for (const s of shapes) {
    if (s.id === id) {
      return { shape: s, parentGroupId, parentFrame: frame }
    }
    if (isContainerShape(s)) {
      const found = findShapeById(s.children, id, s.id, getContentFrame(frame, s))
      if (found) return found
    }
  }
  return null
}

// The frame the children of `groupId` are drawn in — the page's for null, the
// root. Null when there is no such group.
export function findContentFrame(shapes: Shape[], groupId: string | null): Frame | null {
  if (groupId === null) return PAGE_FRAME
  const loc = findShapeById(shapes, groupId)
  return loc ? getContentFrame(loc.parentFrame, loc.shape) : null
}

// `shape`, its coordinates in frame `from`, re-expressed in frame `to` so
// that it stays where it is on the page, turned as it is: what moving it to
// another parent takes.
export function relocateShape<T extends Shape>(shape: T, from: Frame, to: Frame): T {
  return shapeFromPage(shapeToPage(shape, from), to)
}

// The containers enclosing a shape, outermost first. Recursive like every other
// helper here rather than backed by an id index — a flat id → location map was
// tried for this tree and rolled back.
export function findAncestorPath(
  shapes: Shape[],
  id: string,
  trail: ContainerShape[] = [],
): ContainerShape[] | null {
  for (const s of shapes) {
    if (s.id === id) return trail
    if (isContainerShape(s)) {
      const found = findAncestorPath(s.children, id, [...trail, s])
      if (found) return found
    }
  }
  return null
}

export function updateShapeById(shapes: Shape[], id: string, updates: Partial<Shape>): Shape[] {
  return shapes.map(s => {
    if (s.id === id) return { ...s, ...updates } as Shape
    if (isContainerShape(s)) {
      return { ...s, children: updateShapeById(s.children, id, updates) }
    }
    return s
  })
}

export function deleteShapeById(shapes: Shape[], id: string): Shape[] {
  const out: Shape[] = []
  for (const s of shapes) {
    if (s.id === id) continue
    if (isContainerShape(s)) {
      out.push({ ...s, children: deleteShapeById(s.children, id) })
    } else {
      out.push(s)
    }
  }
  return out
}

// Pull a shape out of the tree, returning the removed shape and the remaining
// tree. Used when re-parenting a shape into a different group.
export function extractShapeById(
  shapes: Shape[],
  id: string,
): { removed: Shape | null; remaining: Shape[] } {
  let removed: Shape | null = null
  const remaining: Shape[] = []
  for (const s of shapes) {
    if (s.id === id) { removed = s; continue }
    if (isContainerShape(s)) {
      const sub = extractShapeById(s.children, id)
      if (sub.removed) {
        removed = sub.removed
        remaining.push({ ...s, children: sub.remaining })
        continue
      }
    }
    remaining.push(s)
  }
  return { removed, remaining }
}

// Insert `shape` at the end of the children of the container with matching id,
// or at the root when groupId is null.
export function insertShape(shapes: Shape[], groupId: string | null, shape: Shape): Shape[] {
  if (groupId === null) return [...shapes, shape]
  return shapes.map(s => {
    if (!isContainerShape(s)) return s
    if (s.id === groupId) return { ...s, children: [...s.children, shape] }
    return { ...s, children: insertShape(s.children, groupId, shape) }
  })
}

// Insert `shape` at a specific index inside the children of `groupId` (or root
// when null). Index is clamped to [0, children.length]. Used by the tree panel
// when the user drops between two rows.
export function insertShapeAt(shapes: Shape[], groupId: string | null, index: number, shape: Shape): Shape[] {
  if (groupId === null) {
    const i = Math.max(0, Math.min(index, shapes.length))
    return [...shapes.slice(0, i), shape, ...shapes.slice(i)]
  }
  return shapes.map(s => {
    if (!isContainerShape(s)) return s
    if (s.id === groupId) {
      const i = Math.max(0, Math.min(index, s.children.length))
      return { ...s, children: [...s.children.slice(0, i), shape, ...s.children.slice(i)] }
    }
    return { ...s, children: insertShapeAt(s.children, groupId, index, shape) }
  })
}

// The sibling list a shape lives in: root `shapes`, or the children array of
// its parent container. Used to scope z-order reordering to the shape's own
// container instead of always operating on the page root.
export function getSiblingList(shapes: Shape[], groupId: string | null): Shape[] {
  if (groupId === null) return shapes
  const loc = findShapeById(shapes, groupId)
  return loc && isContainerShape(loc.shape) ? loc.shape.children : []
}

// Replace the sibling list at `groupId` (root, or a container's children) with
// `newList`. Symmetric to getSiblingList.
export function replaceSiblingList(shapes: Shape[], groupId: string | null, newList: Shape[]): Shape[] {
  if (groupId === null) return newList
  return shapes.map(s => {
    if (!isContainerShape(s)) return s
    if (s.id === groupId) return { ...s, children: newList }
    return { ...s, children: replaceSiblingList(s.children, groupId, newList) }
  })
}

// Deep-clone a shape and rewrite every id in the subtree to a fresh UUID.
// Needed by "duplicate" so the copy is independent of the source.
export function cloneShapeWithNewIds(shape: Shape): Shape {
  const nextId = crypto.randomUUID()
  if (isContainerShape(shape)) {
    return { ...shape, id: nextId, children: shape.children.map(cloneShapeWithNewIds) }
  }
  return { ...shape, id: nextId }
}

// `shapes` with `shape` — its x, y and rotation those it has on the page —
// placed right after `anchorId` in the anchor's container, the page root when
// there is no anchor or it is not in the tree, and re-expressed there.
// Duplicate and paste both put the copy next to its source.
export function insertNear(shapes: Shape[], shape: Shape, anchorId: string | null): Shape[] {
  const anchor = anchorId !== null ? findShapeById(shapes, anchorId) : null
  const parentId = anchor?.parentGroupId ?? null
  const siblings = getSiblingList(shapes, parentId)
  const anchorIndex = siblings.findIndex(s => s.id === anchorId)
  const index = anchorIndex === -1 ? siblings.length : anchorIndex + 1
  const placed = shapeFromPage(shape, anchor?.parentFrame ?? PAGE_FRAME)
  return insertShapeAt(shapes, parentId, index, placed)
}

// True when `ancestorId` is an ancestor of `shapeId` in the tree (or the shape
// itself). Used to reject illegal drops (a group cannot be moved into itself).
export function isDescendantOf(shapes: Shape[], shapeId: string, ancestorId: string): boolean {
  if (shapeId === ancestorId) return true
  for (const s of shapes) {
    if (s.id === ancestorId && isContainerShape(s)) {
      return findShapeById(s.children, shapeId) !== null
    }
    if (isContainerShape(s)) {
      if (isDescendantOf(s.children, shapeId, ancestorId)) return true
    }
  }
  return false
}

// What a shape is to the author: its type, except that a repeated group reads
// as a repeat — in the layers panel's icon, and its name when it has none.
export type ShapeKind = Shape['type'] | 'repeat'

export function shapeKind(shape: Shape): ShapeKind {
  return shape.type === 'group' && shape.repeat ? 'repeat' : shape.type
}

const KIND_LABEL: Record<ShapeKind, string> = {
  rectangle: 'Rectangle',
  ellipse: 'Ellipse',
  text: 'Text',
  image: 'Image',
  group: 'Group',
  repeat: 'Repeat',
}

// What the layers panel shows for a shape. Shapes created before `name`
// existed have none, so fall back to their kind rather than an empty row.
export function shapeDisplayName(shape: Shape): string {
  return shape.name ?? KIND_LABEL[shapeKind(shape)]
}

// Auto-generate a fresh name for a newly-created shape
export function nextShapeName(shapes: Shape[], kind: ShapeKind): string {
  let count = 0
  const walk = (list: Shape[]) => {
    for (const s of list) {
      if (shapeKind(s) === kind) count += 1
      if (isContainerShape(s)) walk(s.children)
    }
  }
  walk(shapes)
  return `${KIND_LABEL[kind]} ${count + 1}`
}

// A container found on the page: its children are drawn in `frame`, which is
// also where its box (0, 0, width, height) lies.
export interface GroupHit {
  id: string
  frame: Frame
  width: number
  height: number
}

// Find the innermost container whose box, turned as it is drawn, contains the
// page point (px, py). Skips the shape identified by `excludeId` (used to
// avoid dropping a group into itself, or a shape into its current parent
// while dragging).
export function findInnermostGroupAt(
  shapes: Shape[],
  px: number,
  py: number,
  excludeId?: string,
  frame: Frame = PAGE_FRAME,
): GroupHit | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i]
    if (!isContainerShape(s)) continue
    if (s.id === excludeId) continue
    const content = getContentFrame(frame, s)
    const local = pointFromPage(content, { x: px, y: py })
    if (local.x >= 0 && local.x <= s.width && local.y >= 0 && local.y <= s.height) {
      const nested = findInnermostGroupAt(s.children, px, py, excludeId, content)
      return nested ?? { id: s.id, frame: content, width: s.width, height: s.height }
    }
  }
  return null
}
