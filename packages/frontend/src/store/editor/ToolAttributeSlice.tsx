
import type { Shape, RectangleShape, EllipseShape, TextBoxShape } from '@imprime/sdk'
import type { StateCreator } from 'zustand'

export interface ActiveStyles {
    bold: boolean
    italic: boolean
    underline: boolean
    color: string
    fontSize: number
    fontFamily: string
}

export const DEFAULT_STYLE: ActiveStyles = {
    bold: false,
    italic: false,
    underline: false,
    color: '#000000',
    fontSize: 16,
    fontFamily: 'Roboto',
}

export type StrokeStyle = 'solid' | 'dashed' | 'dotted'

export type ContextBarType = 'none' | 'shape' | 'text'

interface ShapeAttributes {
    fillColor: string
    strokeColor: string
    strokeWidth: number
    strokeStyle: StrokeStyle
    cornerRadius: number
}

interface TextAttributes {
    fontFamily: string
    fontSize: number
    textColor: string
    bold: boolean
    italic: boolean
    underline: boolean
}

export interface ToolAttributes extends ShapeAttributes, TextAttributes { }

export interface ToolAttributesSlice {
    attributes: ToolAttributes
    contextBarType: ContextBarType

    setFillColor: (color: string) => void
    setStrokeColor: (color: string) => void
    setStrokeWidth: (width: number) => void
    setStrokeStyle: (style: StrokeStyle) => void
    setCornerRadius: (radius: number) => void

    setFontFamily: (family: string) => void
    setFontSize: (size: number) => void
    setTextColor: (color: string) => void
    setBold: (bold: boolean) => void
    setItalic: (italic: boolean) => void
    setUnderline: (underline: boolean) => void

    setShapeAttributes: (attrs: Partial<ShapeAttributes>) => void
    setTextAttributes: (attrs: Partial<TextAttributes>) => void

    reset: () => void
}

const initialAttributes: ToolAttributes = {
    fillColor: '#3b82f6',
    strokeColor: '#000000',
    strokeWidth: 2,
    strokeStyle: 'solid',
    cornerRadius: 0,
    fontFamily: DEFAULT_STYLE.fontFamily,
    fontSize: DEFAULT_STYLE.fontSize,
    textColor: DEFAULT_STYLE.color,
    bold: DEFAULT_STYLE.bold,
    italic: DEFAULT_STYLE.italic,
    underline: DEFAULT_STYLE.underline,
}

export const createToolAttributesSlice: StateCreator<
    ToolAttributesSlice,
    [],
    [],
    ToolAttributesSlice
> = (set) => ({
    attributes: { ...initialAttributes },
    contextBarType: 'none',

    setFillColor: (color) =>
        set((state) => ({
            attributes: { ...state.attributes, fillColor: color },
        })),

    setStrokeColor: (color) =>
        set((state) => ({
            attributes: { ...state.attributes, strokeColor: color },
        })),

    setStrokeWidth: (width) =>
        set((state) => ({
            attributes: { ...state.attributes, strokeWidth: width },
        })),

    setStrokeStyle: (style) =>
        set((state) => ({
            attributes: { ...state.attributes, strokeStyle: style },
        })),

    setCornerRadius: (radius) =>
        set((state) => ({
            attributes: { ...state.attributes, cornerRadius: radius },
        })),

    setFontFamily: (family) =>
        set((state) => ({
            attributes: { ...state.attributes, fontFamily: family },
        })),

    setFontSize: (size) =>
        set((state) => ({
            attributes: { ...state.attributes, fontSize: size },
        })),

    setTextColor: (color) =>
        set((state) => ({
            attributes: { ...state.attributes, textColor: color },
        })),

    setBold: (bold) =>
        set((state) => ({
            attributes: { ...state.attributes, bold },
        })),

    setItalic: (italic) =>
        set((state) => ({
            attributes: { ...state.attributes, italic },
        })),

    setUnderline: (underline) =>
        set((state) => ({
            attributes: { ...state.attributes, underline },
        })),

    setShapeAttributes: (attrs) =>
        set((state) => ({
            attributes: { ...state.attributes, ...attrs },
        })),

    setTextAttributes: (attrs) =>
        set((state) => ({
            attributes: { ...state.attributes, ...attrs },
        })),

    reset: () =>
        set({
            attributes: { ...initialAttributes },
            contextBarType: 'none',
        }),
})

export function shapeToAttributes(shape: RectangleShape | EllipseShape): Partial<ShapeAttributes> {
    const attrs: Partial<ShapeAttributes> = {
        fillColor: shape.fill,
        strokeColor: shape.stroke,
        strokeWidth: shape.strokeWidth,
        strokeStyle: shape.strokeStyle,
    }

    if (shape.type === 'rectangle') {
        attrs.cornerRadius = shape.cornerRadius
    }

    return attrs
}

export function textBoxToAttributes(_shape: TextBoxShape): Partial<TextAttributes> {
    return {
        fontFamily: DEFAULT_STYLE.fontFamily,
        fontSize: DEFAULT_STYLE.fontSize,
        textColor: DEFAULT_STYLE.color,
        bold: DEFAULT_STYLE.bold,
        italic: DEFAULT_STYLE.italic,
        underline: DEFAULT_STYLE.underline,
    }
}

export function shapeToAttributesHelper(shape: Shape): Partial<ToolAttributes> {
    if (shape.type === 'rectangle' || shape.type === 'ellipse') {
        return shapeToAttributes(shape)
    } else if (shape.type === 'text') {
        return textBoxToAttributes(shape)
    }
    return {}
}