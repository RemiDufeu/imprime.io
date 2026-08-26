import type { StateCreator } from "zustand"
import type { ShapeSlice } from "./ShapeSlice"
import type { SlideSlice } from "./SlideSlice"
import type { PresentationSlice } from "./PresentationSlice"
import type { Shape } from "@imprime/sdk"
import { findShapeById, getSiblingList, replaceSiblingList } from "../../utils/shapeTree"
import { selectCurrentSlide } from "./selectors"

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
        const { updateSlideShapes } = get()
        const currentSlide = selectCurrentSlide(get())
        if (!currentSlide) return

        const loc = findShapeById(currentSlide.shapes, shapeId)
        if (!loc) return

        const siblings = getSiblingList(currentSlide.shapes, loc.parentGroupId)
        const shapeIndex = siblings.findIndex(s => s.id === shapeId)
        if (shapeIndex === -1 || !canReorder(shapeIndex, siblings.length)) return

        const newSiblings = reorder([...siblings], shapeIndex)
        const newShapes = replaceSiblingList(currentSlide.shapes, loc.parentGroupId, newSiblings)
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