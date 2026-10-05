import { useState, useEffect } from 'react'
import type { ImageShape } from '@imprime/sdk'
import { imagesAPI } from '../../../api/api'

interface SVGImageProps {
    shape: ImageShape
}

export function SVGImage({ shape }: SVGImageProps) {
    const [imageSrc, setImageSrc] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [hasError, setHasError] = useState(false)

    useEffect(() => {
        let isMounted = true

        async function loadImage() {
            try {
                setIsLoading(true)
                setHasError(false)
                const imageData = await imagesAPI.getById(shape.imageId)

                if (isMounted) {
                    setImageSrc(imageData.data)
                    setIsLoading(false)
                }
            } catch (error) {
                console.error('Failed to load image:', error)
                if (isMounted) {
                    setHasError(true)
                    setIsLoading(false)
                }
            }
        }

        loadImage()

        return () => {
            isMounted = false
        }
    }, [shape.imageId])

    if (isLoading) {
        // Show loading placeholder
        return (
            <g>
                <rect
                    x={shape.x}
                    y={shape.y}
                    width={shape.width}
                    height={shape.height}
                    fill="#f3f4f6"
                    stroke="#d1d5db"
                    strokeWidth={2}
                />
                <text
                    x={shape.x + shape.width / 2}
                    y={shape.y + shape.height / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#6b7280"
                    fontSize={14}
                    fontFamily="Arial, sans-serif"
                >
                    Loading...
                </text>
            </g>
        )
    }

    if (hasError || !imageSrc) {
        // Show error placeholder
        return (
            <g>
                <rect
                    x={shape.x}
                    y={shape.y}
                    width={shape.width}
                    height={shape.height}
                    fill="#fee2e2"
                    stroke="#ef4444"
                    strokeWidth={2}
                />
                <text
                    x={shape.x + shape.width / 2}
                    y={shape.y + shape.height / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#dc2626"
                    fontSize={14}
                    fontFamily="Arial, sans-serif"
                >
                    Failed to load image
                </text>
            </g>
        )
    }

    return (
        <image
            href={imageSrc}
            x={shape.x}
            y={shape.y}
            width={shape.width}
            height={shape.height}
            preserveAspectRatio="none"
        />
    )
}
