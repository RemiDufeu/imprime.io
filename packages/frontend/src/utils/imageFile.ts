import type { ImageMimeType, ImageSize } from '@imprime/sdk'
import { isImageMimeType, readImageInfo, splitDataUrl, toImageDataUrl } from '@imprime/sdk'

// Image files as the API takes them: a PNG or JPEG data URL, whether it is
// uploaded (ImportSlice) or sent as an image variable's value (ImageValueInput).

const readAsDataUrl = (file: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Failed to read image file'))
    reader.onerror = () => reject(new Error('Failed to read image file'))
    reader.readAsDataURL(file)
})

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = src
})

// The export draws only IMAGE_MIME_TYPES, and the API takes nothing else: any
// other format the browser can show is redrawn as a PNG — an animated GIF as
// its first frame, the one the PDF could show. A vector image has no pixels of
// its own: it is redrawn at least `vectorSize` wide or tall.
function toPngDataUrl(img: HTMLImageElement, isVector: boolean, vectorSize: number): string {
    const { naturalWidth: width, naturalHeight: height } = img
    if (!width || !height) throw new Error('This image has no size of its own: save it as PNG or JPEG')
    const scale = isVector ? Math.max(1, vectorSize / Math.max(width, height)) : 1
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Failed to convert image')
    context.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
}

/**
 * `file` as a data URL the API takes. `vectorSize` is how large a vector image
 * is redrawn: as large as the page, so that it stays sharp across it. Rejects
 * with a message for the user when the file cannot be read or converted.
 */
export async function imageFileToDataUrl(
    file: File,
    vectorSize: number,
): Promise<{ dataUrl: string; mimeType: ImageMimeType }> {
    const original = await readAsDataUrl(file)
    if (isImageMimeType(file.type)) return { dataUrl: original, mimeType: file.type }
    const dataUrl = toPngDataUrl(await loadImage(original), file.type === 'image/svg+xml', vectorSize)
    return { dataUrl, mimeType: 'image/png' }
}

// An image held as a data URL, as both renderers draw it.
export interface DataUrlImage extends ImageSize {
    dataUrl: string
}

/**
 * `value` read as the server reads an image variable's value (backend
 * `readImageDataUrl`): the natural size from `readImageInfo`, so the editor
 * lays the image out exactly as the export will, and the URL rewritten with
 * the type its bytes hold, as the export draws it. Undefined for anything the
 * export would refuse.
 */
export function readImageDataUrl(value: string): DataUrlImage | undefined {
    const parts = splitDataUrl(value)
    if (!parts) return undefined
    let binary: string
    try {
        binary = atob(parts.base64)
    } catch {
        return undefined
    }
    const info = readImageInfo(Uint8Array.from(binary, char => char.charCodeAt(0)))
    if (!info) return undefined
    return { dataUrl: toImageDataUrl(parts.base64, info.mimeType), width: info.width, height: info.height }
}
