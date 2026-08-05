import { useEffect, useRef } from 'react'
import type { Slide } from '@imprime/sdk'
import { SlideCanvas } from '../../../../../components/slide/SlideCanvas'
import { EDITOR_DISPLAY_WIDTH, EDITOR_DISPLAY_HEIGHT } from '../../../../../constants/canvas'
import { useEditorStore } from '../../../../../store/editor/EditorStore'
import './CanvasArea.css'

interface CanvasAreaProps {
  slide: Slide
}

export function CanvasArea({ slide }: CanvasAreaProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const zoom = useEditorStore(state => state.zoom)
  const setZoom = useEditorStore(state => state.setZoom)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        e.stopPropagation()

        const zoomSpeed = 0.1
        const delta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed
        setZoom(prevZoom => prevZoom + delta)
      }
    }

    container.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      container.removeEventListener('wheel', handleWheel)
    }
  }, [setZoom])

  return (
    <div className='canva-container' ref={containerRef}>
      <div>
        <SlideCanvas
          slide={slide}
          width={EDITOR_DISPLAY_WIDTH * zoom}
          height={EDITOR_DISPLAY_HEIGHT * zoom}
        />
      </div>
    </div>
  )
}
