import type { Shape } from '@imprime/sdk'
import { ShapeRow } from '../ShapeRow/ShapeRow'

// Render a parent's children top-down (highest z-index first). The row itself
// is the drop zone — no separators.
export function SiblingList({
    shapes,
    parentId,
    depth,
}: {
    shapes: Shape[]
    parentId: string | null
    depth: number
}) {
    return (
        <>
            {shapes.map((shape, arrayIndex) => (
                <ShapeRow
                    key={shape.id}
                    shape={shape}
                    depth={depth}
                    parentId={parentId}
                    arrayIndex={arrayIndex}
                />
            ))}
        </>
    )
}
