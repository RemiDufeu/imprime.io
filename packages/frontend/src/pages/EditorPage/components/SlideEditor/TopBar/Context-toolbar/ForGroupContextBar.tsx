import { Select, InputNumber, Divider } from 'antd'
import type { GroupAlign, GroupJustify, GroupLayoutDirection } from '@imprime/sdk'
import { useCurrentSlide, useEditorStore } from '../../../../../../store/editor/EditorStore'
import { findShapeById } from '../../../../../../utils/shapeTree'

const LAYOUT_OPTIONS: { value: GroupLayoutDirection; label: string }[] = [
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
]

export function ForGroupContextBar() {
  const selectedShapeId = useEditorStore(state => state.selectedShape?.id)
  const selectedShapeType = useEditorStore(state => state.selectedShape?.type)
  const updateShape = useEditorStore(state => state.updateShape)
  const variables = useEditorStore(state => state.presentation?.variableData) ?? []
  const currentSlide = useCurrentSlide()

  if (!selectedShapeId || selectedShapeType !== 'for-group') return null

  const loc = currentSlide ? findShapeById(currentSlide.shapes, selectedShapeId) : null
  if (!loc || loc.shape.type !== 'for-group') return null
  const group = loc.shape

  const options = variables
    .filter(v => v.type === 'string-list')
    .map(v => ({ value: v._id, label: v.name }))

  const layout = group.layout ?? 'vertical'
  const justify = group.justify ?? 'start'
  const align = group.align ?? 'start'
  const gap = group.gap ?? 0

  return (
    <div className="toolbar-container context-toolbar">
      <div className="toolbar-item">
        <span className="toolbar-label">Repeat for each</span>
        <Select
          value={group.itemsVariable}
          onChange={(value: string | undefined) => updateShape(group.id, { itemsVariable: value })}
          size="small"
          style={{ width: 200 }}
          placeholder="Select a list variable"
          allowClear
          options={options}
          notFoundContent="No list variables"
        />
      </div>

      <Divider type="vertical" style={{ height: '24px' }} />

      <div className="toolbar-item">
        <span className="toolbar-label">Layout</span>
        <Select
          value={layout}
          onChange={(value: GroupLayoutDirection) => updateShape(group.id, { layout: value })}
          size="small"
          style={{ width: 110 }}
          options={LAYOUT_OPTIONS}
        />
      </div>

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
    </div>
  )
}
