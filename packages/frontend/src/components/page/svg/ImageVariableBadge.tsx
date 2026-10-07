import { theme } from 'antd'
import { imageLabelFontSize } from './imageLabel'

// Rough width of a character, as a share of the font size: SVG text cannot be
// measured before it is drawn, and the badge only has to roughly fit its label.
const CHAR_WIDTH = 0.6

interface ImageVariableBadgeProps {
    // The box it labels.
    x: number
    y: number
    width: number
    height: number
    label: string
}

// The variable a box is bound to, over the default image it shows meanwhile:
// the export draws whatever the variable holds then. Editor-only, as the chip
// of a variable run in text is.
export function ImageVariableBadge({ x, y, width, height, label }: ImageVariableBadgeProps) {
    const { token } = theme.useToken()
    const fontSize = imageLabelFontSize(width, height)
    const padding = fontSize / 2
    const badgeHeight = fontSize + padding
    const badgeWidth = Math.min(width - padding * 2, label.length * fontSize * CHAR_WIDTH + padding * 2)
    if (badgeWidth <= 0 || badgeHeight > height) return null

    return (
        <g pointerEvents="none">
            <title>{`Image variable: ${label}`}</title>
            <rect
                x={x + padding}
                y={y + padding}
                width={badgeWidth}
                height={badgeHeight}
                rx={badgeHeight / 2}
                ry={badgeHeight / 2}
                fill={token.colorPrimary}
            />
            <text
                x={x + padding * 2}
                y={y + padding + badgeHeight / 2}
                dominantBaseline="central"
                fontSize={fontSize}
                fontFamily={token.fontFamily}
                fill={token.colorTextLightSolid}
            >
                {label}
            </text>
        </g>
    )
}
