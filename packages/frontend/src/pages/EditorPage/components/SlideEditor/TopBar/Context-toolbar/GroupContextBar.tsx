import { Select, InputNumber, Divider } from 'antd'
import type { GroupAlign, GroupJustify, GroupLayoutDirection } from '@imprime/sdk'
import { useCurrentSlide, useEditorStore } from '../../../../../../store/editor/EditorStore'
import { findShapeById } from '../../../../../../utils/shapeTree'

const LAYOUT_OPTIONS: { value: GroupLayoutDirection; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'horizontal', label: 'Horizontal' },
  { value: 'vertical', label: 'Vertical' },
]

const JUSTIFY_OPTIONS: { value: GroupJustify; label: string }[] = [
  { value: 'start', label: 'Start' },
  { value: 'center', label: 'Center' },
  { value: 'end', label: 'End' },
  { value: 'space-between', label: 'Space between' },
  { value: 'space-around', label: 'Space around' },
]

const ALIGN_OPTIONS: { value: GroupAlign; label: string }[] = [
  { value: 'start', label: 'Start' },
  { value: 'center', label: 'Center' },
  { value: 'end', label: 'End' },
  { value: 'stretch', label: 'Stretch' },
]

export function GroupContextBar() {
  const selectedShapeId = useEditorStore(state => state.selectedShape?.id)
  const selectedShapeType = useEditorStore(state => state.selectedShape?.type)
  const updateShape = useEditorStore(state => state.updateShape)
  const currentSlide = useCurrentSlide()

  if (!selectedShapeId || selectedShapeType !== 'group') return null

  // Read the live shape from the tree rather than the store's `selectedShape`
  // snapshot — updateShape doesn't refresh that snapshot, so controls bound
  // to it would appear to ignore every change.
  const loc = currentSlide ? findShapeById(currentSlide.shapes, selectedShapeId) : null
  if (!loc || loc.shape.type !== 'group') return null
  const group = loc.shape

  const layout = group.layout ?? 'none'
  const justify = group.justify ?? 'start'
  const align = group.align ?? 'start'
  const gap = group.gap ?? 0

  const handleLayoutChange = (value: GroupLayoutDirection) => {
    updateShape(group.id, value === 'none'
      ? { layout: value }
      : { layout: value, justify, align, gap: group.gap ?? 8 })
  }

  return (
    <div className="toolbar-container context-toolbar">
      <div className="toolbar-item">
        <span className="toolbar-label">Layout</span>
        <Select
          value={layout}
          onChange={handleLayoutChange}
          size="small"
          style={{ width: 110 }}
          options={LAYOUT_OPTIONS}
        />
      </div>

      {layout !== 'none' && (
        <>
          <Divider type="vertical" style={{ height: '24px' }} />

          <div className="toolbar-item">
            <span className="toolbar-label">Justify</span>
            <Select
              value={justify}
              onChange={(value: GroupJustify) => updateShape(group.id, { justify: value })}
              size="small"
              style={{ width: 140 }}
              options={JUSTIFY_OPTIONS}
            />
          </div>

          <div className="toolbar-item">
            <span className="toolbar-label">Align</span>
            <Select
              value={align}
              onChange={(value: GroupAlign) => updateShape(group.id, { align: value })}
              size="small"
              style={{ width: 100 }}
              options={ALIGN_OPTIONS}
            />
          </div>

          <div className="toolbar-item">
            <span className="toolbar-label">Gap</span>
            <InputNumber
              min={0}
              value={gap}
              onChange={(value) => updateShape(group.id, { gap: value ?? 0 })}
              size="small"
              style={{ width: 64 }}
            />
          </div>
        </>
      )}
    </div>
  )
}
