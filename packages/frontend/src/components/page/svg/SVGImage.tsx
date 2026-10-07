import { useId } from 'react'
import type { ImageShape } from '@imprime/sdk'
import { getDashArray, getImageCornerRadius, getImageLayout, getImageOpacity } from '@imprime/sdk'
import { useEditorStore } from '../../../store/editor/EditorStore'
import { variableReferenceLabel } from '../../../utils/variableScope'
import { ImagePlaceholder } from './ImagePlaceholder'
import { ImageVariableBadge } from './ImageVariableBadge'
import { readDataUrlImage, useImageData, type LoadedImage } from './useImageData'

interface SVGImageProps {
    shape: ImageShape
}

// Drawn as ExportService.renderImage draws it: the whole image stretched to
// getImageLayout's rect, clipped to the box, the border on top.
//
// A box bound to a variable has no image of its own until the export: it shows
// the variable's default, labelled with the variable, or a placeholder naming
// it. An item field has no default to show — the editor never resolves a
// for-group's items.
export function SVGImage({ shape }: SVGImageProps) {
    // useId's characters are not all valid in `url(#…)`.
    const clipId = `image-clip-${useId().replace(/[^\w-]/g, '')}`
    const variables = useEditorStore(state => state.template?.variableData)
    const data = useImageData(shape.imageVariable ? undefined : shape.imageId)
    const { x, y, width, height } = shape
    const cornerRadius = getImageCornerRadius(shape)

    let image: LoadedImage | null = data.status === 'loaded' ? data.image : null
    let label: string | undefined
    if (shape.imageVariable) {
        label = variableReferenceLabel(variables ?? [], shape.imageVariable, shape.itemPath) ?? 'Unknown variable'
        const variable = variables?.find(v => v._id === shape.imageVariable)
        image = !shape.itemPath && typeof variable?.default === 'string' ? readDataUrlImage(variable.default) : null
    }

    let picture: React.ReactNode
    if (image) {
        const layout = getImageLayout(shape, image)
        picture = (
            <>
                <clipPath id={clipId}>
                    <rect x={x} y={y} width={width} height={height} rx={cornerRadius} ry={cornerRadius} />
                </clipPath>
                <image
                    href={image.dataUrl}
                    x={layout.x}
                    y={layout.y}
                    width={layout.width}
                    height={layout.height}
                    preserveAspectRatio="none"
                    opacity={getImageOpacity(shape)}
                    clipPath={`url(#${clipId})`}
                />
            </>
        )
    } else {
        picture = (
            <ImagePlaceholder
                status={label !== undefined ? 'variable' : data.status === 'loaded' ? 'loading' : data.status}
                x={x}
                y={y}
                width={width}
                height={height}
                cornerRadius={cornerRadius}
                label={label}
            />
        )
    }

    return (
        <g>
            {/* The whole box takes the pointer, not only where the image is
                drawn: 'contain' leaves gaps, and a placeholder takes none. */}
            <rect x={x} y={y} width={width} height={height} fill="transparent" />
            {picture}
            {shape.stroke && shape.strokeWidth ? (
                <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    rx={cornerRadius}
                    ry={cornerRadius}
                    fill="none"
                    stroke={shape.stroke}
                    strokeWidth={shape.strokeWidth}
                    strokeDasharray={getDashArray(shape.strokeStyle)}
                />
            ) : null}
            {image && label !== undefined && (
                <ImageVariableBadge x={x} y={y} width={width} height={height} label={label} />
            )}
        </g>
    )
}
