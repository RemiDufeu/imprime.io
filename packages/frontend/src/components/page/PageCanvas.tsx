import { useRef } from 'react'
import type { Page } from '@imprime/sdk'
import { SVGShape } from './svg/SVGShape'
import { SVGSelectionWrapper } from './svg/SVGSelectionWrapper'
import { SVGDrawingPreview } from './svg/SVGDrawingPreview'
import { SVGDropHighlight } from './svg/SVGDropHighlight'
import { useEditorStore } from '../../store/editor/EditorStore'
import { selectPageSize } from '../../store/editor/selectors'

interface PageCanvasProps {
    page: Page
    width: number
    height: number
    readonly?: boolean
}

export function PageCanvas({
    page,
    width,
    height,
    readonly = false,
}: PageCanvasProps) {
    const svgRef = useRef<SVGSVGElement>(null)
    const selectShape = useEditorStore(state => state.selectShape)
    const startDrawing = useEditorStore(state => state.startDrawing)
    const updateDrawing = useEditorStore(state => state.updateDrawing)
    const finishDrawing = useEditorStore(state => state.finishDrawing)
    const isDrawing = useEditorStore(state => state.isDrawing)
    const selectedTool = useEditorStore(state => state.selectedTool)
    const pageSize = useEditorStore(selectPageSize)

    const scale = Math.min(width / pageSize.width, height / pageSize.height)

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

        // If shape/text/group tool is selected, start drawing
        if (selectedTool === 'rectangle' ||
            selectedTool === 'ellipse' ||
            selectedTool === 'text' ||
            selectedTool === 'group' ||
            selectedTool === 'if-group' ||
            selectedTool === 'for-group') {
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
                width={pageSize.width}
                height={pageSize.height}
                viewBox={`0 0 ${pageSize.width} ${pageSize.height}`}
                style={{
                    width: '100%',
                    height: '100%',
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
            >
                {/* Background */}
                <rect width={pageSize.width} height={pageSize.height} fill="#ffffff" />

                {/* Existing shapes */}
                {page.shapes.map((shape) => (
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

                {/* Highlights the group that would receive the shape on drop */}
                {!readonly && <SVGDropHighlight />}
            </svg>
        </div>
    )
}
