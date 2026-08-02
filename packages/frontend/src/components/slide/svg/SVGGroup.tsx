import type { GroupShape } from '@imprime/sdk'
import { SVGShape } from './SVGShape'

interface SVGGroupProps {
    shape: GroupShape
    readonly?: boolean
}

export function SVGGroup({ shape, readonly }: SVGGroupProps) {
    const label = shape.name ?? 'group'

    const absoluteChildren = shape.children.map(child => ({
        ...child,
        x: shape.x + child.x,
        y: shape.y + child.y,
    }))

    return (
        <g>
            <rect
                x={shape.x}
                y={shape.y}
                width={shape.width}
                height={shape.height}
                fill="rgba(148, 163, 184, 0.04)"
                stroke="#94a3b8"
                strokeWidth={2}
                strokeDasharray="8 6"
                rx={4}
                ry={4}
                pointerEvents="all"
            />
            <text
                x={shape.x + 8}
                y={shape.y + 20}
                fontSize={14}
                fontFamily="monospace"
                fill="#64748b"
                pointerEvents="none"
            >
                {label}
            </text>
            {absoluteChildren.map(child => (
                <SVGShape key={child.id} shape={child} readonly={readonly} />
            ))}
        </g>
    )
}
