import type { EllipseShape } from '@imprime/sdk'
import { getDashArray } from '@imprime/sdk'

interface SVGEllipseProps {
    shape: EllipseShape
}

export function SVGEllipse({ shape }: SVGEllipseProps) {
    // Calculate center and radii
    const cx = shape.x + shape.width / 2
    const cy = shape.y + shape.height / 2
    const rx = shape.width / 2
    const ry = shape.height / 2

    return (
        <ellipse
            cx={cx}
            cy={cy}
            rx={rx}
            ry={ry}
            fill={shape.fill}
            stroke={shape.stroke}
            strokeWidth={shape.strokeWidth}
            strokeDasharray={getDashArray(shape.strokeStyle)}
        />
    )
}
