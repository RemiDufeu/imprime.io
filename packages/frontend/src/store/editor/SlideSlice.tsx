import type { Shape } from "@imprime/sdk"
import type { StateCreator } from "zustand"
import type { PresentationSlice } from "./PresentationSlice"
import { presentationsAPI } from "../../api/api"
import type { ShapeSlice } from "./ShapeSlice"

export interface SlideSlice {
    currentSlideIndex: number
    addSlide: (afterIndex?: number) => Promise<void>
    deleteSlide: (slideId: string) => Promise<void>
    selectSlide: (index: number) => void
    updateSlideShapes: (slideId: string, shapes: Shape[]) => void
    _saveSlide: (slideId: string, shapes: Shape[], retryCount?: number) => Promise<void>
}

export const createSlideSlice: StateCreator<
    SlideSlice & PresentationSlice & ShapeSlice,
    [],
    [],
    SlideSlice
> = (set, get) => ({
    currentSlideIndex: 0,
    addSlide: async (afterIndex?: number) => {
        const { presentation } = get()
        if (!presentation) return

        try {
            await presentationsAPI.addSlide(presentation._id)
            const refreshed = await presentationsAPI.getById(presentation._id)

            if (afterIndex !== undefined && afterIndex >= 0 && afterIndex < refreshed.slides.length - 1) {
                const slides = [...refreshed.slides]
                const [movedSlide] = slides.splice(slides.length - 1, 1)
                slides.splice(afterIndex + 1, 0, movedSlide)

                const reorderedSlides = slides.map((slide, idx) => ({
                    ...slide,
                    order: idx,
                }))

                const finalUpdated = await presentationsAPI.update(presentation._id, { slides: reorderedSlides })
                set({ presentation: finalUpdated, currentSlideIndex: afterIndex + 1 })
            } else {
                set({ presentation: refreshed, currentSlideIndex: refreshed.slides.length - 1 })
            }
        } catch (err) {
            set({ error: 'Failed to add slide' })
        }
    },
    deleteSlide: async (slideId: string) => {
        const { presentation, currentSlideIndex } = get()
        if (!presentation) return

        try {
            await presentationsAPI.deleteSlide(presentation._id, slideId)
            const refreshed = await presentationsAPI.getById(presentation._id)
            const newSlideIndex = currentSlideIndex >= refreshed.slides.length
                ? Math.max(0, refreshed.slides.length - 1)
                : currentSlideIndex

            set({ presentation: refreshed, currentSlideIndex: newSlideIndex })
        } catch (err) {
            set({ error: 'Failed to delete slide' })
        }
    },
    selectSlide: (index: number) => {
        set({ currentSlideIndex: index, selectedShape: null })
    },
    updateSlideShapes: (slideId: string, shapes: Shape[]) => {
        const { presentation, _saveSlide } = get()
        if (!presentation) return

        set({
            presentation: {
                ...presentation,
                slides: presentation.slides.map((slide) =>
                    slide._id === slideId ? { ...slide, shapes } : slide
                ),
            },
        })

        _saveSlide(slideId, shapes)
    },
    _saveSlide: async (slideId: string, shapes: Shape[], retryCount = 0) => {
        const { presentation } = get()
        if (!presentation) return

        const MAX_RETRIES = 2
        const RETRY_DELAY = 1000 * Math.pow(2, retryCount)

        try {
            await presentationsAPI.updateSlide(presentation._id, slideId, shapes)
        } catch (err) {
            if (retryCount < MAX_RETRIES) {
                setTimeout(() => {
                    get()._saveSlide(slideId, shapes, retryCount + 1)
                }, RETRY_DELAY)
            } else {
                set({ error: 'Failed to save changes after multiple attempts' })
            }
        }
    },
})
