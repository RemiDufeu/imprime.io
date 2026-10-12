import { Fragment, useState } from 'react'
import { Button, Input, Switch, Typography } from 'antd'
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CaretDownOutlined,
  CaretRightOutlined,
  CopyOutlined,
  DeleteOutlined,
  PlusOutlined,
} from '@ant-design/icons'
import type { VariableItem, VariableItemField, VariableItemValue, VariableType } from '@imprime/sdk'
import { ImageValueInput } from '../ImageValueInput/ImageValueInput'

// A Record, so the next VariableType member fails to compile here.
const TYPE_HINT: Record<VariableType, string> = {
  'string': 'text',
  'boolean': 'yes / no',
  'image': 'image',
  'object-list': 'list',
}

// A new item: every declared field present and empty, so the row reads as the
// schema does. An image is left out: no image is not a value.
function emptyItem(fields: VariableItemField[]): VariableItem {
  const item: VariableItem = {}
  for (const field of fields) {
    if (field.type === 'string') item[field.name] = ''
    else if (field.type === 'boolean') item[field.name] = false
    else if (field.type === 'object-list') item[field.name] = []
  }
  return item
}

// `item` with field `name` set to `value`, or without it for undefined. Fields
// the schema does not declare are kept: written before a field was renamed, or
// sent by an integration, they are not this editor's to drop.
function withField(item: VariableItem, name: string, value: VariableItemValue | undefined): VariableItem {
  const next = { ...item }
  if (value === undefined) delete next[name]
  else next[name] = value
  return next
}

interface ItemListEditorProps {
  items: VariableItem[]
  fields: VariableItemField[]
  onChange: (items: VariableItem[]) => void
  disabled?: boolean
  // How large a vector image picked for an image field is redrawn.
  vectorSize?: number
}

/**
 * A list of objects as a table: one row per item, one column per declared
 * field, edited by its type. A list field opens, under its row, as a table of
 * its own — the same editor, one level down.
 */
export function ItemListEditor({ items, fields, onChange, disabled, vectorSize }: ItemListEditorProps) {
  // The list fields shown open, as `${itemIndex}:${fieldName}`.
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())

  if (fields.length === 0) {
    return (
      <Typography.Text type="secondary" className="item-list-empty">
        No fields declared for these items yet
      </Typography.Text>
    )
  }

  const listFields = fields.filter(field => field.type === 'object-list')

  const replaceAt = (index: number, item: VariableItem) =>
    onChange(items.map((current, i) => (i === index ? item : current)))

  // The list rewritten as `order` says — each entry the old index of the item
  // now at that place — with open lists kept with their items.
  const rearrange = (order: number[]) => {
    onChange(order.map(old => items[old]))
    setOpen(previous => new Set(order.flatMap((old, index) =>
      listFields.filter(field => previous.has(`${old}:${field.name}`)).map(field => `${index}:${field.name}`)
    )))
  }
  const indices = items.map((_, index) => index)
  const swap = (a: number, b: number) =>
    rearrange(indices.map(index => (index === a ? b : index === b ? a : index)))

  const toggle = (key: string) =>
    setOpen(previous => {
      const next = new Set(previous)
      if (!next.delete(key)) next.add(key)
      return next
    })

  const renderCell = (item: VariableItem, index: number, field: VariableItemField) => {
    const value = item[field.name]
    switch (field.type) {
      case 'string':
        return (
          <Input
            size="small"
            value={typeof value === 'string' ? value : ''}
            disabled={disabled}
            onChange={e => replaceAt(index, withField(item, field.name, e.target.value))}
          />
        )
      case 'boolean':
        return (
          <Switch
            size="small"
            checked={value === true}
            disabled={disabled}
            onChange={checked => replaceAt(index, withField(item, field.name, checked))}
          />
        )
      case 'image':
        return (
          <ImageValueInput
            compact
            value={typeof value === 'string' ? value : undefined}
            disabled={disabled}
            vectorSize={vectorSize}
            onChange={next => replaceAt(index, withField(item, field.name, next))}
          />
        )
      case 'object-list': {
        const count = Array.isArray(value) ? value.length : 0
        const key = `${index}:${field.name}`
        return (
          <Button
            size="small"
            type="text"
            icon={open.has(key) ? <CaretDownOutlined /> : <CaretRightOutlined />}
            onClick={() => toggle(key)}
          >
            {count} item{count === 1 ? '' : 's'}
          </Button>
        )
      }
    }
  }

  return (
    <div className="item-list-editor">
      {items.length > 0 && (
        <div className="item-list-scroll">
          <table className="item-list-table">
            <thead>
              <tr>
                <th className="item-list-index">#</th>
                {fields.map(field => (
                  <th key={field.name}>
                    {field.name}
                    <span className="item-list-type">{TYPE_HINT[field.type]}</span>
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                // Items have no identity of their own: their place is their key.
                <Fragment key={index}>
                  <tr>
                    <td className="item-list-index">{index + 1}</td>
                    {fields.map(field => (
                      <td key={field.name}>{renderCell(item, index, field)}</td>
                    ))}
                    <td className="item-list-actions">
                      <Button
                        size="small"
                        type="text"
                        icon={<ArrowUpOutlined />}
                        title="Move up"
                        disabled={disabled || index === 0}
                        onClick={() => swap(index, index - 1)}
                      />
                      <Button
                        size="small"
                        type="text"
                        icon={<ArrowDownOutlined />}
                        title="Move down"
                        disabled={disabled || index === items.length - 1}
                        onClick={() => swap(index, index + 1)}
                      />
                      <Button
                        size="small"
                        type="text"
                        icon={<CopyOutlined />}
                        title="Duplicate"
                        disabled={disabled}
                        onClick={() => rearrange(indices.flatMap(i => (i === index ? [i, i] : [i])))}
                      />
                      <Button
                        size="small"
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        title="Remove"
                        disabled={disabled}
                        onClick={() => rearrange(indices.filter(i => i !== index))}
                      />
                    </td>
                  </tr>
                  {listFields
                    .filter(field => open.has(`${index}:${field.name}`))
                    .map(field => {
                      const nested = item[field.name]
                      return (
                        <tr key={field.name} className="item-list-nested">
                          <td />
                          <td colSpan={fields.length + 1}>
                            <div className="item-list-nested-label">{field.name}</div>
                            <ItemListEditor
                              items={Array.isArray(nested) ? nested : []}
                              fields={field.itemFields ?? []}
                              disabled={disabled}
                              vectorSize={vectorSize}
                              onChange={next => replaceAt(index, withField(item, field.name, next))}
                            />
                          </td>
                        </tr>
                      )
                    })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Button
        size="small"
        type="dashed"
        icon={<PlusOutlined />}
        block
        disabled={disabled}
        onClick={() => onChange([...items, emptyItem(fields)])}
      >
        Add item
      </Button>
    </div>
  )
}
