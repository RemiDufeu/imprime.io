import { message } from 'antd'
import type { Shape } from '@imprime/sdk'
import type { StateCreator } from 'zustand'
import type { PresentationSlice } from './PresentationSlice'
import type { SlideSlice } from './SlideSlice'
import type { ShapeSlice } from './ShapeSlice'
import type { ToolSlice } from './ToolSlice'
import type { ToolAttributesSlice } from './ToolAttributeSlice'
import { imagesAPI } from '../../api/api'

export interface DrawingData {
    startX: number
    startY: number
    currentX: number
    currentY: number
}

export interface ShapeCreationSlice {
    isDrawing: boolean
    drawingData: DrawingData | null

    startDrawing: (x: number, y: number) => void
    updateDrawing: (x: number, y: number) => void
    finishDrawing: () => void
    cancelDrawing: () => void

    handleImageUpload: () => void
}

export const createShapeCreationSlice: StateCreator<
    PresentationSlice & SlideSlice & ShapeCreationSlice & ShapeSlice & ToolSlice & ToolAttributesSlice,
    [],
    [],
    ShapeCreationSlice
> = (set, get) => {
    let rafId: number | null = null

    const getCurrentSlide = () => {
        const { presentation, currentSlideIndex } = get()
        return presentation?.slides[currentSlideIndex] ?? null
    }

    return {
        isDrawing: false,
        drawingData: null,

        startDrawing: (x: number, y: number) => {
            const { selectedTool } = get()

            if (selectedTool !== 'rectangle' && selectedTool !== 'ellipse' && selectedTool !== 'text') {
                return
            }

            set({
                isDrawing: true,
                drawingData: { startX: x, startY: y, currentX: x, currentY: y },
                selectedShape: null,
            })
        },

        updateDrawing: (x: number, y: number) => {
            const { isDrawing, drawingData } = get()
            if (!isDrawing || !drawingData) return

            if (rafId !== null) {
                cancelAnimationFrame(rafId)
            }

            rafId = requestAnimationFrame(() => {
                set({
                    drawingData: { ...get().drawingData!, currentX: x, currentY: y },
                })
                rafId = null
            })
        },

        cancelDrawing: () => {
            if (rafId !== null) {
                cancelAnimationFrame(rafId)
                rafId = null
            }
            set({ isDrawing: false, drawingData: null })
        },

        finishDrawing: () => {
            const { isDrawing, drawingData, selectedTool, attributes, updateSlideShapes, selectShape, cancelDrawing } = get()
            const currentSlide = getCurrentSlide()

            if (!isDrawing || !drawingData || !currentSlide) {
                cancelDrawing()
                return
            }

            const { startX, startY, currentX, currentY } = drawingData
            const x = Math.min(startX, currentX)
            const y = Math.min(startY, currentY)
            const width = Math.abs(currentX - startX)
            const height = Math.abs(currentY - startY)

            const minSize = 20
            if (width < minSize || height < minSize) {
                cancelDrawing()
                return
            }

            const shapeId = crypto.randomUUID()
            let newShape: Shape

            if (selectedTool === 'text') {
                newShape = {
                    id: shapeId,
                    type: 'text',
                    x, y, width, height,
                    paragraphes: [{
                        type: 'paragraph',
                        children: [{text : ''}]
                    }],
                }
            } else if (selectedTool === 'ellipse') {
                newShape = {
                    id: shapeId,
                    type: 'ellipse',
                    x, y, width, height,
                    fill: attributes.fillColor,
                    stroke: attributes.strokeColor,
                    strokeWidth: attributes.strokeWidth,
                    strokeStyle: attributes.strokeStyle,
                }
            } else {
                newShape = {
                    id: shapeId,
                    type: 'rectangle',
                    x, y, width, height,
                    fill: attributes.fillColor,
                    stroke: attributes.strokeColor,
                    strokeWidth: attributes.strokeWidth,
                    strokeStyle: attributes.strokeStyle,
                    cornerRadius: attributes.cornerRadius,
                }
            }

            updateSlideShapes(currentSlide._id, [...currentSlide.shapes, newShape])
            selectShape(shapeId)
            get().setTool('move')
            cancelDrawing()
        },

        handleImageUpload: () => {
            const { updateSlideShapes, selectShape } = get()
            const currentSlide = getCurrentSlide()
            if (!currentSlide) return

            const input = document.createElement('input')
            input.type = 'file'
            input.accept = 'image/*'

            input.onchange = async (e) => {
                const file = (e.target as HTMLInputElement).files?.[0]
                if (!file) return

                const hideLoading = message.loading('Uploading image...', 0)

                const reader = new FileReader()
                reader.onload = async (event) => {
                    const base64 = event.target?.result as string
                    if (!base64) {
                        hideLoading()
                        message.error('Failed to read image file')
                        return
                    }

                    try {
                        const uploadResult = await imagesAPI.upload(base64, file.type, file.name)

                        const img = new Image()
                        img.onload = () => {
                            const maxSize = 800
                            let width = img.naturalWidth
                            let height = img.naturalHeight

                            if (width > maxSize || height > maxSize) {
                                const ratio = Math.min(maxSize / width, maxSize / height)
                                width = Math.floor(width * ratio)
                                height = Math.floor(height * ratio)
                            }

                            const x = Math.floor((1920 - width) / 2)
                            const y = Math.floor((1080 - height) / 2)

                            const shapeId = crypto.randomUUID()
                            const newShape: Shape = {
                                id: shapeId,
                                type: 'image',
                                x, y, width, height,
                                imageId: uploadResult._id,
                                alt: file.name,
                            }

                            // Re-fetch current slide in case it changed
                            const slide = getCurrentSlide()
                            if (slide) {
                                updateSlideShapes(slide._id, [...slide.shapes, newShape])
                                selectShape(shapeId)
                            }

                            hideLoading()
                            message.success('Image uploaded successfully')
                        }
                        img.onerror = () => {
                            hideLoading()
                            message.error('Failed to load image')
                        }
                        img.src = base64
                    } catch (error) {
                        hideLoading()
                        console.error('Failed to upload image:', error)

                        if (error instanceof Error) {
                            if (error.message.includes('413') || error.message.includes('Payload Too Large')) {
                                message.error('Image is too large. Please reduce the file size.')
                            } else if (error.message.includes('Network')) {
                                message.error('Network error. Please check your connection.')
                            } else {
                                message.error(`Upload failed: ${error.message}`)
                            }
                        } else {
                            message.error('Failed to upload image. Please try again.')
                        }
                    }
                }
                reader.onerror = () => {
                    hideLoading()
                    message.error('Failed to read image file')
                }
                reader.readAsDataURL(file)
            }

            input.click()
        },
    }
}
