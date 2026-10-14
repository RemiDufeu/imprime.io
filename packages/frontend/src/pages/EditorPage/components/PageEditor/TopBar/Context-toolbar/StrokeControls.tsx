import { InputNumber } from 'antd'
import { BorderOuterOutlined, DashOutlined, LineOutlined, SmallDashOutlined } from '@ant-design/icons'
import type { Sides } from '@imprime/sdk'
import { areSidesUniform } from '@imprime/sdk'
import type { StrokeStyle } from '../../../../../../store/editor/ToolSlice'
import { PaletteColorPicker } from './PaletteColorPicker'
import { SidesInput } from './SidesInput/SidesInput'
import { IconMenuButton, type IconMenuOption } from './IconMenuButton/IconMenuButton'

const SIDES: { key: keyof Sides; label: string }[] = [
  { key: 'top', label: 'Top' },
  { key: 'right', label: 'Right' },
  { key: 'bottom', label: 'Bottom' },
  { key: 'left', label: 'Left' },
]

const STROKE_STYLES: IconMenuOption<StrokeStyle>[] = [
  { value: 'solid', icon: <LineOutlined />, title: 'Solid' },
  { value: 'dashed', icon: <DashOutlined />, title: 'Dashed' },
  { value: 'dotted', icon: <SmallDashOutlined />, title: 'Dotted' },
]

// Named like the shape's own fields, so a bar hands the patch straight on.
// `strokeWidths` is a box's — a rectangle's or a group's — whose sides can
// differ: the bar passes it, as the box's widths side by side, to edit them.
export interface StrokeValue {
  // Unset draws no border, whatever its width.
  stroke?: string
  strokeWidth: number
  strokeStyle: StrokeStyle
  strokeWidths?: Sides
}

interface StrokeControlsProps {
  value: StrokeValue
  onChange: (patch: Partial<StrokeValue>) => void
}

// A shape's border: colour, width and dash — the width side by side for a
// box. The shape bar's, the image bar's and the group bar's.
export function StrokeControls({ value, onChange }: StrokeControlsProps) {
  return (
    <div className="toolbar-item">
      <span className="toolbar-label">Stroke</span>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <PaletteColorPicker
          value={value.stroke}
          onChange={(stroke: string) => onChange({ stroke })}
          onClear={() => onChange({ stroke: undefined })}
        />
        {value.strokeWidths ? (
          <SidesInput
            value={value.strokeWidths}
            fields={SIDES}
            // Agreeing sides are one width again, as a box without
            // `strokeWidths` has.
            onChange={(widths) => onChange(areSidesUniform(widths)
              ? { strokeWidth: widths.top, strokeWidths: undefined }
              : { strokeWidths: widths })}
            icon={<BorderOuterOutlined />}
            title="Border width"
            max={20}
          />
        ) : (
          <InputNumber
            min={0}
            max={20}
            value={value.strokeWidth}
            onChange={(width: number | null) => onChange({ strokeWidth: width ?? 0 })}
            style={{ width: '60px' }}
            size="small"
            placeholder="Width"
          />
        )}
        <IconMenuButton
          options={STROKE_STYLES}
          value={value.strokeStyle}
          title="Border style"
          onChange={(strokeStyle: StrokeStyle) => onChange({ strokeStyle })}
        />
      </div>
    </div>
  )
}
