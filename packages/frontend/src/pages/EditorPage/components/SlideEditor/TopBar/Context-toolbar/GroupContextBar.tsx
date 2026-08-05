import { Input } from 'antd'
import type { GroupShape } from '@imprime/sdk'
import { useEditorStore } from '../../../../../../store/editor/EditorStore'

export function GroupContextBar() {
  const selectedShape = useEditorStore(state => state.selectedShape)
  const updateShape = useEditorStore(state => state.updateShape)

  if (!selectedShape || selectedShape.type !== 'group') {
    return null
  }

  const shape: GroupShape = selectedShape

  return (
    <div className="toolbar-container context-toolbar">
      <div className="toolbar-item">
        <span className="toolbar-label">Name</span>
        <Input
          size="small"
          style={{ width: 200 }}
          placeholder="group"
          value={shape.name ?? ''}
          onChange={e => updateShape(shape.id, { name: e.target.value })}
        />
      </div>
    </div>
  )
}
