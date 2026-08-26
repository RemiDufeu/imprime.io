import { theme } from 'antd'
import { useEditorStore } from '../../../store/editor/EditorStore'

// Canva/Figma-style drop-target highlight: while a translation drag is in
// progress, the group under the cursor gets a filled border. Purely visual —
// the actual re-parent decision happens on mouseUp based on the final cursor
// position.
export function SVGDropHighlight() {
    const { token } = theme.useToken()
    const highlightedGroup = useEditorStore(state =>
        state.dragData?.kind === 'translate' ? state.dragData.highlightedGroup : null
    )

    if (!highlightedGroup) return null

    return (
        <rect
            x={highlightedGroup.x}
            y={highlightedGroup.y}
            width={highlightedGroup.width}
            height={highlightedGroup.height}
            fill={token.colorPrimaryBg}
            stroke={token.colorPrimary}
            opacity={0.2}
            strokeWidth={3}
            rx={6}
            ry={6}
            pointerEvents="none"
        />
    )
}
