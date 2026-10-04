import { message } from 'antd'
import type { Paragraph, Shape } from '@imprime/sdk'
import { DEFAULT_FONT_SIZE, DEFAULT_LINE_HEIGHT, PARAGRAPH_SPACING, SLIDE_HEIGHT, SLIDE_WIDTH, isImageMimeType } from '@imprime/sdk'
import type { StateCreator } from 'zustand'
import type { PresentationSlice } from './PresentationSlice'
import type { SlideSlice } from './SlideSlice'
import type { DocumentWriteSlice } from './DocumentWriteSlice'
import type { SelectionSlice } from './SelectionSlice'
import { imagesAPI } from '../../api/api'
import { nextShapeName } from '../../utils/shapeTree'
import { selectCurrentSlide } from './selectors'

// An inserted image is scaled down to fit this square, then centred.
const IMAGE_MAX_SIZE = 800

// A pasted text box is sized before any layout, from rough metrics: as wide
// as its longest line within these bounds, as tall as its wrapped lines.
const PASTED_TEXT_MIN_WIDTH = 200
const PASTED_TEXT_MAX_WIDTH = 1200
const AVERAGE_CHAR_WIDTH = 0.55 // of the font size

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

// A vector image has no pixels of its own: it is redrawn at least this wide or
// tall, so that it stays sharp across a slide.
const VECTOR_RASTER_SIZE = SLIDE_WIDTH

// The export draws only IMAGE_MIME_TYPES, and the API takes nothing else: any
// other format the browser can show is redrawn as a PNG — an animated GIF as
// its first frame, the one the PDF could show.
function toPngDataUrl(img: HTMLImageElement, isVector: boolean): string {
    const { naturalWidth: width, naturalHeight: height } = img
    if (!width || !height) throw new Error('This image has no size of its own: save it as PNG or JPEG')
    const scale = isVector ? Math.max(1, VECTOR_RASTER_SIZE / Math.max(width, height)) : 1
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Failed to convert image')
    context.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
}

function uploadErrorMessage(error: unknown): string {
    if (!(error instanceof Error)) return 'Failed to upload image. Please try again.'
    if (error.message.includes('413') || error.message.includes('Payload Too Large')) {
        return 'Image is too large. Please reduce the file size.'
    }
    if (error.message.includes('Network')) return 'Network error. Please check your connection.'
    return `Upload failed: ${error.message}`
}

// Shapes made from content that comes from outside the editor: an image file,
// picked or pasted, and pasted text. Drawn shapes are ToolSlice's.
export interface ImportSlice {
    // Ask for an image file, then insert it.
    handleImageUpload: () => void
    // Upload an image and place it, fitted and centred, on the current slide.
    insertImageFile: (file: File) => Promise<void>
    // A text box holding `text`, one paragraph per line, centred on the slide.
    insertTextBox: (text: string) => void
}

export const createImportSlice: StateCreator<
    ImportSlice & PresentationSlice & SlideSlice & DocumentWriteSlice & SelectionSlice,
    [],
    [],
    ImportSlice
> = (_, get) => {
    const getCurrentSlide = () => selectCurrentSlide(get())

    return {
        handleImageUpload: () => {
            const input = document.createElement('input')
            input.type = 'file'
            input.accept = 'image/*'
            input.onchange = () => {
                const file = input.files?.[0]
                if (file) void get().insertImageFile(file)
            }
            input.click()
        },

        insertImageFile: async (file: File) => {
            const hideLoading = message.loading('Uploading image...', 0)
            try {
                let dataUrl: string
                let mimeType: string
                let natural: { width: number; height: number }
                try {
                    const original = await readAsDataUrl(file)
                    const img = await loadImage(original)
                    natural = { width: img.naturalWidth, height: img.naturalHeight }
                    if (isImageMimeType(file.type)) {
                        dataUrl = original
                        mimeType = file.type
                    } else {
                        dataUrl = toPngDataUrl(img, file.type === 'image/svg+xml')
                        mimeType = 'image/png'
                    }
                } catch (error) {
                    message.error(error instanceof Error ? error.message : 'Failed to read image file')
                    return
                }

                let imageId: string
                try {
                    imageId = (await imagesAPI.upload(dataUrl, mimeType, file.name))._id
                } catch (error) {
                    console.error('Failed to upload image:', error)
                    message.error(uploadErrorMessage(error))
                    return
                }

                const ratio = Math.min(1, IMAGE_MAX_SIZE / natural.width, IMAGE_MAX_SIZE / natural.height)
                const width = Math.floor(natural.width * ratio)
                const height = Math.floor(natural.height * ratio)

                // Read now: the slide may have changed during the upload.
                const slide = getCurrentSlide()
                if (!slide) return
                const shapeId = crypto.randomUUID()
                const newShape: Shape = {
                    id: shapeId,
                    type: 'image',
                    name: nextShapeName(slide.shapes, 'image'),
                    x: Math.floor((SLIDE_WIDTH - width) / 2),
                    y: Math.floor((SLIDE_HEIGHT - height) / 2),
                    width,
                    height,
                    imageId,
                    alt: file.name,
                }
                get()._editSlide(shapes => [...shapes, newShape], { slideId: slide._id })
                get().selectShape(shapeId)
                message.success('Image uploaded successfully')
            } finally {
                hideLoading()
            }
        },

        insertTextBox: (text: string) => {
            const slide = getCurrentSlide()
            if (!slide) return

            const lines = text.replace(/\r\n?/g, '\n').split('\n')
            const charWidth = DEFAULT_FONT_SIZE * AVERAGE_CHAR_WIDTH
            const longest = lines.reduce((max, line) => Math.max(max, line.length), 0)
            const width = Math.round(Math.min(PASTED_TEXT_MAX_WIDTH, Math.max(PASTED_TEXT_MIN_WIDTH, longest * charWidth)))
            const rows = lines.reduce((sum, line) => sum + Math.max(1, Math.ceil((line.length * charWidth) / width)), 0)
            const height = Math.round(Math.min(
                SLIDE_HEIGHT,
                rows * DEFAULT_FONT_SIZE * DEFAULT_LINE_HEIGHT + (lines.length - 1) * PARAGRAPH_SPACING,
            ))

            const shapeId = crypto.randomUUID()
            const newShape: Shape = {
                id: shapeId,
                type: 'text',
                name: nextShapeName(slide.shapes, 'text'),
                x: Math.round((SLIDE_WIDTH - width) / 2),
                y: Math.round((SLIDE_HEIGHT - height) / 2),
                width,
                height,
                paragraphes: lines.map((line): Paragraph => ({ type: 'paragraph', children: [{ text: line }] })),
            }
            get()._editSlide(shapes => [...shapes, newShape], { slideId: slide._id })
            get().selectShape(shapeId)
        },
    }
}
