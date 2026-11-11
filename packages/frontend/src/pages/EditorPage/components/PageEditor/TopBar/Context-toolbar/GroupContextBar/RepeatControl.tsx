import { Tooltip } from 'antd'
import { InfoCircleOutlined, RetweetOutlined } from '@ant-design/icons'
import type { GroupShape } from '@imprime/sdk'
import { useCurrentPage, useEditorStore } from '../../../../../../../store/editor/EditorStore'
import { findShapeById } from '../../../../../../../utils/shapeTree'
import { repeatMenu } from '../../../../../../../utils/bindingMenus'
import { itemFieldsInScope } from '../../../../../../../utils/variableScope'
import { BindingButton } from '../BindingButton/BindingButton'

// The list the group is repeated for: a list variable, or a list field of the
// item a repeat around it iterates — the page's included — what makes nesting
// possible.
export function RepeatControl({ group }: { group: GroupShape }) {
  const updateShape = useEditorStore(state => state.updateShape)
  const variables = useEditorStore(state => state.template?.variableData) ?? []
  const currentPage = useCurrentPage()
  const shapes = currentPage?.shapes ?? []

  const itemLists = itemFieldsInScope(currentPage, group.id, variables, 'object-list')
  const menu = repeatMenu(group.repeat, variables, itemLists)

  // 'No repeat' makes the group a plain group again.
  const handleSelect = (key: string) => {
    const picked = menu.pick(key)
    if (picked) updateShape(group.id, { repeat: picked.value })
  }

  const parentId = findShapeById(shapes, group.id)?.parentGroupId ?? null
  const parent = parentId !== null ? findShapeById(shapes, parentId)?.shape : undefined
  const freeFormParent = parent?.type !== 'group' || (parent.layout ?? 'none') === 'none'

  return (
    <div className="toolbar-item">
      <BindingButton
        icon={<RetweetOutlined />}
        label="Repeat"
        binding={menu.binding}
        title={menu.binding === undefined ? 'Not repeated — choose a list' : `Repeated for each item of ${menu.binding}`}
        items={menu.items}
        selectedKeys={menu.selectedKeys}
        onSelect={handleSelect}
      />
      {group.repeat && freeFormParent && (
        <Tooltip title="Its parent has no layout: the copies are stacked downwards, touching. Put the group in a column to space them, or give it a padding.">
          <InfoCircleOutlined style={{ color: 'var(--ant-color-text-tertiary)' }} />
        </Tooltip>
      )}
    </div>
  )
}
