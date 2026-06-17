import { useEditorStore } from '../../../store/editor/EditorStore'

export function SVGDrawingPreview() {
    const drawingData = useEditorStore(state => state.drawingData)
    const toolAttributes = useEditorStore(state => state.attributes)
    const selectedTool = useEditorStore(state => state.selectedTool)

    if (!drawingData) return null

    const { startX, startY, currentX, currentY } = drawingData
    const rect = {
        x: Math.min(startX, currentX),
        y: Math.min(startY, currentY),
        width: Math.abs(currentX - startX),
        height: Math.abs(currentY - startY),
    }

    const { x, y, width, height } = rect
    const type = selectedTool

    // Don't show preview if width or height is too small
    if (Math.abs(width) < 1 || Math.abs(height) < 1) return null

    switch (type) {
        case 'rectangle':
            return (
                <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    fill={toolAttributes.fillColor}
                    stroke={toolAttributes.strokeColor}
                    strokeWidth={toolAttributes.strokeWidth}
                    strokeDasharray={toolAttributes.strokeStyle === 'dashed' ? '10,5' : toolAttributes.strokeStyle === 'dotted' ? '2,2' : undefined}
                    rx={toolAttributes.cornerRadius}
                    ry={toolAttributes.cornerRadius}
                    pointerEvents="none"
                />
            )

        case 'ellipse': {
            const cx = x + width / 2
            const cy = y + height / 2
            const rx = Math.abs(width) / 2
            const ry = Math.abs(height) / 2

            return (
                <ellipse
                    cx={cx}
                    cy={cy}
                    rx={rx}
                    ry={ry}
                    fill={toolAttributes.fillColor}
                    stroke={toolAttributes.strokeColor}
                    strokeWidth={toolAttributes.strokeWidth}
                    strokeDasharray={toolAttributes.strokeStyle === 'dashed' ? '10,5' : toolAttributes.strokeStyle === 'dotted' ? '2,2' : undefined}
                    pointerEvents="none"
                />
            )
        }

        case 'text':
            return (
                <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    fill="none"
                    stroke={toolAttributes.strokeColor}
                    strokeWidth={2}
                    strokeDasharray="5,5"
                    pointerEvents="none"
                />
            )

        default:
            return null
    }
}
