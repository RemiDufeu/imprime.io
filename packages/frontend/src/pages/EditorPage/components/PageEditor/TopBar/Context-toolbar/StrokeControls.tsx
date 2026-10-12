import { InputNumber, Select } from 'antd'
import type { StrokeStyle } from '../../../../../../store/editor/ToolSlice'
import { DebouncedColorPicker } from '../../../../../../components/common'

// Named like the shape's own fields, so a bar hands the patch straight on.
export interface StrokeValue {
  stroke: string
  strokeWidth: number
  strokeStyle: StrokeStyle
}

interface StrokeControlsProps {
  value: StrokeValue
  onChange: (patch: Partial<StrokeValue>) => void
}

// A shape's border: colour, width and dash. The shape bar's and the image
// bar's.
export function StrokeControls({ value, onChange }: StrokeControlsProps) {
  return (
    <div className="toolbar-item">
      <span className="toolbar-label">Stroke</span>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <DebouncedColorPicker
          value={value.stroke}
          onChange={(stroke: string) => onChange({ stroke })}
          size="small"
          showText={false}
        />
        <InputNumber
          min={0}
          max={20}
          value={value.strokeWidth}
          onChange={(width: number | null) => onChange({ strokeWidth: width ?? 0 })}
          style={{ width: '60px' }}
          size="small"
          placeholder="Width"
        />
        <Select
          value={value.strokeStyle}
          onChange={(strokeStyle: StrokeStyle) => onChange({ strokeStyle })}
          style={{ width: '90px' }}
          size="small"
          options={[
            { value: 'solid', label: 'Solid' },
            { value: 'dashed', label: 'Dashed' },
            { value: 'dotted', label: 'Dotted' },
          ]}
        />
      </div>
    </div>
  )
}
