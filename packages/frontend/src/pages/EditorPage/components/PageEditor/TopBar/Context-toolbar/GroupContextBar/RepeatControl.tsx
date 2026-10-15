import { Tooltip, type MenuProps } from 'antd'
import { InfoCircleOutlined, RetweetOutlined } from '@ant-design/icons'
import type { GroupShape } from '@imprime/sdk'
import { useCurrentPage, useEditorStore } from '../../../../../../../store/editor/EditorStore'
import { findShapeById } from '../../../../../../../utils/shapeTree'
import {
  decodeItemFieldValue,
  encodeItemFieldValue,
  itemFieldsInScope,
  variableReferenceLabel,
} from '../../../../../../../utils/variableScope'
import { BindingButton } from '../BindingButton/BindingButton'

// Menu keys besides the lists'. An encoded variable always holds '::', so
// neither can be one.
const NO_REPEAT = '__no-repeat__'
const NO_LISTS = '__no-lists__'

// The list the group is repeated for: a list variable, or a list field of the
// item a repeat around it iterates — what makes nesting possible.
export function RepeatControl({ group }: { group: GroupShape }) {
  const updateShape = useEditorStore(state => state.updateShape)
  const variables = useEditorStore(state => state.template?.variableData) ?? []
  const currentPage = useCurrentPage()
  const shapes = currentPage?.shapes ?? []

  const lists = variables
    .filter(v => v.type === 'object-list')
    .map(v => ({ key: encodeItemFieldValue(v._id, ''), label: v.name }))
  const itemLists = itemFieldsInScope(shapes, group.id, variables, 'object-list')
    .map(option => ({ key: encodeItemFieldValue(option.variableId, option.itemPath), label: option.label }))

  const items: MenuProps['items'] = [
    { key: NO_REPEAT, label: 'No repeat' },
    { type: 'divider' },
    ...(lists.length === 0 && itemLists.length === 0
      ? [{ key: NO_LISTS, label: 'No list variables', disabled: true }]
      : []),
    ...(lists.length > 0 ? [{ type: 'group' as const, label: 'Lists', children: lists }] : []),
    ...(itemLists.length > 0 ? [{ type: 'group' as const, label: 'Item lists', children: itemLists }] : []),
  ]

  // '' encodes "the variable itself", which is `itemPath` left unset.
  let selectedKeys = [NO_REPEAT]
  if (group.repeat) {
    selectedKeys = group.repeat.variableId
      ? [encodeItemFieldValue(group.repeat.variableId, group.repeat.itemPath ?? '')]
      : []
  }

  // 'No repeat' makes the group a plain group again.
  const handleSelect = (key: string) => {
    if (key === NO_LISTS) return
    const decoded = key === NO_REPEAT ? undefined : decodeItemFieldValue(key)
    updateShape(group.id, {
      repeat: decoded && {
        variableId: decoded.variableId,
        itemPath: decoded.itemPath === '' ? undefined : decoded.itemPath,
      },
    })
  }

  // A repeat a paste could not rebind has no list: it draws no copy until one
  // is picked.
  let binding: string | undefined
  if (group.repeat) {
    binding = group.repeat.variableId
      ? variableReferenceLabel(variables, group.repeat.variableId, group.repeat.itemPath) ?? 'unknown list'
      : 'pick a list'
  }

  const parentId = findShapeById(shapes, group.id)?.parentGroupId ?? null
  const parent = parentId !== null ? findShapeById(shapes, parentId)?.shape : undefined
  const freeFormParent = parent?.type !== 'group' || (parent.layout ?? 'none') === 'none'

  return (
    <div className="toolbar-item">
      <BindingButton
        icon={<RetweetOutlined />}
        label="Repeat"
        binding={binding}
        title={binding === undefined ? 'Not repeated — choose a list' : `Repeated for each item of ${binding}`}
        items={items}
        selectedKeys={selectedKeys}
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
