import type { Shape } from '@imprime/sdk'
import { layoutGroupChildren } from '@imprime/sdk'

// Walk the whole tree and re-lay-out every group that has an active layout.
// A group's own children are positioned first (so a `stretch`-resized child
// carries its new size into the recursive call), then we recurse into it —
// this way a nested auto-layout group reflows against its up-to-date size.
export function reflowGroups(shapes: Shape[]): Shape[] {
  return shapes.map(s => {
    if (s.type !== 'group') return s
    const laidOut = layoutGroupChildren(s)
    return { ...s, children: reflowGroups(laidOut) }
  })
}
