import { Input, Typography } from 'antd'
import { useEffect, useState } from 'react'
import type { VariableItem, VariableItemField } from '@imprime/sdk'
import './ItemListInput.css'

interface ItemListInputProps {
  // antd Form control contract: the form owns the parsed value.
  value?: VariableItem[]
  onChange?: (value: VariableItem[] | undefined) => void
  // Declared item schema, shown as a hint. Not enforced — the fields a
  // presentation declares and the data an integration sends drift on their own
  // schedules, and the renderer already degrades gracefully on a missing field.
  itemFields?: VariableItemField[]
  disabled?: boolean
}

function describeFields(fields: VariableItemField[] | undefined): string {
  if (!fields || fields.length === 0) return 'No fields declared yet'
  return fields.map(f => `${f.name}: ${f.type}`).join(', ')
}

/**
 * JSON entry for a list of objects. Deliberately not a row editor: nested lists
 * make that a tree of dynamic forms, and this value is test data that gets
 * pasted far more often than it gets typed field by field.
 */
export function ItemListInput({ value, onChange, itemFields, disabled }: ItemListInputProps) {
  // The raw text is local so a half-typed document stays on screen. `value` is
  // only written back when the text parses.
  const [text, setText] = useState(() => (value === undefined ? '' : JSON.stringify(value, null, 2)))
  const [error, setError] = useState<string | undefined>()

  // The form clears the value when the variable is switched to required, and
  // the stale text would otherwise stay on screen contradicting it.
  useEffect(() => {
    if (value === undefined) {
      setText('')
      setError(undefined)
    }
  }, [value])

  const handleChange = (next: string) => {
    setText(next)

    if (next.trim() === '') {
      setError(undefined)
      onChange?.(undefined)
      return
    }

    try {
      const parsed: unknown = JSON.parse(next)
      if (!Array.isArray(parsed)) {
        setError('Expected a JSON array of objects')
        return
      }
      if (parsed.some(item => item === null || typeof item !== 'object' || Array.isArray(item))) {
        setError('Every element must be an object')
        return
      }
      setError(undefined)
      onChange?.(parsed as VariableItem[])
    } catch {
      setError('Invalid JSON')
    }
  }

  return (
    <div className="item-list-input">
      <Input.TextArea
        value={text}
        onChange={e => handleChange(e.target.value)}
        disabled={disabled}
        autoSize={{ minRows: 4, maxRows: 12 }}
        placeholder={'[\n  { "name": "Pikachu" }\n]'}
        status={error ? 'error' : undefined}
      />
      <Typography.Text type={error ? 'danger' : 'secondary'} className="item-list-hint">
        {error ?? describeFields(itemFields)}
      </Typography.Text>
    </div>
  )
}
