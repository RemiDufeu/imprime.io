import type { RectangleShape } from '@imprime/sdk'
import { getBoxPaths, getDashArray } from '@imprime/sdk'

interface SVGBoxProps {
    box: RectangleShape
}

// A box's fill and border, from the paths ExportService.renderRectangle draws:
// a rectangle, or the box a group paints under its children.
export function SVGBox({ box }: SVGBoxProps) {
    const paths = getBoxPaths(box, box)
    const dash = getDashArray(box.strokeStyle)

    return (
        <>
            {/* SVG paints a missing fill black; unset is transparent. */}
            <path d={paths.fill} fill={box.fill ?? 'none'} />
            {box.stroke && paths.strokes.map((stroke, i) => (
                <path
                    key={i}
                    d={stroke.d}
                    fill="none"
                    stroke={box.stroke}
                    strokeWidth={stroke.width}
                    strokeDasharray={dash}
                />
            ))}
        </>
    )
}
