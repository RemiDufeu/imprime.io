
import type { Shape, RectangleShape, EllipseShape, TextBoxShape, TextAlign, TextVerticalAlign, ListType } from '@imprime/sdk'
import { DEFAULT_FONT_SIZE, DEFAULT_LINE_HEIGHT } from '@imprime/sdk'
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
    fontSize: DEFAULT_FONT_SIZE,
    fontFamily: 'Roboto',
}

export type StrokeStyle = 'solid' | 'dashed' | 'dotted'

export type ContextBarType = 'none' | 'shape' | 'text' | 'group' | 'if-group' | 'for-group'

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
    strikethrough: boolean
    uppercase: boolean
    // Paragraph-level: shown for, and applied to, the paragraphs in the selection.
    textAlign: TextAlign
    lineHeight: number
    listType: ListType | 'none'
    // Box-level: applied to the selected text shape, not through the editor.
    verticalAlign: TextVerticalAlign
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
    setStrikethrough: (strikethrough: boolean) => void
    setUppercase: (uppercase: boolean) => void
    setTextAlign: (textAlign: TextAlign) => void
    setLineHeight: (lineHeight: number) => void
    setListType: (listType: ListType | 'none') => void
    setVerticalAlign: (verticalAlign: TextVerticalAlign) => void

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
    strikethrough: false,
    uppercase: false,
    textAlign: 'left',
    lineHeight: DEFAULT_LINE_HEIGHT,
    listType: 'none',
    verticalAlign: 'top',
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

    setStrikethrough: (strikethrough) =>
        set((state) => ({
            attributes: { ...state.attributes, strikethrough },
        })),

    setUppercase: (uppercase) =>
        set((state) => ({
            attributes: { ...state.attributes, uppercase },
        })),

    setTextAlign: (textAlign) =>
        set((state) => ({
            attributes: { ...state.attributes, textAlign },
        })),

    setLineHeight: (lineHeight) =>
        set((state) => ({
            attributes: { ...state.attributes, lineHeight },
        })),

    setListType: (listType) =>
        set((state) => ({
            attributes: { ...state.attributes, listType },
        })),

    setVerticalAlign: (verticalAlign) =>
        set((state) => ({
            attributes: { ...state.attributes, verticalAlign },
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

// Run and paragraph attributes are reset here and read back from the selection
// by `syncEditorToAttributes` once the shape's editor is active; only the
// box-level `verticalAlign` comes from the shape itself.
export function textBoxToAttributes(shape: TextBoxShape): Partial<TextAttributes> {
    return {
        fontFamily: DEFAULT_STYLE.fontFamily,
        fontSize: DEFAULT_STYLE.fontSize,
        textColor: DEFAULT_STYLE.color,
        bold: DEFAULT_STYLE.bold,
        italic: DEFAULT_STYLE.italic,
        underline: DEFAULT_STYLE.underline,
        strikethrough: false,
        uppercase: false,
        textAlign: 'left',
        lineHeight: DEFAULT_LINE_HEIGHT,
        listType: 'none',
        verticalAlign: shape.verticalAlign ?? 'top',
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