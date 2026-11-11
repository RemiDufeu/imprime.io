import { useId } from 'react'
import type { DataUrlImage, ImageShape } from '@imprime/sdk'
import { getDashArray, getImageCornerRadius, getImageLayout, getImageOpacity } from '@imprime/sdk'

interface ImageDrawingProps {
    shape: ImageShape
    // Null draws `fallback` in the box instead.
    image: DataUrlImage | null
    fallback?: React.ReactNode
}

// An image box as ExportService.renderImage draws it: the whole image
// stretched to getImageLayout's rect, clipped to the box, the border on top.
// The editor's box and the preview's both draw through here.
export function ImageDrawing({ shape, image, fallback }: ImageDrawingProps) {
    // useId's characters are not all valid in `url(#…)`.
    const clipId = `image-clip-${useId().replace(/[^\w-]/g, '')}`
    const { x, y, width, height } = shape
    const cornerRadius = getImageCornerRadius(shape)

    let picture: React.ReactNode = fallback
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
        </g>
    )
}
