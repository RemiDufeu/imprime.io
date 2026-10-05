import { FloatingPanel } from './Panel/FloatingPanel'
import ShapeTreePanel from './ShapeTreePanel/ShapeTreePanel'
import PageList from './PageList'
import ZoomBar from './ZoomBar'
import './FloatingPanels.css'

interface FloatingPanelsProps {
  pagesOpen: boolean
  layersOpen: boolean
}

export function FloatingPanels({ pagesOpen, layersOpen }: FloatingPanelsProps) {
  return (
    <div className='floating-panels'>
      <FloatingPanel open={pagesOpen}>
        <PageList />
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
