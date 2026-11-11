import { theme } from 'antd'

// The dashed frame that makes a group visible on the canvas. Shared by the
// placed group and the drawing preview, so what you see while dragging is
// exactly what you get once the shape exists.

const DASH = '8 6'
const RADIUS = 4
const STROKE_WIDTH = 2

interface ContainerFrameProps {
    // Omitted by callers that already sit in the group's own coordinate space
    // (SVGGroup translates its <g>).
    x?: number
    y?: number
    width: number
    height: number
    // A repeated group's frame is tinted like its badge.
    repeat: boolean
    // A group that paints its own background or border shows that instead:
    // the frame then drops its tint, or its outline.
    tinted?: boolean
    outlined?: boolean
    // 'all' for a placed group — the frame is its hit area, painted or not;
    // 'none' for the preview, which must not swallow the pointer mid-drag.
    pointerEvents: 'all' | 'none'
}

export function ContainerFrame({
    x, y, width, height, repeat, tinted = true, outlined = true, pointerEvents,
}: ContainerFrameProps) {
    const { token } = theme.useToken()

    return (
        <rect
            x={x}
            y={y}
            width={width}
            height={height}
            fill={tinted ? token.colorFillTertiary : 'none'}
            stroke={outlined ? (repeat ? token.colorWarning : token.colorBorder) : 'none'}
            strokeWidth={STROKE_WIDTH}
            strokeDasharray={DASH}
            rx={RADIUS}
            ry={RADIUS}
            pointerEvents={pointerEvents}
        />
    )
}
