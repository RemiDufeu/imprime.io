import { InputNumber, Divider } from 'antd'
import { getBorderWidths } from '@imprime/sdk'
import { useEditorStore } from '../../../../../../store/editor/EditorStore'
import { selectSelectedShape } from '../../../../../../store/editor/selectors'
import type { DrawStyle } from '../../../../../../store/editor/ToolSlice'
import { DebouncedColorPicker } from '../../../../../../components/common'
import { StrokeControls, type StrokeValue } from './StrokeControls'
import { CornerRadiusInput } from './CornerRadiusInput'
import { ConditionControl } from './ConditionControl'
import { FlexControl } from './FlexControl'

// Styles a selected rectangle or ellipse, or — with a drawing tool active —
// the ones about to be drawn. One write, to whichever is shown. A selected
// rectangle's border and corners can also differ side by side; the drawing
// style keeps one of each.
export function ShapeContextBar() {
  const selectedTool = useEditorStore(state => state.selectedTool)
  const selected = useEditorStore(selectSelectedShape)
  const drawStyle = useEditorStore(state => state.drawStyle)
  const setDrawStyle = useEditorStore(state => state.setDrawStyle)
  const updateShape = useEditorStore(state => state.updateShape)

  const shape = selected?.type === 'rectangle' || selected?.type === 'ellipse' ? selected : null
  const rectangle = shape?.type === 'rectangle' ? shape : null
  const style: StrokeValue & { fill?: string } = shape
    ? {
        fill: shape.fill,
        stroke: shape.stroke,
        strokeWidth: shape.strokeWidth ?? 0,
        strokeStyle: shape.strokeStyle ?? 'solid',
        strokeWidths: rectangle ? getBorderWidths(rectangle) : undefined,
      }
    : drawStyle
  const isRectangleContext = shape ? rectangle !== null : selectedTool === 'rectangle'

  const apply = (patch: Partial<DrawStyle> | Partial<StrokeValue>) => {
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
          onClear={() => apply({ fill: undefined })}
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

          {rectangle ? (
            <CornerRadiusInput
              value={rectangle.cornerRadius}
              onChange={(cornerRadius) => updateShape(rectangle.id, { cornerRadius })}
            />
          ) : (
            <div className="toolbar-item">
              <span className="toolbar-label">Radius</span>
              <InputNumber
                min={0}
                max={100}
                value={drawStyle.cornerRadius}
                onChange={(value: number | null) => setDrawStyle({ cornerRadius: value ?? 0 })}
                style={{ width: '60px' }}
                size="small"
              />
            </div>
          )}
        </>
      )}

      {shape && (
        <>
          <Divider type="vertical" style={{ height: '24px' }} />
          <FlexControl shape={shape} />
          <ConditionControl shape={shape} />
        </>
      )}
    </div>
  )
}
