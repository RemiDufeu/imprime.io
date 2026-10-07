import { useEffect, useState } from 'react'
import type { ImageSize } from '@imprime/sdk'
import { toImageDataUrl } from '@imprime/sdk'
import { imagesAPI } from '../../../api/api'
import { readImageDataUrl } from '../../../utils/imageFile'

// An image as a box draws it: its natural size lays it out (getImageLayout).
export interface LoadedImage extends ImageSize {
    dataUrl: string
}

// An uploaded image never changes — another image is another id — so one
// fetch serves every box that shows it (the canvas, the page thumbnails, the
// crop dialog) for the whole session. A failed fetch is forgotten, so the
// next box to ask tries again.
const fetches = new Map<string, Promise<LoadedImage>>()

function fetchImage(imageId: string): Promise<LoadedImage> {
    let pending = fetches.get(imageId)
    if (!pending) {
        pending = imagesAPI.getById(imageId).then(image => ({
            dataUrl: toImageDataUrl(image.data, image.mimeType),
            width: image.width,
            height: image.height,
        }))
        fetches.set(imageId, pending)
        pending.catch(() => fetches.delete(imageId))
    }
    return pending
}

// A data URL read once per session, for the same reason as `fetches`: the box
// redraws on every frame of a drag, and a default image is the same string in
// every box bound to its variable.
const dataUrlImages = new Map<string, LoadedImage | null>()

// An image variable's default, as a box draws it. Null when it is not an image
// the export could draw — a box then shows its placeholder.
export function readDataUrlImage(dataUrl: string): LoadedImage | null {
    let image = dataUrlImages.get(dataUrl)
    if (image === undefined) {
        image = readImageDataUrl(dataUrl) ?? null
        dataUrlImages.set(dataUrl, image)
    }
    return image
}

export type ImageData =
    | { status: 'empty' | 'loading' | 'error' }
    | { status: 'loaded'; image: LoadedImage }

// The image a box shows: none for an empty box, else its fetch's progress.
export function useImageData(imageId: string | undefined): ImageData {
    // Keyed by the id it answers, so a box given another image reads as
    // loading until that one arrives, not as the previous one.
    const [result, setResult] = useState<{ imageId: string; image: LoadedImage | null } | null>(null)

    useEffect(() => {
        if (!imageId) return
        let current = true
        fetchImage(imageId).then(
            image => { if (current) setResult({ imageId, image }) },
            error => {
                console.error('Failed to load image:', error)
                if (current) setResult({ imageId, image: null })
            },
        )
        return () => { current = false }
    }, [imageId])

    if (!imageId) return { status: 'empty' }
    if (result?.imageId !== imageId) return { status: 'loading' }
    return result.image ? { status: 'loaded', image: result.image } : { status: 'error' }
}
