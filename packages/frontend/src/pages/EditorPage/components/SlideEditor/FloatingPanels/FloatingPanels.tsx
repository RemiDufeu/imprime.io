import { FloatingPanel } from './Panel/FloatingPanel'
import ShapeTreePanel from './ShapeTreePanel'
import SlideList from './SlideList'
import ZoomBar from './ZoomBar'
import './FloatingPanels.css'

interface FloatingPanelsProps {
  slidesOpen: boolean
  layersOpen: boolean
}

export function FloatingPanels({ slidesOpen, layersOpen }: FloatingPanelsProps) {
  return (
    <div className='floating-panels'>
      <FloatingPanel open={slidesOpen}>
        <SlideList />
      </FloatingPanel>

      <div className="centered-zoombar">
        <ZoomBar />
      </div>

      <FloatingPanel open={layersOpen}>
        <ShapeTreePanel />
      </FloatingPanel>
    </div>
  )
}
