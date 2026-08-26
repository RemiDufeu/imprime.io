import type { EllipseShape } from '@imprime/sdk'
import { getDashArray, getEllipseGeometry } from '@imprime/sdk'

interface SVGEllipseProps {
    shape: EllipseShape
}

export function SVGEllipse({ shape }: SVGEllipseProps) {
    const { cx, cy, rx, ry } = getEllipseGeometry(shape)

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
