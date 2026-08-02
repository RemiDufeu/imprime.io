import { useEditorStore } from '../../../store/editor/EditorStore'

// Canva/Figma-style drop-target highlight: while a translation drag is in
// progress, the group under the cursor gets a filled blue border. Purely
// visual — the actual re-parent decision happens on mouseUp based on the
// final cursor position.
export function SVGDwellOverlay() {
    const dropTarget = useEditorStore(state => state.dragData?.dropTarget ?? null)
    if (!dropTarget) return null

    return (
        <rect
            x={dropTarget.x}
            y={dropTarget.y}
            width={dropTarget.width}
            height={dropTarget.height}
            fill="rgba(59, 130, 246, 0.12)"
            stroke="#3b82f6"
            strokeWidth={3}
            rx={6}
            ry={6}
            pointerEvents="none"
        />
    )
}
