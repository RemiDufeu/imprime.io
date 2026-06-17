import type { Shape } from '@imprime/sdk'
import { theme } from 'antd'
import { useCallback, useRef, cloneElement, isValidElement, useEffect } from 'react'
import { useEditorStore } from '../../../store/editor/EditorStore'
import type { ResizeHandle } from '../../../store/editor/TransformationSlice'

interface SVGSelectionWrapperProps {
    shape: Shape
    readonly: boolean
    children: React.ReactNode
}

const HANDLE_SIZE = 12
const HANDLE_OFFSET = HANDLE_SIZE / 2
const TEXT_BORDER_WIDTH = 12

const RESIZE_HANDLES: {
    position: ResizeHandle
    cursor: string
    getPosition: (w: number, h: number) => { x: number; y: number }
}[] = [
        { position: 'nw', cursor: 'nwse-resize', getPosition: () => ({ x: -HANDLE_OFFSET, y: -HANDLE_OFFSET }) },
        { position: 'n', cursor: 'ns-resize', getPosition: (w) => ({ x: w / 2 - HANDLE_OFFSET, y: -HANDLE_OFFSET }) },
        { position: 'ne', cursor: 'nesw-resize', getPosition: (w) => ({ x: w - HANDLE_OFFSET, y: -HANDLE_OFFSET }) },
        { position: 'e', cursor: 'ew-resize', getPosition: (w, h) => ({ x: w - HANDLE_OFFSET, y: h / 2 - HANDLE_OFFSET }) },
        { position: 'se', cursor: 'nwse-resize', getPosition: (w, h) => ({ x: w - HANDLE_OFFSET, y: h - HANDLE_OFFSET }) },
        { position: 's', cursor: 'ns-resize', getPosition: (w, h) => ({ x: w / 2 - HANDLE_OFFSET, y: h - HANDLE_OFFSET }) },
        { position: 'sw', cursor: 'nesw-resize', getPosition: (_, h) => ({ x: -HANDLE_OFFSET, y: h - HANDLE_OFFSET }) },
        { position: 'w', cursor: 'ew-resize', getPosition: (_, h) => ({ x: -HANDLE_OFFSET, y: h / 2 - HANDLE_OFFSET }) },
    ]

export function SVGSelectionWrapper({ shape, readonly, children }: SVGSelectionWrapperProps) {
    const { token } = theme.useToken()
    const svgRef = useRef<SVGGElement>(null)

    const selectedShapeId = useEditorStore((s) => s.selectedShape?.id)
    const selectedTool = useEditorStore((s) => s.selectedTool)
    const transformationData = useEditorStore((s) =>
        s.selectedShape?.id === shape.id ? s.transformationData : null
    )
    const isTransforming = useEditorStore((s) =>
        s.selectedShape?.id === shape.id && s.dragData !== null
    )

    const selectShape = useEditorStore((s) => s.selectShape)
    const startDrag = useEditorStore((s) => s.startDrag)
    const startResize = useEditorStore((s) => s.startResize)

    const dragData = useEditorStore((s) => s.dragData)
    const onMouseMove = useEditorStore((s) => s.onMouseMove)
    const onMouseUp = useEditorStore((s) => s.onMouseUp)

    useEffect(() => {
        if (!dragData) return

        const handleMouseMove = (e: MouseEvent) => {
            onMouseMove(e.clientX, e.clientY)
        }

        const handleMouseUp = () => {
            onMouseUp()
        }

        document.addEventListener('mousemove', handleMouseMove)
        document.addEventListener('mouseup', handleMouseUp)

        return () => {
            document.removeEventListener('mousemove', handleMouseMove)
            document.removeEventListener('mouseup', handleMouseUp)
        }
    }, [dragData, onMouseMove, onMouseUp])

    const isSelected = selectedShapeId === shape.id
    const showSelection = isSelected && !readonly
    const showAnchors = showSelection && !isTransforming

    const displayShape = transformationData
        ? { ...shape, ...transformationData }
        : shape

    const handleClick = useCallback((e: React.MouseEvent) => {
        if (readonly || selectedTool !== 'move') return
        e.stopPropagation()
        // don't re select if already selected
        if (!isSelected) {
            selectShape(shape.id)
        }
    }, [readonly, selectedTool, selectShape, shape.id, isSelected])

    const handleDragStart = useCallback((e: React.MouseEvent) => {
        if (readonly || !isSelected) return
        e.stopPropagation()

        const svgElement = svgRef.current?.ownerSVGElement
        if (!svgElement) return

        startDrag(svgElement, e.clientX, e.clientY)
    }, [readonly, isSelected, startDrag])

    const handleResizeStart = useCallback((e: React.MouseEvent, handle: ResizeHandle) => {
        if (readonly) return
        e.stopPropagation()

        const svgElement = svgRef.current?.ownerSVGElement
        if (!svgElement) return

        startResize(svgElement, handle, e.clientX, e.clientY)
    }, [readonly, startResize])

    const cursor = readonly
        ? undefined
        : isSelected ? 'grab' : 'pointer'

    return (
        <g ref={svgRef} data-shape-id={shape.id}>
            <g
                onClick={handleClick}
                onMouseDown={shape.type != 'text' ? handleDragStart : undefined}
                style={{ cursor }}
            >
                {isValidElement(children)
                    ? cloneElement(children, { shape: displayShape } as any)
                    : children}
            </g>

            {showSelection && (
                <g>
                    <rect
                        data-selection-rect={shape.id}
                        x={displayShape.x}
                        y={displayShape.y}
                        width={displayShape.width}
                        height={displayShape.height}
                        fill="none"
                        stroke={token.colorPrimary}
                        strokeWidth={2}
                        strokeDasharray="5,5"
                    />

                    {/* Draggable border zones for text shapes */}
                    {shape.type === 'text' && showAnchors && (
                        <>
                            <rect
                                x={displayShape.x}
                                y={displayShape.y}
                                width={displayShape.width}
                                height={TEXT_BORDER_WIDTH}
                                fill="transparent"
                                style={{ cursor: 'move' }}
                                onMouseDown={handleDragStart}
                            />
                            <rect
                                x={displayShape.x}
                                y={displayShape.y + displayShape.height - TEXT_BORDER_WIDTH}
                                width={displayShape.width}
                                height={TEXT_BORDER_WIDTH}
                                fill="transparent"
                                style={{ cursor: 'move' }}
                                onMouseDown={handleDragStart}
                            />
                            <rect
                                x={displayShape.x}
                                y={displayShape.y}
                                width={TEXT_BORDER_WIDTH}
                                height={displayShape.height}
                                fill="transparent"
                                style={{ cursor: 'move' }}
                                onMouseDown={handleDragStart}
                            />
                            <rect
                                x={displayShape.x + displayShape.width - TEXT_BORDER_WIDTH}
                                y={displayShape.y}
                                width={TEXT_BORDER_WIDTH}
                                height={displayShape.height}
                                fill="transparent"
                                style={{ cursor: 'move' }}
                                onMouseDown={handleDragStart}
                            />
                        </>
                    )}

                    {showAnchors && RESIZE_HANDLES.map((handle) => {
                        const pos = handle.getPosition(displayShape.width, displayShape.height)
                        return (
                            <rect
                                key={handle.position}
                                x={displayShape.x + pos.x}
                                y={displayShape.y + pos.y}
                                width={HANDLE_SIZE}
                                height={HANDLE_SIZE}
                                fill="#ffffff"
                                stroke={token.colorPrimary}
                                strokeWidth={2}
                                style={{ cursor: handle.cursor }}
                                onMouseDown={(e) => handleResizeStart(e, handle.position)}
                            />
                        )
                    })}
                </g>
            )}
        </g>
    )
}