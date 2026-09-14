import { useEditorStore } from '../../../../../../store/editor/EditorStore'
import { ShapeContextBar } from './ShapeContextBar'
import { TextContextBar } from './TextContextBar'
import { GroupContextBar } from './GroupContextBar'
import { IfGroupContextBar } from './IfGroupContextBar'
import { ForGroupContextBar } from './ForGroupContextBar'

export function ContextToolbar() {
  const contextBarType = useEditorStore(state => state.contextBarType)

  if (contextBarType === 'none') {
    return null
  }

  return (
    <>
      {contextBarType === 'shape' && <ShapeContextBar />}
      {contextBarType === 'text' && <TextContextBar />}
      {contextBarType === 'group' && <GroupContextBar />}
      {contextBarType === 'if-group' && <IfGroupContextBar />}
      {contextBarType === 'for-group' && <ForGroupContextBar />}
    </>
  )
}
