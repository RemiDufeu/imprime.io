import type { Shape, GroupShape } from '../types.js'
import { layoutGroupChildren } from './groupLayout.js'

function expandGroup(group: GroupShape): Shape[] {
  // When the group has an active layout, recompute children positions from
  // the layout rules instead of trusting their persisted x/y — the only way
  // this stays correct once children come from dynamic data (e.g. a
  // repeated itemPath) that didn't exist when the editor last saved.
  const laidOut = layoutGroupChildren(group)
  const translated = laidOut.map(child =>
    ({ ...child, x: child.x + group.x, y: child.y + group.y }) as Shape
  )
  return resolveShapes(translated)
}

export function resolveShapes(shapes: Shape[]): Shape[] {
  const out: Shape[] = []
  for (const shape of shapes) {
    // Hidden shapes (and hidden groups + their entire subtree) are excluded
    // from render output.
    if (shape.hidden) continue
    if (shape.type === 'group') {
      out.push(...expandGroup(shape))
    } else {
      out.push(shape)
    }
  }
  return out
}
