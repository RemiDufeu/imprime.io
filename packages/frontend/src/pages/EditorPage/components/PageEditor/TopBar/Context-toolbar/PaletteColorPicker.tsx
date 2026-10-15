import { useRef } from 'react'
import type { ColorPickerProps } from 'antd'
import { useEditorStore } from '../../../../../../store/editor/EditorStore'
import { DebouncedColorPicker } from '../../../../../../components/common'
import { collectDocumentColors } from '../../../../../../utils/documentColors'

interface PaletteColorPickerProps {
  // Unset shows the picker cleared: no colour.
  value: string | undefined
  onChange: (color: string) => void
  onClear: () => void
}

// The context bars' colour picker. Under the picker, one click away: the
// colours picked lately, in any template, and those this template already
// paints with. A colour becomes recent when the picker closes on it, so the
// shades tried on the way leave nothing behind.
export function PaletteColorPicker({ value, onChange, onClear }: PaletteColorPickerProps) {
  const pages = useEditorStore(state => state.template?.pages)
  const recentColors = useEditorStore(state => state.recentColors)
  const addRecentColor = useEditorStore(state => state.addRecentColor)
  // The colour last applied since the picker opened; null once cleared.
  const picked = useRef<string | null>(null)

  const sections: NonNullable<ColorPickerProps['presets']> = [
    { key: 'recent', label: 'Recent', colors: recentColors },
    { key: 'template', label: 'In this template', colors: pages ? collectDocumentColors(pages) : [] },
  ].filter(section => section.colors.length > 0)

  const handleOpenChange = (open: boolean) => {
    if (open || picked.current === null) return
    addRecentColor(picked.current)
    picked.current = null
  }

  return (
    <DebouncedColorPicker
      value={value}
      onChange={(color) => {
        picked.current = color
        onChange(color)
      }}
      onClear={() => {
        picked.current = null
        onClear()
      }}
      onOpenChange={handleOpenChange}
      // No section at all, rather than a divider over nothing.
      presets={sections.length > 0 ? sections : undefined}
      size="small"
      showText={false}
    />
  )
}
