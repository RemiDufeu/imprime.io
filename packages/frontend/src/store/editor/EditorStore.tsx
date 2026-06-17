import { create } from "zustand"
import { createPresentationSlice, type PresentationSlice } from "./PresentationSlice"
import { createZoomSlice, type ZoomSlice } from "./ZoomSlice"
import { persist, subscribeWithSelector } from "zustand/middleware"
import { createToolSlice, type ToolSlice } from "./ToolSlice"
import { createSlideSlice, type SlideSlice } from "./SlideSlice"
import { createShapeSlice, type ShapeSlice } from "./ShapeSlice"
import { createTransformationSlice, type TransformationSlice } from "./TransformationSlice"
import { createToolAttributesSlice, type ToolAttributesSlice } from "./ToolAttributeSlice"
import { createLayeringSlice, type LayeringSlice } from "./LayeringSlice"
import { createShapeCreationSlice, type ShapeCreationSlice } from "./ShapeCreationSlice"
import { createRichTextEditorSlice, type RichTextEditorSlice } from "./RichTextEditorSlice"
import { createVariableSlice, type VariableSlice } from "./VariableSlice"

type BaseEditorStore = PresentationSlice &
    ZoomSlice &
    ToolSlice &
    SlideSlice &
    ShapeSlice &
    TransformationSlice &
    ToolAttributesSlice &
    LayeringSlice &
    ShapeCreationSlice &
    RichTextEditorSlice &
    VariableSlice

export const useEditorStore = create<BaseEditorStore>()(
    subscribeWithSelector(
        persist(
            (...args) => ({
                ...createPresentationSlice(...args),
                ...createSlideSlice(...args),
                ...createShapeSlice(...args),
                ...createZoomSlice(...args),
                ...createToolSlice(...args),
                ...createTransformationSlice(...args),
                ...createToolAttributesSlice(...args),
                ...createLayeringSlice(...args),
                ...createShapeCreationSlice(...args),
                ...createRichTextEditorSlice(...args),
                ...createVariableSlice(...args)
            }),
            {
                name: 'editor-store',
                partialize: (state) => ({
                    zoom: state.zoom,
                }),
            }
        ),
    ),
)

export const useCurrentSlide = () =>
    useEditorStore((s) => s.presentation?.slides[s.currentSlideIndex] ?? null);
