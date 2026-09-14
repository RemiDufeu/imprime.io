import type { ContainerShape } from '@imprime/sdk'
import { theme } from 'antd'
import { SVGShape } from './SVGShape'
import { SVGSelectionWrapper } from './SVGSelectionWrapper'

interface SVGGroupProps {
    shape: ContainerShape
    readonly?: boolean
}

export function SVGGroup({ shape, readonly = false }: SVGGroupProps) {
    const { token } = theme.useToken()

    let stroke = token.colorBorder
    if (shape.type === 'if-group') stroke = token.colorInfo
    else if (shape.type === 'for-group') stroke = token.colorWarning

    return (
        <g transform={`translate(${shape.x} ${shape.y})`}>
            <rect
                x={0}
                y={0}
                width={shape.width}
                height={shape.height}
                fill={token.colorFillTertiary}
                stroke={stroke}
                strokeWidth={2}
                strokeDasharray="8 6"
                rx={4}
                ry={4}
                pointerEvents="all"
            />
            {shape.children.map(child => (
                <SVGSelectionWrapper key={child.id} shape={child} readonly={readonly}>
                    <SVGShape shape={child} readonly={readonly} />
                </SVGSelectionWrapper>
            ))}
        </g>
    )
}
