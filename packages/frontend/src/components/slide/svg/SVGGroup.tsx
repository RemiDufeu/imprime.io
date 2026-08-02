import type { GroupShape } from '@imprime/sdk'
import { SVGShape } from './SVGShape'
import { SVGSelectionWrapper } from './SVGSelectionWrapper'

interface SVGGroupProps {
    shape: GroupShape
    readonly?: boolean
}

// Renders a group as a dashed box + optional label. Children are drawn in the
// group's local coordinate space via a translate — that way each child renders
// at its own relative (x, y) and can carry its own SVGSelectionWrapper for
// individual selection/drag without any coordinate gymnastics.
export function SVGGroup({ shape, readonly = false }: SVGGroupProps) {
    const label = shape.name ?? 'group'

    return (
        <g transform={`translate(${shape.x} ${shape.y})`}>
            <rect
                x={0}
                y={0}
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
                x={8}
                y={20}
                fontSize={14}
                fontFamily="monospace"
                fill="#64748b"
                pointerEvents="none"
            >
                {label}
            </text>
            {shape.children.map(child => (
                <SVGSelectionWrapper key={child.id} shape={child} readonly={readonly}>
                    <SVGShape shape={child} readonly={readonly} />
                </SVGSelectionWrapper>
            ))}
        </g>
    )
}
