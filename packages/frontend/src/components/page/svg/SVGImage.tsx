import type { DataUrlImage, ImageShape } from '@imprime/sdk'
import { getImageCornerRadius } from '@imprime/sdk'
import { useEditorStore } from '../../../store/editor/EditorStore'
import { variableReferenceLabel } from '../../../utils/variableScope'
import { ImagePlaceholder } from './ImagePlaceholder'
import { ImageDrawing } from './ImageDrawing'
import { readDataUrlImage, useImageData } from './useImageData'

interface SVGImageProps {
    shape: ImageShape
}

// A box bound to a variable has no image of its own until the export: it shows
// the variable's default, or a placeholder naming it. An item field has no
// default to show — the editor never resolves a repeat's items. ShapeBadges
// names the variable over the box either way.
export function SVGImage({ shape }: SVGImageProps) {
    const variables = useEditorStore(state => state.template?.variableData)
    const data = useImageData(shape.imageVariable ? undefined : shape.imageId)

    let image: DataUrlImage | null = data.status === 'loaded' ? data.image : null
    let label: string | undefined
    if (shape.imageVariable) {
        label = variableReferenceLabel(variables ?? [], shape.imageVariable, shape.itemPath) ?? 'Unknown variable'
        const variable = variables?.find(v => v._id === shape.imageVariable)
        image = !shape.itemPath && typeof variable?.default === 'string' ? readDataUrlImage(variable.default) : null
    }

    return (
        <ImageDrawing
            shape={shape}
            image={image}
            fallback={
                <ImagePlaceholder
                    status={label !== undefined ? 'variable' : data.status === 'loaded' ? 'loading' : data.status}
                    x={shape.x}
                    y={shape.y}
                    width={shape.width}
                    height={shape.height}
                    cornerRadius={getImageCornerRadius(shape)}
                    label={label}
                />
            }
        />
    )
}
