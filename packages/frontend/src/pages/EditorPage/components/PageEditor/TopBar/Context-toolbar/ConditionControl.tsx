import type { MenuProps } from 'antd'
import { EyeOutlined } from '@ant-design/icons'
import type { Shape } from '@imprime/sdk'
import { useCurrentPage, useEditorStore } from '../../../../../../store/editor/EditorStore'
import {
  decodeItemFieldValue,
  encodeItemFieldValue,
  itemFieldsInScope,
  variableReferenceLabel,
} from '../../../../../../utils/variableScope'
import { BindingButton } from './BindingButton/BindingButton'

// Menu keys besides the variables'. An encoded variable always holds '::', so
// none of these can be one.
const ALWAYS = '__always__'
const WHEN_TRUE = '__when-true__'
const WHEN_FALSE = '__when-false__'
const NONE = '__none__'

// Whether a shape shows in the export: always, or only while a boolean variable
// — or a boolean field of the item a repeat around it iterates, its own repeat
// included — is true, or false. Every shape bar ends with it.
export function ConditionControl({ shape }: { shape: Shape }) {
  const updateShape = useEditorStore(state => state.updateShape)
  const variables = useEditorStore(state => state.template?.variableData) ?? []
  const currentPage = useCurrentPage()

  const condition = shape.visibleWhen
  const templateVariables = variables
    .filter(v => v.type === 'boolean')
    .map(v => ({ key: encodeItemFieldValue(v._id, ''), label: v.name }))
  const itemFields = itemFieldsInScope(currentPage?.shapes ?? [], shape.id, variables, 'boolean', true)
    .map(option => ({ key: encodeItemFieldValue(option.variableId, option.itemPath), label: option.label }))

  const items: MenuProps['items'] = [
    { key: ALWAYS, label: 'Always' },
    { type: 'divider' },
    ...(templateVariables.length === 0 && itemFields.length === 0
      ? [{ key: NONE, label: 'No boolean variables or item fields', disabled: true }]
      : []),
    ...(templateVariables.length > 0 ? [{ type: 'group' as const, label: 'Variables', children: templateVariables }] : []),
    ...(itemFields.length > 0 ? [{ type: 'group' as const, label: 'Item fields', children: itemFields }] : []),
    ...(condition
      ? [
          { type: 'divider' as const },
          { key: WHEN_TRUE, label: 'When true' },
          { key: WHEN_FALSE, label: 'When false' },
        ]
      : []),
  ]

  // '' encodes "the variable itself", which is `itemPath` left unset.
  const selectedKeys = condition
    ? [
        ...(condition.variableId ? [encodeItemFieldValue(condition.variableId, condition.itemPath ?? '')] : []),
        condition.negate ? WHEN_FALSE : WHEN_TRUE,
      ]
    : [ALWAYS]

  const handleSelect = (key: string) => {
    if (key === NONE) return
    if (key === ALWAYS) {
      updateShape(shape.id, { visibleWhen: undefined })
      return
    }
    if (key === WHEN_TRUE || key === WHEN_FALSE) {
      if (condition) updateShape(shape.id, { visibleWhen: { ...condition, negate: key === WHEN_FALSE || undefined } })
      return
    }
    const decoded = decodeItemFieldValue(key)
    if (!decoded) return
    updateShape(shape.id, {
      visibleWhen: {
        variableId: decoded.variableId,
        itemPath: decoded.itemPath === '' ? undefined : decoded.itemPath,
        negate: condition?.negate,
      },
    })
  }

  // A condition without a variable is one a paste could not rebind: the shape
  // never shows until one is picked or the condition cleared.
  let binding: string | undefined
  if (condition) {
    const name = condition.variableId
      ? variableReferenceLabel(variables, condition.variableId, condition.itemPath) ?? 'unknown variable'
      : 'missing variable'
    binding = condition.negate ? `not ${name}` : name
  }

  return (
    <div className="toolbar-item">
      <BindingButton
        icon={<EyeOutlined />}
        label="Show"
        binding={binding}
        title={binding === undefined ? 'Always shown — choose a condition' : `Shown only when ${binding}`}
        items={items}
        selectedKeys={selectedKeys}
        onSelect={handleSelect}
        broken={condition !== undefined && !condition.variableId}
      />
    </div>
  )
}
