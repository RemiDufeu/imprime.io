import type { ReactNode } from 'react'
import { Button, InputNumber, Popover, Tooltip } from 'antd'
import './SidesInput.css'

interface SidesInputProps<K extends string> {
  value: Record<K, number>
  // The four values, as the popover lays them out: two by two.
  fields: { key: K; label: string }[]
  onChange: (value: Record<K, number>) => void
  // The button that opens the four values, and what it is called.
  icon: ReactNode
  title: string
  max?: number
}

// Four lengths edited as one — the field sets all four, and shows them while
// they agree — or one by one in a popover: a box's sides or corners.
export function SidesInput<K extends string>({ value, fields, onChange, icon, title, max }: SidesInputProps<K>) {
  const first = value[fields[0].key]
  const uniform = fields.every(field => value[field.key] === first)

  const set = (keys: K[], length: number) => {
    const next = { ...value }
    for (const key of keys) next[key] = length
    onChange(next)
  }

  return (
    <div className="sides-input">
      <InputNumber
        min={0}
        max={max}
        value={uniform ? first : null}
        placeholder="Mixed"
        onChange={(length: number | null) => { if (length !== null) set(fields.map(field => field.key), length) }}
        size="small"
        style={{ width: '60px' }}
      />
      <Popover
        trigger="click"
        title={title}
        content={
          <div className="sides-input-grid">
            {fields.map(field => (
              <label key={field.key} className="sides-input-field">
                {field.label}
                <InputNumber
                  min={0}
                  max={max}
                  value={value[field.key]}
                  onChange={(length: number | null) => set([field.key], length ?? 0)}
                  size="small"
                  style={{ width: '60px' }}
                />
              </label>
            ))}
          </div>
        }
      >
        <Tooltip title={title}>
          <Button size="small" type={uniform ? 'text' : 'default'} icon={icon} />
        </Tooltip>
      </Popover>
    </div>
  )
}
