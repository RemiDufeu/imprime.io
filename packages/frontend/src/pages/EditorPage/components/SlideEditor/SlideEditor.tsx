import LayeringToolbar from '../LayeringToolbar/LayeringToolbar'
import { CanvasArea } from './CanvasArea/CanvasArea'
import { TopBar } from './TopBar/TopBar'
import { FloatingPanels } from './FloatingPanels/FloatingPanels'
import { useCurrentSlide, useEditorStore } from '../../../../store/editor/EditorStore'
import './Toolbars.css'
import './SlideEditor.css'

export default function SlideEditor() {
  const currentSlide = useCurrentSlide()
  const slidesOpen = useEditorStore(state => state.slidesPanelOpen)
  const layersOpen = useEditorStore(state => state.layersPanelOpen)
  const setSlidesOpen = useEditorStore(state => state.setSlidesPanelOpen)
  const setLayersOpen = useEditorStore(state => state.setLayersPanelOpen)

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
