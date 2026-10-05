import { InputNumber, Select, Divider } from 'antd'
import { useEditorStore } from '../../../../../../store/editor/EditorStore'
import { selectSelectedShape } from '../../../../../../store/editor/selectors'
import type { DrawStyle, StrokeStyle } from '../../../../../../store/editor/ToolSlice'
import { DebouncedColorPicker } from '../../../../../../components/common'

// Styles a selected rectangle or ellipse, or — with a drawing tool active —
// the ones about to be drawn. One write, to whichever is shown.
export function ShapeContextBar() {
  const selectedTool = useEditorStore(state => state.selectedTool)
  const selected = useEditorStore(selectSelectedShape)
  const drawStyle = useEditorStore(state => state.drawStyle)
  const setDrawStyle = useEditorStore(state => state.setDrawStyle)
  const updateShape = useEditorStore(state => state.updateShape)

  const shape = selected?.type === 'rectangle' || selected?.type === 'ellipse' ? selected : null
  const style: DrawStyle = shape
    ? {
        fill: shape.fill,
        stroke: shape.stroke ?? drawStyle.stroke,
        strokeWidth: shape.strokeWidth ?? 0,
        strokeStyle: shape.strokeStyle ?? 'solid',
        cornerRadius: shape.type === 'rectangle' ? shape.cornerRadius ?? 0 : 0,
      }
    : drawStyle
  const isRectangleContext = shape ? shape.type === 'rectangle' : selectedTool === 'rectangle'

  const apply = (patch: Partial<DrawStyle>) => {
    if (shape) updateShape(shape.id, patch)
    else setDrawStyle(patch)
  }

  return (
    <div className="toolbar-container context-toolbar">
      {/* Fill Section */}
      <div className="toolbar-item">
        <span className="toolbar-label">Fill</span>
        <DebouncedColorPicker
          value={style.fill}
          onChange={(fill: string) => apply({ fill })}
          size="small"
          showText={false}
        />
      </div>

      <Divider type="vertical" style={{ height: '24px' }} />

      {/* Stroke Section */}
      <div className="toolbar-item">
        <span className="toolbar-label">Stroke</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <DebouncedColorPicker
            value={style.stroke}
            onChange={(stroke: string) => apply({ stroke })}
            size="small"
            showText={false}
          />
          <InputNumber
            min={0}
            max={20}
            value={style.strokeWidth}
            onChange={(value: number | null) => apply({ strokeWidth: value ?? 0 })}
            style={{ width: '60px' }}
            size="small"
            placeholder="Width"
          />
          <Select
            value={style.strokeStyle}
            onChange={(strokeStyle: StrokeStyle) => apply({ strokeStyle })}
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

      {isRectangleContext && (
        <>
          <Divider type="vertical" style={{ height: '24px' }} />

          <div className="toolbar-item">
            <span className="toolbar-label">Radius</span>
            <InputNumber
              min={0}
              max={100}
              value={style.cornerRadius}
              onChange={(value: number | null) => apply({ cornerRadius: value ?? 0 })}
              style={{ width: '60px' }}
              size="small"
            />
          </div>
        </>
      )}
    </div>
  )
}