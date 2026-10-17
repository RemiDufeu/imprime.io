import type { Shape } from '@imprime/sdk'
import { getCenter, getRotation, normalizeRotation } from '@imprime/sdk'
import { theme } from 'antd'
import { useCallback, useRef, cloneElement, isValidElement, useEffect } from 'react'
import { useEditorStore } from '../../../store/editor/EditorStore'
import type { ResizeHandle } from '../../../store/editor/TransformationSlice'
import { selectCurrentPage } from '../../../store/editor/selectors'
import { previewCondition } from '../../../utils/conditionPreview'
import { findShapeById } from '../../../utils/shapeTree'
import { ShapeBadges } from './ShapeBadges'

interface SVGSelectionWrapperProps {
    shape: Shape
    readonly: boolean
    children: React.ReactNode
}

const HANDLE_SIZE = 12
export const HANDLE_OFFSET = HANDLE_SIZE / 2
const TEXT_BORDER_WIDTH = 12
// A shape its condition would leave out of an export with the default values
// is still drawn and edited, faded.
const GHOST_OPACITY = 0.35

// From the top edge to the centre of the rotation handle, which sits above it.
const ROTATION_HANDLE_DISTANCE = 28
const ROTATION_HANDLE_RADIUS = HANDLE_SIZE / 2

// `angle` is the handle's direction from the centre of the unturned box, in
// degrees clockwise from north: its cursor turns with the shape.
const RESIZE_HANDLES: {
    position: ResizeHandle
    angle: number
    getPosition: (w: number, h: number) => { x: number; y: number }
}[] = [
        { position: 'nw', angle: 315, getPosition: () => ({ x: -HANDLE_OFFSET, y: -HANDLE_OFFSET }) },
        { position: 'n', angle: 0, getPosition: (w) => ({ x: w / 2 - HANDLE_OFFSET, y: -HANDLE_OFFSET }) },
        { position: 'ne', angle: 45, getPosition: (w) => ({ x: w - HANDLE_OFFSET, y: -HANDLE_OFFSET }) },
        { position: 'e', angle: 90, getPosition: (w, h) => ({ x: w - HANDLE_OFFSET, y: h / 2 - HANDLE_OFFSET }) },
        { position: 'se', angle: 135, getPosition: (w, h) => ({ x: w - HANDLE_OFFSET, y: h - HANDLE_OFFSET }) },
        { position: 's', angle: 180, getPosition: (w, h) => ({ x: w / 2 - HANDLE_OFFSET, y: h - HANDLE_OFFSET }) },
        { position: 'sw', angle: 225, getPosition: (_, h) => ({ x: -HANDLE_OFFSET, y: h - HANDLE_OFFSET }) },
        { position: 'w', angle: 270, getPosition: (_, h) => ({ x: -HANDLE_OFFSET, y: h / 2 - HANDLE_OFFSET }) },
    ]

// One per 45° from north, repeating every 180°.
const RESIZE_CURSORS = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize']

// The resize cursor closest to the handle's direction on the page.
function resizeCursor(angle: number): string {
    const step = Math.round(normalizeRotation(angle) / 45)
    return RESIZE_CURSORS[((step % 4) + 4) % 4]
}

export function SVGSelectionWrapper({ shape, readonly, children }: SVGSelectionWrapperProps) {
    const { token } = theme.useToken()
    const svgRef = useRef<SVGGElement>(null)

    const selectedShapeId = useEditorStore((s) => s.selectedShapeId)
    const selectedTool = useEditorStore((s) => s.selectedTool)
    const transformationData = useEditorStore((s) =>
        s.selectedShapeId === shape.id ? s.transformationData : null
    )
    const isTransforming = useEditorStore((s) =>
        s.selectedShapeId === shape.id && s.dragData !== null
    )
    const conditionPreview = useEditorStore((s) => previewCondition(s.template, shape))

    // The turn of the selected shape's parents, which its handles' cursors
    // follow. Only the selected shape has handles.
    const parentRotation = useEditorStore((s) => {
        if (s.selectedShapeId !== shape.id) return 0
        const page = selectCurrentPage(s)
        return page ? findShapeById(page.shapes, shape.id)?.parentFrame.rotation ?? 0 : 0
    })

    const selectShape = useEditorStore((s) => s.selectShape)
    const startDrag = useEditorStore((s) => s.startDrag)
    const startResize = useEditorStore((s) => s.startResize)
    const startRotate = useEditorStore((s) => s.startRotate)

    const dragData = useEditorStore((s) => s.dragData)
    const onMouseMove = useEditorStore((s) => s.onMouseMove)
    const onMouseUp = useEditorStore((s) => s.onMouseUp)

    useEffect(() => {
        if (!dragData) return

        const handleMouseMove = (e: MouseEvent) => {
            onMouseMove(e.clientX, e.clientY, e.shiftKey)
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

    // The shape, its selection and its handles turn together about the
    // centre of its box, as both renderers turn it.
    const rotation = getRotation(displayShape)
    const center = getCenter(displayShape)
    const turn = rotation !== 0 ? `rotate(${rotation} ${center.x} ${center.y})` : undefined

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

    const handleRotateStart = (e: React.MouseEvent) => {
        if (readonly) return
        e.stopPropagation()

        const svgElement = svgRef.current?.ownerSVGElement
        if (!svgElement) return

        startRotate(svgElement, e.clientX, e.clientY)
    }

    const cursor = readonly
        ? undefined
        : isSelected ? 'grab' : 'pointer'

    // Editor visibility toggle — hidden shapes are still selectable through
    // the layers panel but do not render on the canvas. This check must come
    // *after* every hook call so hook order stays stable across toggles.
    if (shape.hidden) return null

    return (
        <g ref={svgRef} data-shape-id={shape.id}>
            <g
                transform={turn}
                onClick={handleClick}
                onMouseDown={shape.type != 'text' ? handleDragStart : undefined}
                style={{ cursor }}
                opacity={conditionPreview === 'hidden' ? GHOST_OPACITY : undefined}
            >
                {isValidElement(children)
                    ? cloneElement(children, { shape: displayShape } as any)
                    : children}
            </g>

            {/* Unturned, over the turned box's top-left corner: a label reads
                level whatever the shape's angle. */}
            {!readonly && <ShapeBadges shape={displayShape} preview={conditionPreview} />}

            {showSelection && (
                <g transform={turn}>
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

                    {showAnchors && (
                        <>
                            <line
                                x1={center.x}
                                y1={displayShape.y}
                                x2={center.x}
                                y2={displayShape.y - ROTATION_HANDLE_DISTANCE}
                                stroke={token.colorPrimary}
                                strokeWidth={2}
                                pointerEvents="none"
                            />
                            <circle
                                data-rotation-handle={shape.id}
                                cx={center.x}
                                cy={displayShape.y - ROTATION_HANDLE_DISTANCE}
                                r={ROTATION_HANDLE_RADIUS}
                                fill="#ffffff"
                                stroke={token.colorPrimary}
                                strokeWidth={2}
                                style={{ cursor: 'grab' }}
                                onMouseDown={handleRotateStart}
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
                                style={{ cursor: resizeCursor(handle.angle + parentRotation + rotation) }}
                                onMouseDown={(e) => handleResizeStart(e, handle.position)}
                            />
                        )
                    })}
                </g>
            )}
        </g>
    )
}