import { useRef } from 'react'
import LayeringToolbar from '../LayeringToolbar/LayeringToolbar'
import { CanvasArea } from './CanvasArea/CanvasArea'
import { TopBar } from './TopBar/TopBar'
import { FloatingPanels } from './FloatingPanels/FloatingPanels'
import EditorHeader from '../../../Layout/EditorHeader'
import UserMenu from '../../../Layout/UserMenu'
import { useCurrentPage, useEditorStore } from '../../../../store/editor/EditorStore'
import { useEditorShortcuts } from './useEditorShortcuts'
import './Toolbars.css'
import './PageEditor.css'

export default function PageEditor() {
  const currentPage = useCurrentPage()
  const pagesOpen = useEditorStore(state => state.pagesPanelOpen)
  const layersOpen = useEditorStore(state => state.layersPanelOpen)
  const setPagesOpen = useEditorStore(state => state.setPagesPanelOpen)
  const setLayersOpen = useEditorStore(state => state.setLayersPanelOpen)
  const containerRef = useRef<HTMLDivElement>(null)

  useEditorShortcuts(containerRef)

  if (!currentPage) {
    return null
  }

  return (
    <div className='editor-container' ref={containerRef}>
      <CanvasArea page={currentPage} />

      <div className='actions-layer'>
        <div className='editor-header-row'>
          <EditorHeader />
          <UserMenu />
        </div>
        <TopBar
          pagesOpen={pagesOpen}
          onTogglePages={() => setPagesOpen(v => !v)}
          layersOpen={layersOpen}
          onToggleLayers={() => setLayersOpen(v => !v)}
        />
        <FloatingPanels pagesOpen={pagesOpen} layersOpen={layersOpen} />
      </div>

      <LayeringToolbar />
    </div>
  )
}
