import type { ImageShape } from '@imprime/sdk'
import { ImageDrawing } from '../svg/ImageDrawing'
import { readDataUrlImage, useImageData } from '../svg/useImageData'

interface ResolvedImageProps {
    shape: ImageShape
}

// A resolved image box: the data URL its variable resolved to, or its
// uploaded image. Empty — no value, an image still loading or not found —
// it draws its border alone, as the PDF draws an empty box.
export function ResolvedImage({ shape }: ResolvedImageProps) {
    const data = useImageData(shape.resolvedImage === undefined ? shape.imageId : undefined)
    const image = shape.resolvedImage !== undefined
        ? readDataUrlImage(shape.resolvedImage)
        : data.status === 'loaded' ? data.image : null

    return <ImageDrawing shape={shape} image={image} />
}
