import type { Shape } from '@imprime/sdk'
import { getRotatedBounds } from '@imprime/sdk'
import { EyeOutlined, PictureOutlined, RetweetOutlined } from '@ant-design/icons'
import { useEditorStore } from '../../../store/editor/EditorStore'
import type { ConditionPreview } from '../../../utils/conditionPreview'
import { variableReferenceLabel } from '../../../utils/variableScope'
import { CanvasBadges, type CanvasBadge } from './CanvasBadges/CanvasBadges'

interface ShapeBadgesProps {
    shape: Shape
    preview: ConditionPreview | null
}

// What the data does to a shape — repeated per item, drawing an image
// variable, shown on a condition — each with the icon of its control in the
// context bar.
export function ShapeBadges({ shape, preview }: ShapeBadgesProps) {
    const variables = useEditorStore(state => state.template?.variableData) ?? []

    const badges: CanvasBadge[] = []
    if (shape.type === 'group' && shape.repeat) {
        const { variableId, itemPath } = shape.repeat
        const list = variableId ? variableReferenceLabel(variables, variableId, itemPath) ?? 'unknown list' : 'no list'
        badges.push({
            icon: <RetweetOutlined />,
            label: list,
            title: variableId
                ? `Repeated for each item of ${list}; the editor shows the first copy`
                : 'Repeated group without a list: the export draws no copy',
            tone: 'repeat',
        })
    }
    if (shape.type === 'image' && shape.imageVariable) {
        const name = variableReferenceLabel(variables, shape.imageVariable, shape.itemPath) ?? 'unknown variable'
        badges.push({
            icon: <PictureOutlined />,
            label: name,
            title: `Image variable ${name}: the export draws whatever it holds`,
            tone: 'variable',
        })
    }
    if (shape.visibleWhen) {
        const { variableId, itemPath, negate } = shape.visibleWhen
        const name = variableId ? variableReferenceLabel(variables, variableId, itemPath) ?? 'unknown variable' : 'no variable'
        let title = `Shown only when ${name} is ${negate ? 'false' : 'true'}`
        if (preview === 'hidden') title += ' — hidden with the default values'
        if (preview === 'unknown') title += ' — the list it reads has no default item to check'
        badges.push({
            icon: <EyeOutlined />,
            label: negate ? `not ${name}` : name,
            title,
            tone: preview === 'hidden' ? 'muted' : 'condition',
        })
    }

    // Over the top-left corner of what the shape covers, turned or not.
    const { x, y } = getRotatedBounds(shape)
    return <CanvasBadges x={x} y={y} badges={badges} />
}
