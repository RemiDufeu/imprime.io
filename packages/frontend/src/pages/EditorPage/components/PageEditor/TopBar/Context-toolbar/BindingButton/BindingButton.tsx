import type { ReactNode } from 'react'
import { Button, Dropdown, Tooltip, type MenuProps } from 'antd'
import './BindingButton.css'

interface BindingButtonProps {
  icon: ReactNode
  // What the binding does: 'Show', 'Repeat'. Shown once bound; until then the
  // icon alone stands for it, and `title` says what it does.
  label: string
  // What it is bound to, shown after the label. Unset while unbound.
  binding?: string
  title: string
  items: MenuProps['items']
  selectedKeys: string[]
  onSelect: (key: string) => void
  // A binding that lost its variable, and so never shows anything.
  broken?: boolean
}

// How the data drives the selected shape, in the style of the text bar's
// Variable button: the label, then what it is bound to; the menu picks it.
export function BindingButton({
  icon, label, binding, title, items, selectedKeys, onSelect, broken = false,
}: BindingButtonProps) {
  return (
    <Dropdown
      trigger={['click']}
      placement="bottomLeft"
      menu={{
        items,
        selectable: true,
        selectedKeys,
        onClick: ({ key }) => onSelect(key),
        style: { maxHeight: 320, overflowY: 'auto' },
      }}
    >
      <Tooltip title={title}>
        <Button
          color={broken ? 'danger' : 'primary'}
          variant="filled"
          size="small"
          icon={icon}
          // Unbound, the icon alone shows: the label still names the button.
          aria-label={binding === undefined ? label : undefined}
        >
          {binding !== undefined && <span className="binding-button-label">{`${label}: ${binding}`}</span>}
        </Button>
      </Tooltip>
    </Dropdown>
  )
}
