import { useEffect, useRef } from 'react'
import type { Page } from '@imprime/sdk'
import { PageCanvas } from '../../../../../components/page/PageCanvas'
import { EDITOR_DISPLAY_WIDTH, EDITOR_DISPLAY_HEIGHT } from '../../../../../constants/canvas'
import { useEditorStore } from '../../../../../store/editor/EditorStore'
import { selectPageSize } from '../../../../../store/editor/selectors'
import './CanvasArea.css'

interface CanvasAreaProps {
  page: Page
}

export function CanvasArea({ page }: CanvasAreaProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const zoom = useEditorStore(state => state.zoom)
  const setZoom = useEditorStore(state => state.setZoom)
  const pageSize = useEditorStore(selectPageSize)
  const scale = zoom * Math.min(
    EDITOR_DISPLAY_WIDTH / pageSize.width,
    EDITOR_DISPLAY_HEIGHT / pageSize.height,
  )

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
        <PageCanvas
          page={page}
          width={pageSize.width * scale}
          height={pageSize.height * scale}
        />
      </div>
    </div>
  )
}
