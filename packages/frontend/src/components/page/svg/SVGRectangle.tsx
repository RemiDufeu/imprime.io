import type { RectangleShape } from '@imprime/sdk'
import { getDashArray, getRectangleCornerRadius } from '@imprime/sdk'

interface SVGRectangleProps {
    shape: RectangleShape
}

export function SVGRectangle({ shape }: SVGRectangleProps) {
    const cornerRadius = getRectangleCornerRadius(shape)

    return (
        <rect
            x={shape.x}
            y={shape.y}
            width={shape.width}
            height={shape.height}
            fill={shape.fill}
            stroke={shape.stroke}
            strokeWidth={shape.strokeWidth}
            strokeDasharray={getDashArray(shape.strokeStyle)}
            rx={cornerRadius}
            ry={cornerRadius}
        />
    )
}
