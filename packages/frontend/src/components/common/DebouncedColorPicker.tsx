import { useState } from 'react'
import { ColorPicker } from 'antd'
import type { Color } from 'antd/es/color-picker'

interface DebouncedColorPickerProps {
  value: string
  onChange: (color: string) => void
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
}: DebouncedColorPickerProps) {
  const [previewColor, setPreviewColor] = useState<string | null>(null)

  const handleColorChange = (color: Color) => {
    setPreviewColor(color.toHexString())
  }

  const handleColorChangeComplete = (color: Color) => {
    const hexColor = color.toHexString()
    setPreviewColor(null)

    onChange(hexColor)
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
    />
  )
}
