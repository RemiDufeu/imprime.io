import { Select } from 'antd'
import { useCurrentSlide, useEditorStore } from '../../../../../../store/editor/EditorStore'
import { findShapeById } from '../../../../../../utils/shapeTree'

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

  const options = variables.map(v => ({ value: v._id, label: v.name }))

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
        />
        <span className="toolbar-label" style={{ marginLeft: 8, opacity: 0.7 }}>
          items (comma-separated)
        </span>
      </div>
    </div>
  )
}
