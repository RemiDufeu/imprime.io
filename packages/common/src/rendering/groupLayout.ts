import type { GroupAlign, GroupJustify, GroupShape, Shape } from '../types.js'

// A small flexbox subset, expressed as two pure primitives so the two things
// that need it — laying out a group's children, and spacing a for-group's
// iterations — share one implementation instead of two copies that drift.

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

/**
 * Compute each direct child's x/y (and, for `align: 'stretch'`, its cross-axis
 * size) from the group's own layout/justify/align/gap. Returns the children
 * untouched when `layout` is 'none' or unset — free-form positioning.
 *
 * Shared between the editor (which persists the result so drag/hit-testing/
 * selection have real coordinates to work with) and the export/render path
 * (which recomputes live rather than trusting whatever was last saved — the
 * only way this stays correct once children come from dynamic data).
 */
export function layoutGroupChildren(group: GroupShape): Shape[] {
  const { children, layout } = group
  if (!layout || layout === 'none' || children.length === 0) return children

  const isRow = layout === 'horizontal'
  const align = group.align ?? 'start'
  const groupCross = isRow ? group.height : group.width

  const mainOffsets = distributeMainAxis(
    children.map(child => (isRow ? child.width : child.height)),
    isRow ? group.width : group.height,
    group.gap ?? 0,
    group.justify ?? 'start',
  )

  return children.map((child, i) => {
    const childCross = isRow ? child.height : child.width
    const stretched = align === 'stretch'
    const crossPos = stretched ? 0 : crossAxisOffset(align, groupCross, childCross)
    const crossSize = stretched ? groupCross : childCross

    return (isRow
      ? { ...child, x: mainOffsets[i], y: crossPos, height: crossSize }
      : { ...child, x: crossPos, y: mainOffsets[i], width: crossSize }) as Shape
  })
}
