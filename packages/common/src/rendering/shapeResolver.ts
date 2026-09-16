import type { Shape, GroupShape, IfGroupShape, ForGroupShape } from '../types.js'
import { isContainerShape } from '../types.js'
import { layoutGroupChildren, distributeMainAxis, crossAxisOffset } from './groupLayout.js'
import { resolveVariable, type ResolveContext } from './variables.js'

export type { ResolveContext }

// Move a set of children from their parent's local space into the parent's own
// space. Every container expansion needs this, hence the one helper.
function translate(shapes: Shape[], dx: number, dy: number): Shape[] {
  return shapes.map(shape => ({ ...shape, x: shape.x + dx, y: shape.y + dy }) as Shape)
}

function reidShape(shape: Shape, suffix: string): Shape {
  const id = `${shape.id}::${suffix}`
  return isContainerShape(shape)
    ? { ...shape, id, children: shape.children.map(child => reidShape(child, suffix)) } as Shape
    : { ...shape, id } as Shape
}

export interface ChildrenBBox {
  minX: number
  minY: number
  width: number
  height: number
}

// Tight bounding box of the given children. Returns actual extent (max - min)
// so it excludes any empty space between the parent's origin and the topmost/
// leftmost child.
export function childrenBBox(children: Shape[]): ChildrenBBox {
  if (children.length === 0) return { minX: 0, minY: 0, width: 0, height: 0 }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const c of children) {
    if (c.x < minX) minX = c.x
    if (c.y < minY) minY = c.y
    if (c.x + c.width > maxX) maxX = c.x + c.width
    if (c.y + c.height > maxY) maxY = c.y + c.height
  }
  return { minX, minY, width: maxX - minX, height: maxY - minY }
}

// When the group has an active layout, children positions are recomputed from
// the layout rules instead of trusting their persisted x/y — the only way this
// stays correct once children come from dynamic data.
function expandGroup(group: GroupShape, ctx?: ResolveContext): Shape[] {
  return resolveShapes(translate(layoutGroupChildren(group), group.x, group.y), ctx)
}

function expandIfGroup(group: IfGroupShape, ctx?: ResolveContext): Shape[] {
  // Strictly the boolean `true`: a string or a list is never coerced.
  if (resolveVariable(group.conditionVariable, ctx) !== true) return []
  return resolveShapes(translate(group.children, group.x, group.y), ctx)
}

// Per-iteration (x, y) offset relative to the for-group's own origin. Each
// iteration occupies the children's tight bbox, so they are laid out as
// `count` identically-sized items — the same distribution a group applies to
// its children.
function forGroupIterationOffsets(group: ForGroupShape, count: number): { xOff: number; yOff: number }[] {
  if (count <= 0) return []

  const isRow = (group.layout ?? 'vertical') === 'horizontal'
  const bbox = childrenBBox(group.children)
  const iterMain = isRow ? bbox.width : bbox.height
  const iterCross = isRow ? bbox.height : bbox.width

  const mainOffsets = distributeMainAxis(
    Array.from({ length: count }, () => iterMain),
    isRow ? group.width : group.height,
    group.gap ?? 0,
    group.justify ?? 'start',
  )
  const crossPos = crossAxisOffset(group.align ?? 'start', isRow ? group.height : group.width, iterCross)

  return mainOffsets.map(mainPos => ({
    xOff: isRow ? mainPos : crossPos,
    yOff: isRow ? crossPos : mainPos,
  }))
}

function expandForGroup(group: ForGroupShape, ctx?: ResolveContext): Shape[] {
  const items = resolveVariable(group.itemsVariable, ctx)
  if (!Array.isArray(items) || items.length === 0) return []

  // Children are shifted by the tight bbox origin so each iteration lands at
  // (group.x + xOff, group.y + yOff) — otherwise the authored minX/minY get
  // added on top of the layout offset and push iterations off-slide.
  const bbox = childrenBBox(group.children)
  const offsets = forGroupIterationOffsets(group, items.length)

  const out: Shape[] = []
  for (let i = 0; i < items.length; i++) {
    const { xOff, yOff } = offsets[i]
    // Each iteration reforges ids so the renderer never sees duplicate keys —
    // the authored child.id is only unique within the source tree.
    const iteration = group.children.map(child => reidShape(child, `for-${group.id}-${i}`))
    out.push(...resolveShapes(
      translate(iteration, group.x + xOff - bbox.minX, group.y + yOff - bbox.minY),
      ctx,
    ))
  }
  return out
}

/**
 * Flatten a shape tree into absolute-positioned leaves: containers are expanded
 * (conditions evaluated, iterations materialised), hidden shapes are dropped.
 */
export function resolveShapes(shapes: Shape[], ctx?: ResolveContext): Shape[] {
  const out: Shape[] = []
  for (const shape of shapes) {
    if (shape.hidden) continue
    switch (shape.type) {
      case 'group':
        out.push(...expandGroup(shape, ctx))
        break
      case 'if-group':
        out.push(...expandIfGroup(shape, ctx))
        break
      case 'for-group':
        out.push(...expandForGroup(shape, ctx))
        break
      default:
        out.push(shape)
    }
  }
  return out
}
