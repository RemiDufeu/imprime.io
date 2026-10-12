import { theme } from 'antd'
import { imageLabelFontSize } from './imageLabel'

// What an image box shows while it has no picture to draw: empty, waiting for
// its image, bound to a variable with no default to show, or failing to load
// its image. Shared by the placed box and the drawing preview, as
// ContainerFrame is. Editor-only: the PDF draws nothing there.

const DASH = '8 6'
const STROKE_WIDTH = 2
// The picture glyph's side: a share of the box's shorter side, within bounds.
const GLYPH_SHARE = 0.4
const GLYPH_MAX = 48

const TITLES = {
    empty: 'Empty image box',
    loading: 'Loading image…',
    error: 'Failed to load image',
    variable: 'Image variable',
} as const

interface ImagePlaceholderProps {
    status: keyof typeof TITLES
    x: number
    y: number
    width: number
    height: number
    // The box's, so the frame follows its border. Unset is square.
    cornerRadius?: number
    // What the box is bound to, shown under the glyph: `logo`, `items.photo`.
    label?: string
}

export function ImagePlaceholder({ status, x, y, width, height, cornerRadius, label }: ImagePlaceholderProps) {
    const { token } = theme.useToken()

    const isError = status === 'error'
    const isVariable = status === 'variable'
    const accent = isError ? token.colorError : isVariable ? token.colorPrimary : undefined
    const glyph = Math.min(GLYPH_MAX, Math.min(width, height) * GLYPH_SHARE)
    const fontSize = imageLabelFontSize(width, height)
    // The glyph moves up to leave the label room under it.
    const glyphY = y + (height - glyph) / 2 - (label ? fontSize : 0)

    let fill = token.colorFillTertiary
    if (isError) fill = token.colorErrorBg
    else if (isVariable) fill = token.colorPrimaryBg

    return (
        <g pointerEvents="none">
            <title>{label ? `${TITLES[status]}: ${label}` : TITLES[status]}</title>
            <rect
                x={x}
                y={y}
                width={width}
                height={height}
                rx={cornerRadius}
                ry={cornerRadius}
                fill={fill}
                stroke={accent ?? token.colorBorder}
                strokeWidth={STROKE_WIDTH}
                strokeDasharray={status === 'empty' || isVariable ? DASH : undefined}
            />
            {status !== 'loading' && glyph > 0 && (
                // A framed landscape, drawn on a 24-unit grid.
                <g
                    transform={`translate(${x + (width - glyph) / 2} ${glyphY}) scale(${glyph / 24})`}
                    fill="none"
                    stroke={accent ?? token.colorTextQuaternary}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                >
                    <rect x={2} y={4} width={20} height={16} rx={2} />
                    <circle cx={8} cy={9.5} r={1.8} />
                    <path d="M3 18l6-6 4 4 3-3 5 5" />
                </g>
            )}
            {label && (
                <text
                    x={x + width / 2}
                    y={glyphY + glyph + fontSize * 1.5}
                    textAnchor="middle"
                    fontSize={fontSize}
                    fontFamily={token.fontFamily}
                    fill={accent ?? token.colorTextSecondary}
                >
                    {label}
                </text>
            )}
        </g>
    )
}
