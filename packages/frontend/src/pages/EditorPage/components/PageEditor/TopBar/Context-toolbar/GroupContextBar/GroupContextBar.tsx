import { Divider } from 'antd'
import { useEditorStore } from '../../../../../../../store/editor/EditorStore'
import { selectSelectedShape } from '../../../../../../../store/editor/selectors'
import { ConditionControl } from '../ConditionControl'
import { FlexControl } from '../FlexControl'
import { RepeatControl } from './RepeatControl'
import { LayoutControls } from './LayoutControls'
import { BoxControls } from './BoxControls'

// The selected group: what it repeats, how it lays its children out, the box
// it paints, and when it shows.
export function GroupContextBar() {
  const group = useEditorStore(selectSelectedShape)

  if (group?.type !== 'group') return null

  return (
    <div className="toolbar-container context-toolbar">
      <RepeatControl group={group} />
      <Divider type="vertical" style={{ height: '24px' }} />
      <LayoutControls group={group} />
      <Divider type="vertical" style={{ height: '24px' }} />
      <BoxControls group={group} />
      <Divider type="vertical" style={{ height: '24px' }} />
      <FlexControl shape={group} />
      <ConditionControl shape={group} />
    </div>
  )
}
