import type { Shape } from '@imprime/sdk'
import type { StateCreator } from 'zustand'
import type { TemplateSlice } from './TemplateSlice'
import type { PageSlice } from './PageSlice'
import type { DocumentWriteSlice } from './DocumentWriteSlice'
import type { SelectionSlice } from './SelectionSlice'
import { findInnermostGroupAt, insertShape, nextShapeName } from '../../utils/shapeTree'
import { selectCurrentPage } from './selectors'

export type ToolType = 'move' | 'rectangle' | 'ellipse' | 'text' | 'group' | 'if-group' | 'for-group'

export type StrokeStyle = 'solid' | 'dashed' | 'dotted'

// The style a new rectangle or ellipse is drawn with. Named like the shape's
// own fields, so the shape bar hands the same patch to either.
export interface DrawStyle {
    fill: string
    stroke: string
    strokeWidth: number
    strokeStyle: StrokeStyle
    cornerRadius: number
}

export interface DrawingData {
    startX: number
    startY: number
    currentX: number
    currentY: number
}

// Below this, in either dimension, a drag draws nothing: it was a click.
const MIN_DRAWN_SIZE = 20

/** The active tool, the style it draws with, and the drag that draws a shape. */
export interface ToolSlice {
    selectedTool: ToolType
    setTool: (tool: ToolType) => void

    drawStyle: DrawStyle
    setDrawStyle: (style: Partial<DrawStyle>) => void

    isDrawing: boolean
    drawingData: DrawingData | null
    startDrawing: (x: number, y: number) => void
    updateDrawing: (x: number, y: number) => void
    finishDrawing: () => void
    cancelDrawing: () => void
}

export const createToolSlice: StateCreator<
    ToolSlice & TemplateSlice & PageSlice & DocumentWriteSlice & SelectionSlice,
    [],
    [],
    ToolSlice
> = (set, get) => {
    // The pending animation frame of `updateDrawing`: the slice's own state,
    // not the store's.
    let rafId: number | null = null

    // The shape the current tool draws in `rect` (page coordinates).
    const drawnShape = (tool: Exclude<ToolType, 'move'>, shapes: Shape[], x: number, y: number, width: number, height: number): Shape => {
        const base = { id: crypto.randomUUID(), name: nextShapeName(shapes, tool), x, y, width, height }
        const { fill, stroke, strokeWidth, strokeStyle, cornerRadius } = get().drawStyle
        switch (tool) {
            case 'text':
                return { ...base, type: 'text', paragraphes: [{ type: 'paragraph', children: [{ text: '' }] }] }
            case 'group':
            case 'if-group':
            case 'for-group':
                return { ...base, type: tool, children: [] }
            case 'ellipse':
                return { ...base, type: 'ellipse', fill, stroke, strokeWidth, strokeStyle }
            case 'rectangle':
                return { ...base, type: 'rectangle', fill, stroke, strokeWidth, strokeStyle, cornerRadius }
        }
    }

    return {
        selectedTool: 'move',
        setTool: (tool) => set({ selectedTool: tool }),

        drawStyle: {
            fill: '#3b82f6',
            stroke: '#000000',
            strokeWidth: 2,
            strokeStyle: 'solid',
            cornerRadius: 0,
        },
        setDrawStyle: (style) => set({ drawStyle: { ...get().drawStyle, ...style } }),

        isDrawing: false,
        drawingData: null,

        startDrawing: (x, y) => {
            if (get().selectedTool === 'move') return
            get().selectShape(null)
            set({
                isDrawing: true,
                drawingData: { startX: x, startY: y, currentX: x, currentY: y },
            })
        },

        updateDrawing: (x, y) => {
            const { isDrawing, drawingData } = get()
            if (!isDrawing || !drawingData) return

            if (rafId !== null) {
                cancelAnimationFrame(rafId)
            }

            rafId = requestAnimationFrame(() => {
                const current = get().drawingData
                if (current) set({ drawingData: { ...current, currentX: x, currentY: y } })
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
            const { isDrawing, drawingData, selectedTool, cancelDrawing } = get()
            const page = selectCurrentPage(get())
            if (!isDrawing || !drawingData || !page || selectedTool === 'move') {
                cancelDrawing()
                return
            }

            const { startX, startY, currentX, currentY } = drawingData
            const x = Math.min(startX, currentX)
            const y = Math.min(startY, currentY)
            const width = Math.abs(currentX - startX)
            const height = Math.abs(currentY - startY)
            if (width < MIN_DRAWN_SIZE || height < MIN_DRAWN_SIZE) {
                cancelDrawing()
                return
            }

            const shape = drawnShape(selectedTool, page.shapes, x, y, width, height)

            // Drawing over a container drops the shape inside it, with the
            // rect converted into that container's local coordinate space.
            get()._editPage(shapes => {
                const parent = findInnermostGroupAt(shapes, x, y)
                return parent
                    ? insertShape(shapes, parent.id, { ...shape, x: x - parent.absX, y: y - parent.absY })
                    : [...shapes, shape]
            })
            get().selectShape(shape.id)
            set({ selectedTool: 'move' })
            cancelDrawing()
        },
    }
}
