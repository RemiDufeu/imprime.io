import { useEditorStore } from '../../../../../../store/editor/EditorStore'
import { selectContextBar } from '../../../../../../store/editor/selectors'
import { ShapeContextBar } from './ShapeContextBar'
import { TextContextBar } from './TextContextBar'
import { ImageContextBar } from './ImageContextBar/ImageContextBar'
import { GroupContextBar } from './GroupContextBar'
import { IfGroupContextBar } from './IfGroupContextBar'
import { ForGroupContextBar } from './ForGroupContextBar'

export function ContextToolbar() {
  const contextBarType = useEditorStore(selectContextBar)

  if (contextBarType === 'none') {
    return null
  }

  return (
    <>
      {contextBarType === 'shape' && <ShapeContextBar />}
      {contextBarType === 'text' && <TextContextBar />}
      {contextBarType === 'image' && <ImageContextBar />}
      {contextBarType === 'group' && <GroupContextBar />}
      {contextBarType === 'if-group' && <IfGroupContextBar />}
      {contextBarType === 'for-group' && <ForGroupContextBar />}
    </>
  )
}
