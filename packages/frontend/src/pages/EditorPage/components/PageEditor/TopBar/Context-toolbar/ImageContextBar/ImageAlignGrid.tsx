import type { ImageAlign } from '@imprime/sdk'
import { AlignGrid, type GridPosition } from '../AlignGrid/AlignGrid'

const HORIZONTAL: Record<ImageAlign['horizontal'], GridPosition> = { left: 'start', center: 'center', right: 'end' }
const VERTICAL: Record<ImageAlign['vertical'], GridPosition> = { top: 'start', middle: 'center', bottom: 'end' }
const TO_HORIZONTAL: Record<GridPosition, ImageAlign['horizontal']> = { start: 'left', center: 'center', end: 'right' }
const TO_VERTICAL: Record<GridPosition, ImageAlign['vertical']> = { start: 'top', center: 'middle', end: 'bottom' }

interface ImageAlignGridProps {
  value: ImageAlign
  // 'fill' has nothing to align: the image is the box.
  disabled: boolean
  onChange: (align: ImageAlign) => void
}

// The nine places an image can sit in its box.
export function ImageAlignGrid({ value, disabled, onChange }: ImageAlignGridProps) {
  return (
    <AlignGrid
      horizontal={HORIZONTAL[value.horizontal]}
      vertical={VERTICAL[value.vertical]}
      disabled={disabled}
      label="Image alignment"
      onChange={(horizontal, vertical) => onChange({
        horizontal: TO_HORIZONTAL[horizontal],
        vertical: TO_VERTICAL[vertical],
      })}
    />
  )
}
