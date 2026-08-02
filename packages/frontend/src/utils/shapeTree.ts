import type { Shape } from '@imprime/sdk'

export interface ShapeLocation {
  shape: Shape
  parentGroupId: string | null
  // Absolute top-left of the shape in slide coordinates
  absX: number
  absY: number
}

// Locate a shape anywhere in the tree along with its parent group and absolute
// top-left position (needed for hit-testing during drag).
export function findShapeById(
  shapes: Shape[],
  id: string,
  parentGroupId: string | null = null,
  offX = 0,
  offY = 0,
): ShapeLocation | null {
  for (const s of shapes) {
    if (s.id === id) {
      return { shape: s, parentGroupId, absX: offX + s.x, absY: offY + s.y }
    }
    if (s.type === 'group') {
      const found = findShapeById(s.children, id, s.id, offX + s.x, offY + s.y)
      if (found) return found
    }
  }
  return null
}

export function updateShapeById(shapes: Shape[], id: string, updates: Partial<Shape>): Shape[] {
  return shapes.map(s => {
    if (s.id === id) return { ...s, ...updates } as Shape
    if (s.type === 'group') {
      return { ...s, children: updateShapeById(s.children, id, updates) }
    }
    return s
  })
}

export function deleteShapeById(shapes: Shape[], id: string): Shape[] {
  const out: Shape[] = []
  for (const s of shapes) {
    if (s.id === id) continue
    if (s.type === 'group') {
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
    if (s.type === 'group') {
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

// Insert `shape` at the end of the children of the group with matching id, or
// at the root when groupId is null.
export function insertShape(shapes: Shape[], groupId: string | null, shape: Shape): Shape[] {
  if (groupId === null) return [...shapes, shape]
  return shapes.map(s => {
    if (s.type !== 'group') return s
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
    if (s.type !== 'group') return s
    if (s.id === groupId) {
      const i = Math.max(0, Math.min(index, s.children.length))
      return { ...s, children: [...s.children.slice(0, i), shape, ...s.children.slice(i)] }
    }
    return { ...s, children: insertShapeAt(s.children, groupId, index, shape) }
  })
}

// Deep-clone a shape and rewrite every id in the subtree to a fresh UUID.
// Needed by "duplicate" so the copy is independent of the source.
export function cloneShapeWithNewIds(shape: Shape): Shape {
  const nextId = crypto.randomUUID()
  if (shape.type === 'group') {
    return { ...shape, id: nextId, children: shape.children.map(cloneShapeWithNewIds) }
  }
  return { ...shape, id: nextId }
}

// True when `ancestorId` is an ancestor of `shapeId` in the tree (or the shape
// itself). Used to reject illegal drops (a group cannot be moved into itself).
export function isDescendantOf(shapes: Shape[], shapeId: string, ancestorId: string): boolean {
  if (shapeId === ancestorId) return true
  for (const s of shapes) {
    if (s.id === ancestorId && s.type === 'group') {
      return findShapeById(s.children, shapeId) !== null
    }
    if (s.type === 'group') {
      if (isDescendantOf(s.children, shapeId, ancestorId)) return true
    }
  }
  return false
}

// Find the innermost group whose absolute bounding box contains (px, py).
// Skips the shape identified by `excludeId` (used to avoid dropping a group
// into itself, or a shape into its current parent while dragging).
export function findInnermostGroupAt(
  shapes: Shape[],
  px: number,
  py: number,
  excludeId?: string,
  offX = 0,
  offY = 0,
): { id: string; absX: number; absY: number; width: number; height: number } | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i]
    if (s.type !== 'group') continue
    if (s.id === excludeId) continue
    const ax = offX + s.x
    const ay = offY + s.y
    if (px >= ax && px <= ax + s.width && py >= ay && py <= ay + s.height) {
      const nested = findInnermostGroupAt(s.children, px, py, excludeId, ax, ay)
      return nested ?? { id: s.id, absX: ax, absY: ay, width: s.width, height: s.height }
    }
  }
  return null
}
