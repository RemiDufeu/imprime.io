import { useState } from 'react'
import { ColorPicker } from 'antd'
import type { Color } from 'antd/es/color-picker'

interface DebouncedColorPickerProps {
  // Unset shows the picker cleared: no colour.
  value: string | undefined
  onChange: (color: string) => void
  // Every colour can be cleared: the paint is then absent, or the default.
  onClear: () => void
  showText?: boolean
  size?: 'small' | 'middle' | 'large',
  onOpenChange?: (open: boolean) => void
}

/**
 * ColorPicker wrapper that only triggers onChange when user finishes selecting a color.
 * Provides real-time preview while dragging without triggering backend saves.
 */
export function DebouncedColorPicker({
  value,
  onChange,
  showText = true,
  size = 'small',
  onOpenChange,
  onClear,
}: DebouncedColorPickerProps) {
  const [previewColor, setPreviewColor] = useState<string | null>(null)

  const handleColorChange = (color: Color) => {
    setPreviewColor(color.cleared ? null : color.toHexString())
  }

  // Clearing reports a change too, with a cleared colour: `onClear` is its
  // only write.
  const handleColorChangeComplete = (color: Color) => {
    setPreviewColor(null)
    if (color.cleared) return
    onChange(color.toHexString())
  }

  const displayColor = previewColor || value

  return (
    <ColorPicker
      value={displayColor}
      onChange={handleColorChange}
      onOpenChange={onOpenChange}
      onChangeComplete={handleColorChangeComplete}
      showText={showText}
      size={size}
      allowClear
      onClear={onClear}
    />
  )
}
