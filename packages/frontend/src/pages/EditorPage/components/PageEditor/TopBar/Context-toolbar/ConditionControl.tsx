import { EyeOutlined } from '@ant-design/icons'
import type { Shape } from '@imprime/sdk'
import { useCurrentPage, useEditorStore } from '../../../../../../store/editor/EditorStore'
import { conditionMenu } from '../../../../../../utils/bindingMenus'
import { itemFieldsInScope } from '../../../../../../utils/variableScope'
import { BindingButton } from './BindingButton/BindingButton'

// Whether a shape shows in the export: always, or only while a boolean variable
// — or a boolean field of the item a repeat around it iterates, its own repeat
// included — is true, or false. Every shape bar ends with it.
export function ConditionControl({ shape }: { shape: Shape }) {
  const updateShape = useEditorStore(state => state.updateShape)
  const variables = useEditorStore(state => state.template?.variableData) ?? []
  const currentPage = useCurrentPage()

  const condition = shape.visibleWhen
  const itemFields = itemFieldsInScope(currentPage, shape.id, variables, 'boolean', true)
  const menu = conditionMenu(condition, variables, itemFields)

  const handleSelect = (key: string) => {
    const picked = menu.pick(key)
    if (picked) updateShape(shape.id, { visibleWhen: picked.value })
  }

  return (
    <div className="toolbar-item">
      <BindingButton
        icon={<EyeOutlined />}
        label="Show"
        binding={menu.binding}
        title={menu.binding === undefined ? 'Always shown — choose a condition' : `Shown only when ${menu.binding}`}
        items={menu.items}
        selectedKeys={menu.selectedKeys}
        onSelect={handleSelect}
        broken={condition !== undefined && !condition.variableId}
      />
    </div>
  )
}
