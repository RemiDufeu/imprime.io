import { useEditorStore } from '../../../../../../store/editor/EditorStore'

export function GroupContextBar() {
  const selectedShape = useEditorStore(state => state.selectedShape)

  if (!selectedShape || selectedShape.type !== 'group') {
    return null
  }

  return (
    <div className="toolbar-container context-toolbar">
      <div className="toolbar-item">
        Up comming
      </div>
    </div>
  )
}
