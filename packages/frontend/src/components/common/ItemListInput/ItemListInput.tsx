import type { VariableItem, VariableItemField } from '@imprime/sdk'
import { ItemListEditor } from './ItemListEditor'
import './ItemListInput.css'

interface ItemListInputProps {
  // antd Form control contract: the form owns the value.
  value?: VariableItem[]
  onChange?: (value: VariableItem[] | undefined) => void
  // Declared item schema: the columns. Data the schema does not declare is
  // kept as it is, not shown — the fields a template declares and the data an
  // integration sends drift on their own schedules.
  itemFields?: VariableItemField[]
  disabled?: boolean
  // How large a vector image picked for an image field is redrawn.
  vectorSize?: number
}

/**
 * A list variable's value — its default, or the one an export is given — as
 * a table of its items, nested lists included.
 */
export function ItemListInput({ value, onChange, itemFields, disabled, vectorSize }: ItemListInputProps) {
  return (
    <div className="item-list-input">
      <ItemListEditor
        items={value ?? []}
        fields={itemFields ?? []}
        disabled={disabled}
        vectorSize={vectorSize}
        // An emptied list is no value, as a cleared field is: the default then
        // applies, and a required variable is reported missing.
        onChange={items => onChange?.(items.length > 0 ? items : undefined)}
      />
    </div>
  )
}
