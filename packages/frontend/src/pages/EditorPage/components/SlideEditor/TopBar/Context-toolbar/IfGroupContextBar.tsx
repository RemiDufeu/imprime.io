import { Select } from 'antd'
import { useCurrentSlide, useEditorStore } from '../../../../../../store/editor/EditorStore'
import { findShapeById } from '../../../../../../utils/shapeTree'
import {
  decodeItemFieldValue,
  encodeItemFieldValue,
  itemFieldsInScope,
} from '../../../../../../utils/variableScope'

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

  // A boolean variable, or a boolean field of an item an enclosing for-group is
  // iterating — the latter is how a condition varies per repetition.
  const options = [
    ...variables
      .filter(v => v.type === 'boolean')
      .map(v => ({ value: encodeItemFieldValue(v._id, ''), label: v.name })),
    ...itemFieldsInScope(currentSlide?.shapes ?? [], group.id, variables, 'boolean').map(option => ({
      value: encodeItemFieldValue(option.variableId, option.itemPath),
      label: option.label,
    })),
  ]

  // '' encodes "the variable itself", which is `itemPath` left unset.
  const selected = group.conditionVariable
    ? encodeItemFieldValue(group.conditionVariable, group.itemPath ?? '')
    : undefined

  const handleSelect = (value: string | undefined) => {
    const decoded = decodeItemFieldValue(value)
    updateShape(group.id, {
      conditionVariable: decoded?.variableId,
      itemPath: decoded?.itemPath === '' ? undefined : decoded?.itemPath,
    })
  }

  return (
    <div className="toolbar-container context-toolbar">
      <div className="toolbar-item">
        <span className="toolbar-label">Show when</span>
        <Select
          value={selected}
          onChange={handleSelect}
          size="small"
          style={{ width: 200 }}
          placeholder="Select a boolean variable"
          allowClear
          options={options}
          notFoundContent="No boolean variables or item fields"
        />
      </div>
    </div>
  )
}
