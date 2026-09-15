import type { Shape, GroupShape, IfGroupShape, ForGroupShape, Presentation, VariableValueType } from '../types.js'
import { layoutGroupChildren } from './groupLayout.js'

function reidShape(shape: Shape, suffix: string): Shape {
  if (shape.type === 'group' || shape.type === 'if-group' || shape.type === 'for-group') {
    return {
      ...shape,
      id: `${shape.id}::${suffix}`,
      children: shape.children.map(c => reidShape(c, suffix)),
    } as Shape
  }
  return { ...shape, id: `${shape.id}::${suffix}` } as Shape
}

// Values are looked up by variable name (that's the surface the export
// endpoint / UI expose today). The presentation carries the variables so we
// can fall back to `default` when no runtime value was supplied.
export interface ResolveContext {
  variableValues: Record<string, VariableValueType>
  presentation?: Presentation
}

function readVariableValue(id: string | undefined, ctx?: ResolveContext): VariableValueType | undefined {
  if (!id || !ctx) return undefined
  // conditionVariable / itemsVariable store the variable _id; look up by _id
  // then read the runtime value by name (or default from the variable).
  const variable = ctx.presentation?.variableData?.find(v => v._id === id)
  if (!variable) return undefined
  const runtime = ctx.variableValues[variable.name]
  if (runtime !== undefined && runtime !== null) return runtime
  return variable.default
}

function expandGroup(group: GroupShape, ctx?: ResolveContext): Shape[] {
  // When the group has an active layout, recompute children positions from
  // the layout rules instead of trusting their persisted x/y — the only way
  // this stays correct once children come from dynamic data.
  const laidOut = layoutGroupChildren(group)
  const translated = laidOut.map(child =>
    ({ ...child, x: child.x + group.x, y: child.y + group.y }) as Shape
  )
  return resolveShapes(translated, ctx)
}

function expandIfGroup(group: IfGroupShape, ctx?: ResolveContext): Shape[] {
  const value = readVariableValue(group.conditionVariable, ctx)
  if (value !== true) return []
  const translated = group.children.map(child =>
    ({ ...child, x: child.x + group.x, y: child.y + group.y }) as Shape
  )
  return resolveShapes(translated, ctx)
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

// Computes the per-iteration (x, y) offset relative to the for-group's own
// origin, given how many iterations to emit.
function forGroupIterationOffsets(
  group: ForGroupShape,
  count: number
): { xOff: number; yOff: number }[] {
  if (count <= 0) return []
  const layout = group.layout ?? 'vertical'
  const gap = group.gap ?? 0
  const justify = group.justify ?? 'start'
  const align = group.align ?? 'start'
  const isRow = layout === 'horizontal'

  const bbox = childrenBBox(group.children)
  const iterMain = isRow ? bbox.width : bbox.height
  const iterCross = isRow ? bbox.height : bbox.width
  const containerMain = isRow ? group.width : group.height
  const containerCross = isRow ? group.height : group.width

  const contentMain = count * iterMain + gap * Math.max(0, count - 1)
  const freeSpace = Math.max(0, containerMain - contentMain)

  let cursor = 0
  let itemGap = gap
  if (justify === 'center') cursor = freeSpace / 2
  else if (justify === 'end') cursor = freeSpace
  else if (justify === 'space-between' && count > 1) itemGap = gap + freeSpace / (count - 1)
  else if (justify === 'space-around') {
    const around = freeSpace / count
    cursor = around / 2
    itemGap = gap + around
  }

  let crossPos = 0
  if (align === 'center') crossPos = (containerCross - iterCross) / 2
  else if (align === 'end') crossPos = containerCross - iterCross

  const out: { xOff: number; yOff: number }[] = []
  for (let i = 0; i < count; i++) {
    const mainPos = cursor
    cursor += iterMain + itemGap
    out.push({
      xOff: isRow ? mainPos : crossPos,
      yOff: isRow ? crossPos : mainPos,
    })
  }
  return out
}

function expandForGroup(group: ForGroupShape, ctx?: ResolveContext): Shape[] {
  const value = readVariableValue(group.itemsVariable, ctx)
  if (!Array.isArray(value)) return []
  const items = value
  if (items.length === 0) return []

  // Children's positions are subtracted by the tight bbox origin so each
  // iteration is placed at (group.x + xOff, group.y + yOff) — otherwise
  // authored minX/minY get added on top of the layout offset and shift
  // iterations off-slide (space-around, end, center all break).
  const bbox = childrenBBox(group.children)
  const offsets = forGroupIterationOffsets(group, items.length)

  // Each iteration reforges ids so React (react-pdf renderer) doesn't see
  // duplicate keys — the original child.id is only unique for the source tree.
  const out: Shape[] = []
  for (let i = 0; i < items.length; i++) {
    const { xOff, yOff } = offsets[i]
    const translated = group.children.map(child => {
      const reided = reidShape(child, `for-${group.id}-${i}`)
      return {
        ...reided,
        x: reided.x - bbox.minX + group.x + xOff,
        y: reided.y - bbox.minY + group.y + yOff,
      } as Shape
    })
    out.push(...resolveShapes(translated, ctx))
  }
  return out
}

export function resolveShapes(shapes: Shape[], ctx?: ResolveContext): Shape[] {
  const out: Shape[] = []
  for (const shape of shapes) {
    if (shape.hidden) continue
    if (shape.type === 'group') {
      out.push(...expandGroup(shape, ctx))
    } else if (shape.type === 'if-group') {
      out.push(...expandIfGroup(shape, ctx))
    } else if (shape.type === 'for-group') {
      out.push(...expandForGroup(shape, ctx))
    } else {
      out.push(shape)
    }
  }
  return out
}
