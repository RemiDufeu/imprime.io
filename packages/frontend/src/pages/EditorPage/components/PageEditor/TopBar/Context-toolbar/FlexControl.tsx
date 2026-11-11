import { InputNumber, Tooltip } from 'antd'
import type { Shape } from '@imprime/sdk'
import { getGrow, getHugAxis } from '@imprime/sdk'
import { useCurrentPage, useEditorStore } from '../../../../../../store/editor/EditorStore'
import { findShapeById } from '../../../../../../utils/shapeTree'

// How much of its row's — or column's — free space a shape takes: CSS's
// flex-grow. Only a child of a row or a column has any to take, so the control
// shows nowhere else; one that hugs its content has none to give, and the
// control is off there. Flex and a group's own hug on one axis exclude each
// other: setting one clears the other.
export function FlexControl({ shape }: { shape: Shape }) {
  const updateShape = useEditorStore(state => state.updateShape)
  const currentPage = useCurrentPage()

  const shapes = currentPage?.shapes ?? []
  const parentId = findShapeById(shapes, shape.id)?.parentGroupId ?? null
  const parent = parentId !== null ? findShapeById(shapes, parentId)?.shape : undefined
  if (parent?.type !== 'group' || (parent.layout !== 'horizontal' && parent.layout !== 'vertical')) return null

  const axis = parent.layout === 'horizontal' ? 'width' : 'height'
  const line = parent.layout === 'horizontal' ? 'row' : 'column'
  const grow = getGrow(shape)
  const parentHugs = getHugAxis(parent) === axis
  const hugsAlong = shape.type === 'group' && getHugAxis(shape) === axis

  let title = `Share of the free ${axis} of its ${line} — flex: 1. Empty keeps its own ${axis}.`
  if (parentHugs) title = `Its ${line} hugs its content: there is no free ${axis} to share.`
  else if (hugsAlong) title += ' Replaces its Hug.'

  return (
    <Tooltip title={title}>
      <div className="toolbar-item">
        <span className="toolbar-label">Flex</span>
        <InputNumber
          min={0}
          step={1}
          value={grow > 0 ? grow : null}
          placeholder="Fixed"
          disabled={parentHugs}
          // 0 or empty is a fixed size again: the shape keeps the one the
          // layout last gave it.
          onChange={(value: number | null) => {
            const next = value && value > 0 ? value : undefined
            updateShape(shape.id, next !== undefined && hugsAlong ? { grow: next, hug: false } : { grow: next })
          }}
          size="small"
          style={{ width: '64px' }}
        />
      </div>
    </Tooltip>
  )
}
