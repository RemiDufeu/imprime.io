import Toolbar from './Toolbar/Toolbar'
import { ContextToolbar } from './Context-toolbar'
import { DropdownTrigger } from './DropdownTrigger/DropdownTrigger'
import './TopBar.css'

interface TopBarProps {
  pagesOpen: boolean
  onTogglePages: () => void
  layersOpen: boolean
  onToggleLayers: () => void
}

export function TopBar({ pagesOpen, onTogglePages, layersOpen, onToggleLayers }: TopBarProps) {
  return (
    <div className='top-bar-actions'>
      <DropdownTrigger label="Pages" open={pagesOpen} onClick={onTogglePages} />

      <div className='toolbars'>
        <Toolbar />
        <ContextToolbar />
      </div>

      <DropdownTrigger label="Shape tree" open={layersOpen} onClick={onToggleLayers} alignEnd />
    </div>
  )
}
