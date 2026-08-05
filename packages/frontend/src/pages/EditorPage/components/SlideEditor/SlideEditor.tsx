import { useState } from 'react'
import LayeringToolbar from '../LayeringToolbar/LayeringToolbar'
import { CanvasArea } from './CanvasArea/CanvasArea'
import { TopBar } from './TopBar/TopBar'
import { FloatingPanels } from './FloatingPanels/FloatingPanels'
import { useCurrentSlide } from '../../../../store/editor/EditorStore'
import './toolbars.css'
import './SlideEditor.css'

export default function SlideEditor() {
  const currentSlide = useCurrentSlide()
  const [slidesOpen, setSlidesOpen] = useState(false)
  const [layersOpen, setLayersOpen] = useState(false)

  if (!currentSlide) {
    return null
  }

  return (
    <div className='editor-container'>
      <CanvasArea slide={currentSlide} />

      <div className='actions-layer'>
        <TopBar
          slidesOpen={slidesOpen}
          onToggleSlides={() => setSlidesOpen(v => !v)}
          layersOpen={layersOpen}
          onToggleLayers={() => setLayersOpen(v => !v)}
        />
        <FloatingPanels slidesOpen={slidesOpen} layersOpen={layersOpen} />
      </div>

      <LayeringToolbar />
    </div>
  )
}
