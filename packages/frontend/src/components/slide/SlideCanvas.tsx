import { useRef } from 'react'
import type { Slide } from '@imprime/sdk'
import { SLIDE_WIDTH, SLIDE_HEIGHT } from '../../constants/canvas'
import { SVGShape } from './svg/SVGShape'
import { SVGSelectionWrapper } from './svg/SVGSelectionWrapper'
import { SVGDrawingPreview } from './svg/SVGDrawingPreview'
import { useEditorStore } from '../../store/editor/EditorStore'

interface SlideCanvasProps {
    slide: Slide
    width: number
    height: number
    readonly?: boolean
}

export function SlideCanvas({
    slide,
    width,
    height,
    readonly = false,
}: SlideCanvasProps) {
    const svgRef = useRef<SVGSVGElement>(null)
    const selectShape = useEditorStore(state => state.selectShape)
    const startDrawing = useEditorStore(state => state.startDrawing)
    const updateDrawing = useEditorStore(state => state.updateDrawing)
    const finishDrawing = useEditorStore(state => state.finishDrawing)
    const isDrawing = useEditorStore(state => state.isDrawing)
    const selectedTool = useEditorStore(state => state.selectedTool)

    const scale = Math.min(width / SLIDE_WIDTH, height / SLIDE_HEIGHT)

    // Convert mouse position to SVG coordinates
    const getSVGCoordinates = (clientX: number, clientY: number): { x: number; y: number } | null => {
        if (!svgRef.current) return null

        const rect = svgRef.current.getBoundingClientRect()
        const x = (clientX - rect.left) / scale
        const y = (clientY - rect.top) / scale

        return { x, y }
    }

    const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
        if (readonly) return

        const target = e.target as SVGElement
        // Check if clicked on empty area (svg element or background rect with no data-shape-id)
        const clickedOnEmpty = target === svgRef.current ||
                               target.tagName === 'svg' ||
                               (target.tagName === 'rect' && !target.closest('[data-shape-id]'))

        const coords = getSVGCoordinates(e.clientX, e.clientY)
        if (!coords) return

        // If shape/text tool is selected, start drawing
        if (selectedTool === 'rectangle' ||
            selectedTool === 'ellipse' ||
            selectedTool === 'text') {
            startDrawing(coords.x, coords.y)
        } else if (clickedOnEmpty) {
            // Deselect shapes only if clicked on empty area
            selectShape(null)
        }
    }

    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
        if (readonly || !isDrawing) return

        const coords = getSVGCoordinates(e.clientX, e.clientY)
        if (!coords) return

        updateDrawing(coords.x, coords.y)
    }

    const handleMouseUp = () => {
        if (readonly || !isDrawing) return
        finishDrawing()
    }

    return (
        <div
            style={{
                width,
                height,
                backgroundColor: '#ffffff',
                border: '2px solid #e5e7eb',
                overflow: 'hidden',
                boxShadow: '0 0 6px 1px rgb(0 0 0 / 0.1)',
                position: 'relative',
            }}
        >
            <svg
                ref={svgRef}
                width={SLIDE_WIDTH}
                height={SLIDE_HEIGHT}
                viewBox={`0 0 ${SLIDE_WIDTH} ${SLIDE_HEIGHT}`}
                style={{
                    width: '100%',
                    height: '100%',
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
            >
                {/* Background */}
                <rect width={SLIDE_WIDTH} height={SLIDE_HEIGHT} fill="#ffffff" />

                {/* Existing shapes */}
                {slide.shapes.map((shape) => (
                    <SVGSelectionWrapper
                        key={shape.id}
                        shape={shape}
                        readonly={readonly}
                    >
                        <SVGShape shape={shape} readonly={readonly} />
                    </SVGSelectionWrapper>
                ))}

                {/* Drawing preview (only in edit mode) */}
                {!readonly && <SVGDrawingPreview />}
            </svg>
        </div>
    )
}
