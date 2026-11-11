import { Button, Tooltip } from 'antd'
import { ShrinkOutlined } from '@ant-design/icons'
import type { GroupShape, Shape } from '@imprime/sdk'
import { getGrow, getImposedAxes } from '@imprime/sdk'
import { useEditorStore } from '../../../../../../../store/editor/EditorStore'
import { findShapeById } from '../../../../../../../utils/shapeTree'

// Whether a row's width — a column's height — follows its children. A size
// the parent imposes wins: under `stretch` there is nothing to choose, and
// hugging and flex on one axis exclude each other, the last one set winning.
export function HugControl({ group, shapes }: { group: GroupShape; shapes: Shape[] }) {
  const updateShape = useEditorStore(state => state.updateShape)

  const axis = group.layout === 'horizontal' ? 'width' : 'height'
  const what = group.layout === 'horizontal' ? "row's width" : "column's height"
  const parentId = findShapeById(shapes, group.id)?.parentGroupId ?? null
  const parent = parentId !== null ? findShapeById(shapes, parentId)?.shape : undefined
  const parentMain = parent?.type === 'group' && parent.layout === 'horizontal' ? 'width'
    : parent?.type === 'group' && parent.layout === 'vertical' ? 'height'
    : null
  const growsAlong = parentMain === axis && getGrow(group) > 0
  const stretched = parent?.type === 'group' && getImposedAxes(parent, group)[axis] && !growsAlong

  const hugging = group.hug === true && !stretched
  let title = `Hug: the ${what} follows its children — it grows with its copies and closes up over hidden ones.`
  if (stretched) title = `Hug: off, its parent stretches it — its ${axis} is the parent's.`
  else if (growsAlong) title += ' Replaces its Flex.'

  return (
    <Tooltip title={title}>
      <Button
        aria-label={title}
        size="small"
        type={hugging ? 'primary' : 'text'}
        icon={<ShrinkOutlined />}
        disabled={stretched}
        onClick={() => updateShape(group.id, hugging
          ? { hug: false }
          : { hug: true, ...(growsAlong ? { grow: undefined } : {}) })}
      />
    </Tooltip>
  )
}
