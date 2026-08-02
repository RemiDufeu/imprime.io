import type { Shape, GroupShape } from '../types.js'

function expandGroup(group: GroupShape): Shape[] {
  const translated = group.children.map(child =>
    ({ ...child, x: child.x + group.x, y: child.y + group.y }) as Shape
  )
  return resolveShapes(translated)
}

export function resolveShapes(shapes: Shape[]): Shape[] {
  const out: Shape[] = []
  for (const shape of shapes) {
    if (shape.type === 'group') {
      out.push(...expandGroup(shape))
    } else {
      out.push(shape)
    }
  }
  return out
}
