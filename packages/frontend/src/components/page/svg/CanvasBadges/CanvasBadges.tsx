import type { ReactNode } from 'react'
import './CanvasBadges.css'

// In page units, as the selection handles are: a badge follows the zoom, never
// the size of the shape it labels.
const FONT_SIZE = 18
const HEIGHT = FONT_SIZE + 12
// Between the row and the shape.
const SPACING = 4

// The colour of a badge, after what it says the data does to the shape.
export type CanvasBadgeTone = 'repeat' | 'condition' | 'muted' | 'variable'

export interface CanvasBadge {
    // The icon the context bar shows for the same binding.
    icon: ReactNode
    label: string
    title: string
    tone: CanvasBadgeTone
}

interface CanvasBadgesProps {
    // The top-left corner of the shape the row labels.
    x: number
    y: number
    badges: CanvasBadge[]
}

// A row of pills, each an icon and a label, over a shape's top-left corner —
// or just inside it when there is no room above: the page clips what runs
// past its edge. Drawn in HTML so each pill is exactly as wide as its content,
// which SVG text cannot be measured for before it is drawn. Editor-only, as
// the chip of a variable run in text is.
export function CanvasBadges({ x, y, badges }: CanvasBadgesProps) {
    if (badges.length === 0) return null
    const top = y - HEIGHT - SPACING >= 0 ? y - HEIGHT - SPACING : y + SPACING

    return (
        // A foreignObject with no area draws nothing, not even what overflows
        // it: the row runs past a square one, as long as its badges.
        <foreignObject x={x} y={top} width={HEIGHT} height={HEIGHT} className="canvas-badges">
            {/* The sizes are set from here so the stylesheet draws the row
                where it was placed. */}
            <div
                className="canvas-badges-row"
                style={{
                    ['--canvas-badge-font-size' as string]: `${FONT_SIZE}px`,
                    ['--canvas-badge-height' as string]: `${HEIGHT}px`,
                }}
            >
                {badges.map((badge, index) => (
                    <span key={index} className={`canvas-badge ${badge.tone}`} title={badge.title}>
                        {badge.icon}
                        {badge.label}
                    </span>
                ))}
            </div>
        </foreignObject>
    )
}
