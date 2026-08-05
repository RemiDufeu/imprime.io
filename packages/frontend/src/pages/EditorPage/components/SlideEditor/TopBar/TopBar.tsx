import Toolbar from './Toolbar/Toolbar'
import { ContextToolbar } from './Context-toolbar'
import { DropdownTrigger } from './DropdownTrigger/DropdownTrigger'
import './TopBar.css'

interface TopBarProps {
  slidesOpen: boolean
  onToggleSlides: () => void
  layersOpen: boolean
  onToggleLayers: () => void
}

export function TopBar({ slidesOpen, onToggleSlides, layersOpen, onToggleLayers }: TopBarProps) {
  return (
    <div className='top-bar-actions'>
      <DropdownTrigger label="Slides" open={slidesOpen} onClick={onToggleSlides} />

      <div className='toolbars'>
        <Toolbar />
        <ContextToolbar />
      </div>

      <DropdownTrigger label="Shape tree" open={layersOpen} onClick={onToggleLayers} alignEnd />
    </div>
  )
}
