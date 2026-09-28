import { Button, Input, Select } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import type { VariableItemField, VariableType } from '@imprime/sdk'
import './ItemFieldsEditor.css'

const FIELD_TYPE_OPTIONS: { value: VariableType; label: string }[] = [
  { value: 'string', label: 'String' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'object-list', label: 'List' },
]

// Item field names travel inside a dotted path, so a dot would make the path
// ambiguous. Same character set as variable names, for the same reason.
export const ITEM_FIELD_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/

interface ItemFieldsEditorProps {
  // antd Form control contract: the form owns the value and feeds it back in.
  value?: VariableItemField[]
  onChange?: (value: VariableItemField[]) => void
  // Nesting depth, used only to indent. A `List` field declares its own item
  // fields, which is what lets a for-group nest on it.
  depth?: number
}

export function ItemFieldsEditor({ value, onChange, depth = 0 }: ItemFieldsEditorProps) {
  const fields = value ?? []

  const replaceAt = (index: number, field: VariableItemField) => {
    onChange?.(fields.map((f, i) => (i === index ? field : f)))
  }

  const addField = () => onChange?.([...fields, { name: '', type: 'string' }])
  const removeAt = (index: number) => onChange?.(fields.filter((_, i) => i !== index))

  return (
    <div className="item-fields-editor" data-depth={depth}>
      {fields.map((field, index) => (
        <div key={index} className="item-field-row-group">
          <div className="item-field-row">
            <Input
              size="small"
              placeholder="field name"
              value={field.name}
              status={field.name !== '' && !ITEM_FIELD_NAME_PATTERN.test(field.name) ? 'error' : undefined}
              onChange={e => replaceAt(index, { ...field, name: e.target.value })}
            />
            <Select<VariableType>
              size="small"
              className="item-field-type"
              value={field.type}
              options={FIELD_TYPE_OPTIONS}
              onChange={type =>
                // Dropping itemFields on a type change keeps the declaration
                // honest: only a list has item fields.
                replaceAt(index, { name: field.name, type })
              }
            />
            <Button
              size="small"
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => removeAt(index)}
            />
          </div>
          {field.type === 'object-list' && (
            <ItemFieldsEditor
              value={field.itemFields}
              onChange={itemFields => replaceAt(index, { ...field, itemFields })}
              depth={depth + 1}
            />
          )}
        </div>
      ))}
      <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={addField} block>
        Add field
      </Button>
    </div>
  )
}
