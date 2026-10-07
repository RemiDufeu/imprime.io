import { InputNumber, Divider } from 'antd'
import { useEditorStore } from '../../../../../../store/editor/EditorStore'
import { selectSelectedShape } from '../../../../../../store/editor/selectors'
import type { DrawStyle } from '../../../../../../store/editor/ToolSlice'
import { DebouncedColorPicker } from '../../../../../../components/common'
import { StrokeControls } from './StrokeControls'

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
      <StrokeControls value={style} onChange={apply} />

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