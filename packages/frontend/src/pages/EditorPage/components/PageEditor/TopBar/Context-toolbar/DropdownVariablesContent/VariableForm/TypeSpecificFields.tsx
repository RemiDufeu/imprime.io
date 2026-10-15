import { Form, InputNumber } from 'antd'
import type { VariableItemField, VariableType } from '@imprime/sdk'
import { ItemFieldsEditor, ITEM_FIELD_NAME_PATTERN } from './ItemFieldsEditor'

// Why the declared fields cannot be saved yet, or null when they can: every
// list, nested ones included, declares at least one field, and every field a
// usable name — the name is half of the path a text run stores.
function itemFieldsProblem(fields: VariableItemField[] | undefined, listName?: string): string | null {
  if (!fields || fields.length === 0) {
    return listName === undefined ? 'Declare at least one field' : `Declare at least one field in ${listName}`
  }
  for (const field of fields) {
    if (!ITEM_FIELD_NAME_PATTERN.test(field.name)) return 'Every field needs a name of letters, digits or underscore'
    if (field.type === 'object-list') {
      const nested = itemFieldsProblem(field.itemFields, field.name)
      if (nested !== null) return nested
    }
  }
  return null
}

// The settings only one type has: a string's length limit, a list's item limit
// and the fields its items carry.
export function TypeSpecificFields({ type }: { type: VariableType }) {
  if (type === 'string') {
    return (
      <Form.Item
        label="Max Length"
        name="maxLength"
        tooltip="Most characters a value may have, so the template can be designed for the longest one. A longer value fails the export."
      >
        <InputNumber min={1} precision={0} placeholder="Unlimited" />
      </Form.Item>
    )
  }

  if (type === 'object-list') {
    return (
      <>
        <Form.Item
          label="Max Items"
          name="maxItems"
          tooltip="Most items a list may have, so the template can be designed for the longest one. A longer list fails the export."
        >
          <InputNumber min={1} precision={0} placeholder="Unlimited" />
        </Form.Item>

        <Form.Item
          label="Item Fields"
          name="itemFields"
          tooltip="Declared once, then offered by the pickers inside a for group"
          rules={[
            {
              validator: (_, value: VariableItemField[] | undefined) => {
                const problem = itemFieldsProblem(value)
                return problem === null ? Promise.resolve() : Promise.reject(new Error(problem))
              },
            },
          ]}
        >
          <ItemFieldsEditor />
        </Form.Item>
      </>
    )
  }

  return null
}
