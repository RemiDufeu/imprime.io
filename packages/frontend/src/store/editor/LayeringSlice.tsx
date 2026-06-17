import type { StateCreator } from "zustand"
import type { ShapeSlice } from "./ShapeSlice"
import type { SlideSlice } from "./SlideSlice"
import type { PresentationSlice } from "./PresentationSlice"
import type { Shape } from "@imprime/sdk"

type ReorderShapeFunction = (shapes: Shape[], shapeIndex: number) => Shape[]

export interface LayeringSlice {
    bringToFront: (id: string) => void
    sendToBack: (id: string) => void
    bringForward: (id: string) => void
    sendBackward: (id: string) => void
}

export const createLayeringSlice: StateCreator<
    LayeringSlice & PresentationSlice & SlideSlice & ShapeSlice,
    [],
    [],
    LayeringSlice
> = (_, get) => {

    const reorderShape = (
        shapeId: string,
        canReorder: (index: number, length: number) => boolean,
        reorder: ReorderShapeFunction
    ) => {
        const { currentSlideIndex, updateSlideShapes, presentation } = get()
        const currentSlide = presentation?.slides[currentSlideIndex]
        if (!currentSlide) return

        const shapeIndex = currentSlide.shapes.findIndex(s => s.id === shapeId)
        if (shapeIndex === -1 || !canReorder(shapeIndex, currentSlide.shapes.length)) return

        const newShapes = reorder([...currentSlide.shapes], shapeIndex)
        updateSlideShapes(currentSlide._id, newShapes)
    }

    return {
        bringToFront: (id: string) => {
            reorderShape(
                id,
                (index, length) => index < length - 1,
                (shapes, index) => {
                    const [shape] = shapes.splice(index, 1)
                    shapes.push(shape)
                    return shapes
                }
            )
        },

        sendToBack: (id: string) => {
            reorderShape(
                id,
                (index) => index > 0,
                (shapes, index) => {
                    const [shape] = shapes.splice(index, 1)
                    shapes.unshift(shape)
                    return shapes
                }
            )
        },

        bringForward: (id: string) => {
            reorderShape(
                id,
                (index, length) => index < length - 1,
                (shapes, index) => {
                    [shapes[index], shapes[index + 1]] = [shapes[index + 1], shapes[index]]
                    return shapes
                }
            )
        },

        sendBackward: (id: string) => {
            reorderShape(
                id,
                (index) => index > 0,
                (shapes, index) => {
                    [shapes[index], shapes[index - 1]] = [shapes[index - 1], shapes[index]]
                    return shapes
                }
            )
        },
    }
}