import { Form, Input, Switch } from 'antd'
import type { VariableItemField, VariableType, VariableValueType } from '@imprime/sdk'
import { exceedsMaxLength } from '@imprime/sdk'
import { ImageValueInput, ItemListInput } from '../../../../../../../../components/common'
import { useEditorStore } from '../../../../../../../../store/editor/EditorStore'
import { selectPageSize } from '../../../../../../../../store/editor/selectors'
import { maxLengthCount } from '../../../../../../../../utils/maxLengthCount'
import { listValueRule } from '../../../../../../../../utils/listValueRule'

interface DefaultValueInputProps {
  type: VariableType
  // A required variable's default is cleared, and its input disabled.
  isRequired: boolean
  // The pending limits and item fields, as the form reads them back.
  maxLength: number | undefined
  maxItems: number | undefined
  itemFields: VariableItemField[] | undefined
}

// The default value's form field, shaped by the variable's type and kept
// within its declared limits.
export function DefaultValueInput({ type, isRequired, maxLength, maxItems, itemFields }: DefaultValueInputProps) {
  const pageSize = useEditorStore(selectPageSize)
  const vectorSize = Math.max(pageSize.width, pageSize.height)

  if (type === 'boolean') {
    return (
      <Form.Item
        label="Default Value"
        name="defaultValue"
        valuePropName="checked"
        tooltip={isRequired ? 'Disabled when variable is required' : undefined}
      >
        <Switch disabled={isRequired} />
      </Form.Item>
    )
  }
  if (type === 'object-list') {
    return (
      <Form.Item
        label="Default Value"
        name="defaultValue"
        tooltip={isRequired ? 'Disabled when variable is required' : 'One row per item, one column per field'}
        // Drawn when an export gives no list, so it keeps to the list's and
        // the fields' declarations, as the server checks when it is saved.
        // The input stops adding items at the limit; this catches a default
        // that was already longer when the limit was lowered.
        dependencies={['itemFields', 'maxItems']}
        rules={[listValueRule({ maxItems, itemFields }, 'default')]}
      >
        <ItemListInput disabled={isRequired} itemFields={itemFields} maxItems={maxItems} vectorSize={vectorSize} />
      </Form.Item>
    )
  }
  if (type === 'image') {
    return (
      <Form.Item
        label="Default Value"
        name="defaultValue"
        tooltip={
          isRequired
            ? 'Disabled when variable is required'
            : 'Drawn when an export gives none, and shown in the editor meanwhile'
        }
      >
        <ImageValueInput disabled={isRequired} vectorSize={vectorSize} />
      </Form.Item>
    )
  }
  return (
    <Form.Item
      label="Default Value"
      name="defaultValue"
      tooltip={isRequired ? 'Disabled when variable is required' : undefined}
      // The input cuts what is typed past the limit; this catches a default
      // that was already longer when the limit was lowered.
      dependencies={['maxLength']}
      rules={[
        {
          validator: (_, value: VariableValueType | undefined) =>
            exceedsMaxLength({ type: 'string', maxLength }, value)
              ? Promise.reject(new Error(`At most ${maxLength} characters`))
              : Promise.resolve(),
        },
      ]}
    >
      <Input placeholder="Optional" disabled={isRequired} count={maxLengthCount(maxLength)} />
    </Form.Item>
  )
}
