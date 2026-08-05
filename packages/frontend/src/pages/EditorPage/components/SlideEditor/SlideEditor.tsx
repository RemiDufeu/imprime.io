import { useRef, useEffect, useState } from 'react'
import { Button } from 'antd'
import { DownOutlined } from '@ant-design/icons'
import ZoomBar from './ZoomBar'
import { SlideCanvas } from '../../../../components/slide/SlideCanvas'
import { EDITOR_DISPLAY_WIDTH, EDITOR_DISPLAY_HEIGHT } from '../../../../constants/canvas'
import './SlideEditor.css'
import Toolbar from './Toolbar'
import LayeringToolbar from '../LayeringToolbar/LayeringToolbar'
import { ContextToolbar } from './context-toolbar'
import SlideList from '../SlideList'
import ShapeTreePanel from '../ShapeTreePanel'
import { useCurrentSlide, useEditorStore } from '../../../../store/editor/EditorStore'

export default function SlideEditor() {
  const canvaContainerRef = useRef<HTMLDivElement>(null)
  const zoom = useEditorStore(state => state.zoom)
  const setZoom = useEditorStore(state => state.setZoom)
  const currentSlide = useCurrentSlide()
  const [slidesOpen, setSlidesOpen] = useState(false)
  const [layersOpen, setLayersOpen] = useState(false)

  useEffect(() => {
    const canvaContainer = canvaContainerRef.current
    if (!canvaContainer) return

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        e.stopPropagation()

        const zoomSpeed = 0.1
        const delta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed
        setZoom(prevZoom => prevZoom + delta)
      }
    }

    canvaContainer.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      canvaContainer.removeEventListener('wheel', handleWheel)
    }
  }, [setZoom])

  if (!currentSlide) {
    return null
  }

  return (
    <div className='editor-container'>
      <div className='canva-container' ref={canvaContainerRef}>
        <div>
          <SlideCanvas
            slide={currentSlide}
            width={EDITOR_DISPLAY_WIDTH * zoom}
            height={EDITOR_DISPLAY_HEIGHT * zoom}
          />
        </div>
      </div>

      <div className='actions-layer'>
        <div className='top-bar-actions'>
          <div className="dropdown-menu">
            <Button
              className="dropdown-menu-trigger"
              onClick={() => setSlidesOpen(v => !v)}
            >
              <span className="dropdown-menu-trigger-inner">
                Slides
                <DownOutlined className={`dropdown-menu-chevron ${slidesOpen ? 'open' : ''}`} />
              </span>
            </Button>
          </div>

          <div className='toolbars'>
            <Toolbar />
            <ContextToolbar />
          </div>

          <div className="dropdown-menu dropdown-menu-end">
            <Button
              className="dropdown-menu-trigger"
              onClick={() => setLayersOpen(v => !v)}
            >
              <span className="dropdown-menu-trigger-inner">
                Shape tree
                <DownOutlined className={`dropdown-menu-chevron ${layersOpen ? 'open' : ''}`} />
              </span>
            </Button>
          </div>
        </div>
        <div className='floating-panels'>
          <div
            className={`floating-panel ${slidesOpen ? 'open' : ''}`}
            aria-hidden={!slidesOpen}
          >
            <SlideList />
          </div>
          <div className="centered-zoombar">
            <ZoomBar />
          </div>
          <div
            className={`floating-panel ${layersOpen ? 'open' : ''}`}
            aria-hidden={!layersOpen}
          >
            <ShapeTreePanel />
          </div>
        </div>
      </div>
      <LayeringToolbar />
    </div>
  )
}
