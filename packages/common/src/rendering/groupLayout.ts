import type { BaseShape, GroupAlign, GroupJustify, GroupShape, Shape } from '../types.js'
import { isContainerShape } from '../types.js'
import { getPadding } from './boxGeometry.js'

// A small flexbox subset: two pure primitives, the group layout built on them,
// and `layoutTree`, which sizes and places a whole tree — the one entry point
// the editor and the export share.

/**
 * Distribute items of the given main-axis `sizes` inside a container of
 * `containerMain`, returning one main-axis offset per item.
 */
export function distributeMainAxis(
  sizes: number[],
  containerMain: number,
  gap: number,
  justify: GroupJustify,
): number[] {
  const n = sizes.length
  if (n === 0) return []

  const contentMain = sizes.reduce((sum, size) => sum + size, 0) + gap * Math.max(0, n - 1)
  const freeSpace = Math.max(0, containerMain - contentMain)

  let cursor = 0
  let itemGap = gap
  if (justify === 'center') {
    cursor = freeSpace / 2
  } else if (justify === 'end') {
    cursor = freeSpace
  } else if (justify === 'space-between' && n > 1) {
    itemGap = gap + freeSpace / (n - 1)
  } else if (justify === 'space-around') {
    const around = freeSpace / n
    cursor = around / 2
    itemGap = gap + around
  }

  return sizes.map(size => {
    const at = cursor
    cursor += size + itemGap
    return at
  })
}

/**
 * Cross-axis offset of one item. `stretch` is handled by the caller, which is
 * the only one that can resize the item — here it behaves like `start`.
 */
export function crossAxisOffset(align: GroupAlign, containerCross: number, itemCross: number): number {
  if (align === 'center') return (containerCross - itemCross) / 2
  if (align === 'end') return containerCross - itemCross
  return 0
}

export type SizeAxis = 'width' | 'height'

/** The axis a group hugs its content along, or null when it does not hug. */
export function getHugAxis(group: GroupShape): SizeAxis | null {
  if (group.hug !== true) return null
  if (group.layout === 'horizontal') return 'width'
  if (group.layout === 'vertical') return 'height'
  return null
}

/**
 * The sizes a parent sets on its child itself, whatever the child's own:
 * along a row or column, the main size of a growing child — unless the parent
 * hugs that axis — and across one, or down a stack, the size `stretch` gives.
 * They win over the child's own hug.
 */
export function getImposedAxes(parent: GroupShape, child: BaseShape): Record<SizeAxis, boolean> {
  const imposed = { width: false, height: false }
  const stretched = parent.align === 'stretch'
  if (parent.layout === 'horizontal' || parent.layout === 'vertical') {
    const main: SizeAxis = parent.layout === 'horizontal' ? 'width' : 'height'
    const cross: SizeAxis = main === 'width' ? 'height' : 'width'
    if (getGrow(child) > 0 && getHugAxis(parent) !== main) imposed[main] = true
    if (stretched) imposed[cross] = true
  } else if (parent.layout === 'stack' && stretched) {
    imposed.height = true
  }
  return imposed
}

/** A shape's flex-grow, sanitised: anything but a positive number is 0. */
export function getGrow(shape: BaseShape): number {
  const { grow } = shape
  return typeof grow === 'number' && Number.isFinite(grow) && grow > 0 ? grow : 0
}

/**
 * Main-axis sizes once the growing items have taken the free space: what is
 * left of `containerMain` after the fixed items and the gaps, shared by `grows`.
 * A growing item's own size is not counted — CSS's `flex: <n>`, basis 0 — and
 * with no room left it gets none.
 */
export function growMainSizes(sizes: number[], grows: number[], containerMain: number, gap: number): number[] {
  const totalGrow = grows.reduce((sum, grow) => sum + grow, 0)
  if (totalGrow === 0) return sizes

  const fixed = sizes.reduce((sum, size, i) => (grows[i] > 0 ? sum : sum + size), 0)
  const free = Math.max(0, containerMain - fixed - gap * Math.max(0, sizes.length - 1))
  return sizes.map((size, i) => (grows[i] > 0 ? (free * grows[i]) / totalGrow : size))
}

// In a stack, `justify` places a child across: there is no row to distribute,
// so the spacing values align to the start.
function stackOffset(justify: GroupJustify, containerMain: number, itemMain: number): number {
  return crossAxisOffset(justify === 'center' || justify === 'end' ? justify : 'start', containerMain, itemMain)
}

/**
 * Compute each direct child's x/y — and its main-axis size when it grows, its
 * cross-axis size for `align: 'stretch'` — from the group's own
 * layout/justify/align/gap, inside its padding.
 * Returns the children untouched when `layout` is 'none' or unset — free-form
 * positioning.
 *
 * Shared between the editor (which persists the result so drag/hit-testing/
 * selection have real coordinates to work with) and the export/render path
 * (which recomputes live rather than trusting whatever was last saved — the
 * only way this stays correct once children come from dynamic data).
 */
export function layoutGroupChildren(group: GroupShape): Shape[] {
  const { children, layout } = group
  if (!layout || layout === 'none' || children.length === 0) return children

  const padding = getPadding(group.padding)
  const innerWidth = Math.max(0, group.width - padding.left - padding.right)
  const innerHeight = Math.max(0, group.height - padding.top - padding.bottom)
  const align = group.align ?? 'start'
  const stretched = align === 'stretch'

  if (layout === 'stack') {
    const justify = group.justify ?? 'start'
    return children.map(child => ({
      ...child,
      x: padding.left + stackOffset(justify, innerWidth, child.width),
      y: padding.top + (stretched ? 0 : crossAxisOffset(align, innerHeight, child.height)),
      height: stretched ? innerHeight : child.height,
    }) as Shape)
  }

  const isRow = layout === 'horizontal'
  const groupCross = isRow ? innerHeight : innerWidth
  const groupMain = isRow ? innerWidth : innerHeight
  const gap = group.gap ?? 0

  // Growing children first take the free space; with any of them, none is
  // left for `justify` to spread. A hugging group has none to give.
  const hugs = getHugAxis(group) !== null
  const mainSizes = growMainSizes(
    children.map(child => (isRow ? child.width : child.height)),
    children.map(child => (hugs ? 0 : getGrow(child))),
    groupMain,
    gap,
  )
  const mainOffsets = distributeMainAxis(mainSizes, groupMain, gap, group.justify ?? 'start')

  return children.map((child, i) => {
    const childCross = isRow ? child.height : child.width
    const crossPos = stretched ? 0 : crossAxisOffset(align, groupCross, childCross)
    const crossSize = stretched ? groupCross : childCross

    return (isRow
      ? { ...child, x: padding.left + mainOffsets[i], y: padding.top + crossPos, width: mainSizes[i], height: crossSize }
      : { ...child, x: padding.left + crossPos, y: padding.top + mainOffsets[i], width: crossSize, height: mainSizes[i] }) as Shape
  })
}

/**
 * The group sized to its children along the axis it hugs: their sizes, the gaps
 * between them and its padding. Its children must be measured already.
 */
export function hugGroup(group: GroupShape): GroupShape {
  const axis = getHugAxis(group)
  if (!axis) return group

  const padding = getPadding(group.padding)
  const content = group.children.reduce((sum, child) => sum + child[axis], 0)
    + (group.gap ?? 0) * Math.max(0, group.children.length - 1)
  return axis === 'width'
    ? { ...group, width: padding.left + padding.right + content }
    : { ...group, height: padding.top + padding.bottom + content }
}

// Bottom-up: a hugging group takes its size from its children, so they are
// measured first. Exact in one pass, because nothing the placement does later
// changes a size a hug counted: a hugging group ignores its children's `grow`,
// `stretch` acts across its axis, and no text is measured.
function measureTree(shapes: Shape[]): Shape[] {
  return shapes.map(shape =>
    isContainerShape(shape) ? hugGroup({ ...shape, children: measureTree(shape.children) }) : shape
  )
}

// Top-down: each group places its children within its final size — which may
// resize them (`grow`, `stretch`) — and then each child places its own.
function placeTree(shapes: Shape[]): Shape[] {
  return shapes.map(shape =>
    isContainerShape(shape) ? { ...shape, children: placeTree(layoutGroupChildren(shape)) } : shape
  )
}

/**
 * Size every hugging group, then lay every group's children out: the tree
 * with final sizes and positions, still parent-relative. The editor applies it
 * to the authored tree on every write; the export to the tree its data
 * produced, copies in and hidden shapes out.
 */
export function layoutTree(shapes: Shape[]): Shape[] {
  return placeTree(measureTree(shapes))
}
