import { Button } from 'antd'
import { DownOutlined } from '@ant-design/icons'
import './DropdownTrigger.css'

interface DropdownTriggerProps {
  label: string
  open: boolean
  onClick: () => void
  alignEnd?: boolean
}

export function DropdownTrigger({ label, open, onClick, alignEnd }: DropdownTriggerProps) {
  return (
    <div className={`dropdown-menu ${alignEnd ? 'dropdown-menu-end' : ''}`}>
      <Button className="dropdown-menu-trigger" onClick={onClick}>
        <span className="dropdown-menu-trigger-inner">
          {label}
          <DownOutlined className={`dropdown-menu-chevron ${open ? 'open' : ''}`} />
        </span>
      </Button>
    </div>
  )
}
