import { Select } from 'antd'
import { useCurrentSlide, useEditorStore } from '../../../../../../store/editor/EditorStore'
import { findShapeById } from '../../../../../../utils/shapeTree'

export function IfGroupContextBar() {
  const selectedShapeId = useEditorStore(state => state.selectedShape?.id)
  const selectedShapeType = useEditorStore(state => state.selectedShape?.type)
  const updateShape = useEditorStore(state => state.updateShape)
  const variables = useEditorStore(state => state.presentation?.variableData) ?? []
  const currentSlide = useCurrentSlide()

  if (!selectedShapeId || selectedShapeType !== 'if-group') return null

  const loc = currentSlide ? findShapeById(currentSlide.shapes, selectedShapeId) : null
  if (!loc || loc.shape.type !== 'if-group') return null
  const group = loc.shape

  const options = variables
    .filter(v => v.type === 'boolean')
    .map(v => ({ value: v._id, label: v.name }))

  return (
    <div className="toolbar-container context-toolbar">
      <div className="toolbar-item">
        <span className="toolbar-label">Show when</span>
        <Select
          value={group.conditionVariable}
          onChange={(value: string | undefined) => updateShape(group.id, { conditionVariable: value })}
          size="small"
          style={{ width: 200 }}
          placeholder="Select a boolean variable"
          allowClear
          options={options}
          notFoundContent="No boolean variables"
        />
      </div>
    </div>
  )
}
