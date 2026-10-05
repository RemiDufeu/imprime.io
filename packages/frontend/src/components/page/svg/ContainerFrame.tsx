import type { ContainerShape } from '@imprime/sdk'
import { theme } from 'antd'

// The dashed frame that makes a container visible on the canvas. Shared by the
// placed container and the drawing preview, so what you see while dragging is
// exactly what you get once the shape exists.

const DASH = '8 6'
const RADIUS = 4
const STROKE_WIDTH = 2

interface ContainerFrameProps {
    type: ContainerShape['type']
    // Omitted by callers that already sit in the container's own coordinate
    // space (SVGGroup translates its <g>).
    x?: number
    y?: number
    width: number
    height: number
    // 'all' for a placed container — the frame is its hit area; 'none' for the
    // preview, which must not swallow the pointer mid-drag.
    pointerEvents: 'all' | 'none'
}

export function ContainerFrame({ type, x, y, width, height, pointerEvents }: ContainerFrameProps) {
    const { token } = theme.useToken()

    let stroke = token.colorBorder
    if (type === 'if-group') stroke = token.colorInfo
    else if (type === 'for-group') stroke = token.colorWarning

    return (
        <rect
            x={x}
            y={y}
            width={width}
            height={height}
            fill={token.colorFillTertiary}
            stroke={stroke}
            strokeWidth={STROKE_WIDTH}
            strokeDasharray={DASH}
            rx={RADIUS}
            ry={RADIUS}
            pointerEvents={pointerEvents}
        />
    )
}
