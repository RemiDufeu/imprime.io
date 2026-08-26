import type { GroupShape, Shape } from '../types.js'

// Computes each direct child's x/y (and, for `align: 'stretch'`, its
// cross-axis size) from the group's own layout/justify/align/gap — a small
// flexbox subset. Returns the group's children untouched when `layout` is
// 'none' or unset (free-form positioning, the pre-existing behaviour).
//
// Shared between the editor (which persists the result so drag/hit-testing/
// selection have real coordinates to work with) and the export/render path
// (which recomputes live rather than trusting whatever was last saved — the
// only way this stays correct once children come from dynamic data, e.g. a
// repeated itemPath, instead of what was in the editor when it was saved).
export function layoutGroupChildren(group: GroupShape): Shape[] {
  const { children, layout } = group
  if (!layout || layout === 'none' || children.length === 0) return children

  const isRow = layout === 'horizontal'
  const gap = group.gap ?? 0
  const justify = group.justify ?? 'start'
  const align = group.align ?? 'start'
  const n = children.length

  const mainSize = (s: Shape) => isRow ? s.width : s.height
  const crossSize = (s: Shape) => isRow ? s.height : s.width
  const groupMain = isRow ? group.width : group.height
  const groupCross = isRow ? group.height : group.width

  const contentMain = children.reduce((sum, c) => sum + mainSize(c), 0) + gap * (n - 1)
  const freeSpace = Math.max(0, groupMain - contentMain)

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

  return children.map(child => {
    const cSize = crossSize(child)
    let crossPos = 0
    let stretchedCrossSize = cSize
    if (align === 'center') {
      crossPos = (groupCross - cSize) / 2
    } else if (align === 'end') {
      crossPos = groupCross - cSize
    } else if (align === 'stretch') {
      crossPos = 0
      stretchedCrossSize = groupCross
    }

    const mainPos = cursor
    cursor += mainSize(child) + itemGap

    return (isRow
      ? { ...child, x: mainPos, y: crossPos, height: stretchedCrossSize }
      : { ...child, x: crossPos, y: mainPos, width: stretchedCrossSize }) as Shape
  })
}
