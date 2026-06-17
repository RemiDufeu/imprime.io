import { useEditorStore } from '../../../../../store/editor/EditorStore'
import { ShapeContextBar } from './ShapeContextBar'
import { TextContextBar } from './TextContextBar'

export function ContextToolbar() {
  const contextBarType = useEditorStore(state => state.contextBarType)

  // Don't render if no context bar should be shown
  if (contextBarType === 'none') {
    return null
  }

  return (
    <>
      {contextBarType === 'shape' && <ShapeContextBar />}
      {contextBarType === 'text' && <TextContextBar />}
    </>
  )
}
