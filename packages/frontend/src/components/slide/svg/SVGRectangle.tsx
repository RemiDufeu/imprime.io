import type { RectangleShape } from '@imprime/sdk'
import { getDashArray } from '@imprime/sdk'

interface SVGRectangleProps {
    shape: RectangleShape
}

export function SVGRectangle({ shape }: SVGRectangleProps) {
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
            rx={shape.cornerRadius}
            ry={shape.cornerRadius}
        />
    )
}
