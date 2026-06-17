import { useRef, useEffect } from 'react'
import ZoomBar from './ZoomBar'
import { SlideCanvas } from '../../../../components/slide/SlideCanvas'
import { EDITOR_DISPLAY_WIDTH, EDITOR_DISPLAY_HEIGHT } from '../../../../constants/canvas'
import './SlideEditor.css'
import Toolbar from './Toolbar'
import LayeringToolbar from '../LayeringToolbar/LayeringToolbar'
import { ContextToolbar } from './context-toolbar'
import { useCurrentSlide, useEditorStore } from '../../../../store/editor/EditorStore'

export default function SlideEditor() {
  const canvaContainerRef = useRef<HTMLDivElement>(null)
  const zoom = useEditorStore(state => state.zoom)
  const setZoom = useEditorStore(state => state.setZoom)
  const currentSlide = useCurrentSlide()

  // Handle zoom with mouse wheel (with native preventDefault)
  useEffect(() => {
    const canvaContainer = canvaContainerRef.current
    if (!canvaContainer) return

    const handleWheel = (e: WheelEvent) => {
      // Check if Ctrl or Cmd is pressed for zoom
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        e.stopPropagation()

        const zoomSpeed = 0.1

        // Negative deltaY = scroll up = zoom in
        const delta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed
        setZoom(prevZoom => prevZoom + delta)
      }
    }

    // Add listener with { passive: false } to allow preventDefault
    canvaContainer.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      canvaContainer.removeEventListener('wheel', handleWheel)
    }
  }, [setZoom])

  if (!currentSlide) {
    return null
  }

  return (
    <>
      <div className='editor-container'>
        <div className='editor-top-actions'>
          <Toolbar /> <ContextToolbar />
        </div>
        <div className='canva-container' ref={canvaContainerRef}>
          <div>
            <SlideCanvas
              slide={currentSlide}
              width={EDITOR_DISPLAY_WIDTH * zoom}
              height={EDITOR_DISPLAY_HEIGHT * zoom}
            />
          </div>
        </div>
        <ZoomBar />
      </div>
      <LayeringToolbar />
    </>
  )
}