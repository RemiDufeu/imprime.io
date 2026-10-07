import { message } from 'antd'
import type { ImageDTO, PageSize, Paragraph, Shape } from '@imprime/sdk'
import {
    DEFAULT_FONT_SIZE,
    DEFAULT_IMAGE_ALIGN,
    DEFAULT_IMAGE_FIT,
    DEFAULT_LINE_HEIGHT,
    PARAGRAPH_SPACING,
} from '@imprime/sdk'
import type { StateCreator } from 'zustand'
import type { TemplateSlice } from './TemplateSlice'
import type { PageSlice } from './PageSlice'
import type { DocumentWriteSlice } from './DocumentWriteSlice'
import type { SelectionSlice } from './SelectionSlice'
import type { ShapeSlice } from './ShapeSlice'
import { imagesAPI } from '../../api/api'
import { nextShapeName } from '../../utils/shapeTree'
import { imageFileToDataUrl } from '../../utils/imageFile'
import { selectCurrentPage, selectPageSize } from './selectors'

// A pasted image is scaled down to fit this square and the page, then
// centred.
const IMAGE_MAX_SIZE = 800

// A pasted text box is sized before any layout, from rough metrics: as wide
// as its longest line within these bounds, as tall as its wrapped lines.
const PASTED_TEXT_MIN_WIDTH = 200
const PASTED_TEXT_MAX_WIDTH = 1200
const AVERAGE_CHAR_WIDTH = 0.55 // of the font size

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
    // Upload `file` and show it in the image box `shapeId`, which keeps its
    // size, fit and alignment. Whatever the box showed goes: its image and
    // crop, or its variable. False when the upload failed, which the user has
    // been told.
    importImageFileInto: (shapeId: string, file: File) => Promise<boolean>
    // Upload an image and place it in a box of its proportions, fitted and
    // centred on the current page: what pasting an image does.
    insertImageFile: (file: File) => Promise<void>
    // A text box holding `text`, one paragraph per line, centred on the page.
    insertTextBox: (text: string) => void
}

/**
 * Reads, converts if need be, and uploads an image file, with a loading
 * message meanwhile. Null once a failure has been reported to the user.
 */
async function uploadImageFile(file: File, pageSize: PageSize): Promise<ImageDTO.Response | null> {
    const hideLoading = message.loading('Uploading image...', 0)
    try {
        let converted: Awaited<ReturnType<typeof imageFileToDataUrl>>
        try {
            converted = await imageFileToDataUrl(file, Math.max(pageSize.width, pageSize.height))
        } catch (error) {
            message.error(error instanceof Error ? error.message : 'Failed to read image file')
            return null
        }

        try {
            const image = await imagesAPI.upload(converted.dataUrl, converted.mimeType, file.name)
            message.success('Image uploaded successfully')
            return image
        } catch (error) {
            console.error('Failed to upload image:', error)
            message.error(uploadErrorMessage(error))
            return null
        }
    } finally {
        hideLoading()
    }
}

export const createImportSlice: StateCreator<
    ImportSlice & TemplateSlice & PageSlice & DocumentWriteSlice & SelectionSlice & ShapeSlice,
    [],
    [],
    ImportSlice
> = (_, get) => {
    const getCurrentPage = () => selectCurrentPage(get())

    return {
        importImageFileInto: async (shapeId, file) => {
            const image = await uploadImageFile(file, selectPageSize(get()))
            if (!image) return false
            get().updateShape(shapeId, {
                imageId: image._id,
                alt: file.name,
                crop: undefined,
                imageVariable: undefined,
                itemPath: undefined,
            })
            return true
        },

        insertImageFile: async (file: File) => {
            const pageSize = selectPageSize(get())
            const image = await uploadImageFile(file, pageSize)
            if (!image) return

            // Its size as the server read it, which both renderers lay the
            // image out from.
            const ratio = Math.min(
                1,
                Math.min(IMAGE_MAX_SIZE, pageSize.width) / image.width,
                Math.min(IMAGE_MAX_SIZE, pageSize.height) / image.height,
            )
            const width = Math.floor(image.width * ratio)
            const height = Math.floor(image.height * ratio)

            // Read now: the page may have changed during the upload.
            const page = getCurrentPage()
            if (!page) return
            const shapeId = crypto.randomUUID()
            const newShape: Shape = {
                id: shapeId,
                type: 'image',
                name: nextShapeName(page.shapes, 'image'),
                x: Math.floor((pageSize.width - width) / 2),
                y: Math.floor((pageSize.height - height) / 2),
                width,
                height,
                imageId: image._id,
                alt: file.name,
                fit: DEFAULT_IMAGE_FIT,
                align: DEFAULT_IMAGE_ALIGN,
            }
            get()._editPage(shapes => [...shapes, newShape], { pageId: page._id })
            get().selectShape(shapeId)
        },

        insertTextBox: (text: string) => {
            const page = getCurrentPage()
            if (!page) return
            const pageSize = selectPageSize(get())

            const lines = text.replace(/\r\n?/g, '\n').split('\n')
            const charWidth = DEFAULT_FONT_SIZE * AVERAGE_CHAR_WIDTH
            const longest = lines.reduce((max, line) => Math.max(max, line.length), 0)
            const maxWidth = Math.min(PASTED_TEXT_MAX_WIDTH, pageSize.width)
            const width = Math.round(Math.min(maxWidth, Math.max(PASTED_TEXT_MIN_WIDTH, longest * charWidth)))
            const rows = lines.reduce((sum, line) => sum + Math.max(1, Math.ceil((line.length * charWidth) / width)), 0)
            const height = Math.round(Math.min(
                pageSize.height,
                rows * DEFAULT_FONT_SIZE * DEFAULT_LINE_HEIGHT + (lines.length - 1) * PARAGRAPH_SPACING,
            ))

            const shapeId = crypto.randomUUID()
            const newShape: Shape = {
                id: shapeId,
                type: 'text',
                name: nextShapeName(page.shapes, 'text'),
                x: Math.round((pageSize.width - width) / 2),
                y: Math.round((pageSize.height - height) / 2),
                width,
                height,
                paragraphes: lines.map((line): Paragraph => ({ type: 'paragraph', children: [{ text: line }] })),
            }
            get()._editPage(shapes => [...shapes, newShape], { pageId: page._id })
            get().selectShape(shapeId)
        },
    }
}
