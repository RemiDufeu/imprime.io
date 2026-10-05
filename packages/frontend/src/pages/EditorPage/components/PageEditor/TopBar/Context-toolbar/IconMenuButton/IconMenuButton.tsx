import type { ReactNode } from 'react'
import { Button, Dropdown } from 'antd'
import { DownOutlined } from '@ant-design/icons'

export interface IconMenuOption<T extends string> {
  value: T
  icon: ReactNode
  title: string
}

interface IconMenuButtonProps<T extends string> {
  options: readonly IconMenuOption<T>[]
  value: T
  title: string
  onChange: (value: T) => void
}

// A toolbar button showing the active option's icon, opening a menu of all
// the options: one slot in the bar for what would otherwise be a row of
// toggle buttons. Neither the button nor the menu takes focus, so the text
// editor keeps its selection while an option is picked.
export function IconMenuButton<T extends string>({ options, value, title, onChange }: IconMenuButtonProps<T>) {
  const active = options.find(option => option.value === value) ?? options[0]

  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items: options.map(option => ({ key: option.value, icon: option.icon, label: option.title })),
        selectable: true,
        selectedKeys: [value],
        onClick: ({ key }) => {
          const picked = options.find(option => option.value === key)
          if (picked) onChange(picked.value)
        },
      }}
      popupRender={(menu) => <div onMouseDown={(e) => e.preventDefault()}>{menu}</div>}
    >
      <Button
        type="text"
        size="small"
        icon={active?.icon}
        title={title}
        onMouseDown={(e) => e.preventDefault()}
      >
        <DownOutlined className="toolbar-caret" />
      </Button>
    </Dropdown>
  )
}
