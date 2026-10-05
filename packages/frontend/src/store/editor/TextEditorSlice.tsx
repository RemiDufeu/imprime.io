import { Editor, Element, Transforms, type BaseSelection, type Descendant } from 'slate'
import { ReactEditor } from 'slate-react'
import type { StateCreator } from 'zustand'
import type { CustomText, ListType, Paragraph, TextAlign, VariableElement } from '@imprime/sdk'
import { DEFAULT_FONT, DEFAULT_FONT_SIZE, DEFAULT_LINE_HEIGHT, getListStyle, getParagraphStyle } from '@imprime/sdk'
import type { TemplateSlice } from './TemplateSlice'
import type { ShapeSlice } from './ShapeSlice'
import {
    firstSelectedParagraph,
    isParagraph,
    replaceEditorContent,
    setParagraphList,
    shiftListIndent,
} from '../../utils/paragraphs'
import { findShapeById } from '../../utils/shapeTree'

// The formatting of the text selection, as the text bar shows it. Marks left
// unset read as their default.
export interface TextFormat {
    fontFamily: string
    fontSize: number
    color: string
    bold: boolean
    italic: boolean
    underline: boolean
    strikethrough: boolean
    uppercase: boolean
    // Paragraph-level: of the first paragraph in the selection.
    textAlign: TextAlign
    lineHeight: number
    listType: ListType | 'none'
}

const DEFAULT_TEXT_FORMAT: TextFormat = {
    fontFamily: DEFAULT_FONT,
    fontSize: DEFAULT_FONT_SIZE,
    color: '#000000',
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    uppercase: false,
    textAlign: 'left',
    lineHeight: DEFAULT_LINE_HEIGHT,
    listType: 'none',
}

type BooleanMark = 'bold' | 'italic' | 'underline' | 'strikethrough' | 'uppercase'
const BOOLEAN_MARKS: readonly BooleanMark[] = ['bold', 'italic', 'underline', 'strikethrough', 'uppercase']

// Typing then undoing it leaves new arrays with the old content: compare by
// value once the references differ.
const hasTextChanged = (current: Descendant[], start: Descendant[]) =>
    current !== start && JSON.stringify(current) !== JSON.stringify(start)

const isVariable = (n: unknown) => Element.isElement(n) && n.type === 'variable'

/**
 * The text box being edited. Editing is a session: it begins when a box's
 * editor becomes the active one and ends — committing the typing as one undo
 * step, if there was any — when the selection, the page or the template
 * changes. Ending is synchronous and in the store, so a commit always lands
 * before whatever ended it, on the page the box is on.
 *
 * The text bar reads `textFormat` (refreshed from the selection on every
 * editor change) and writes through `applyTextFormat`: a command applied to
 * the editor, never state the editor is made to follow.
 */
export interface TextEditorSlice {
    editor: Editor | null
    isFocused: boolean
    lastSelection: BaseSelection
    textFormat: TextFormat
    // Depth of the active editor's own history. Slate keeps it on the editor,
    // outside the store; mirrored here so the undo/redo buttons can follow it.
    textHistory: { undos: number; redos: number }

    // Makes `editor` the active one, for the text shape `shapeId`, ending any
    // other session first. A no-op if it already is.
    beginTextSession: (shapeId: string, editor: Editor) => void
    endTextSession: () => void
    setIsFocused: (isFocused: boolean) => void
    // What the active editor reports on every change.
    syncFromEditor: () => void
    applyTextFormat: (format: Partial<TextFormat>) => void
    insertVariable: (variableId: string, itemPath?: string) => void
    // A command rather than a format: the level is relative, and each
    // selected item moves from its own.
    changeListIndent: (delta: number) => void

    _textSession: { shapeId: string; start: Descendant[] } | null
}

export const createTextEditorSlice: StateCreator<
    TextEditorSlice & TemplateSlice & ShapeSlice,
    [],
    [],
    TextEditorSlice
> = (set, get) => {
    const readFormat = (editor: Editor): TextFormat => {
        if (!editor.selection) return get().textFormat
        const marks = Editor.marks(editor)
        const paragraph = firstSelectedParagraph(editor)
        return {
            bold: marks?.bold === true,
            italic: marks?.italic === true,
            underline: marks?.underline === true,
            strikethrough: marks?.strikethrough === true,
            uppercase: marks?.uppercase === true,
            color: marks?.color || DEFAULT_TEXT_FORMAT.color,
            fontSize: marks?.fontSize ? parseInt(marks.fontSize) : DEFAULT_FONT_SIZE,
            fontFamily: marks?.fontFamily || DEFAULT_FONT,
            ...(paragraph
                ? { ...getParagraphStyle(paragraph), listType: getListStyle(paragraph)?.list ?? 'none' }
                : { textAlign: DEFAULT_TEXT_FORMAT.textAlign, lineHeight: DEFAULT_LINE_HEIGHT, listType: 'none' }),
        }
    }

    const historyDepth = (editor: Editor | null) => ({
        undos: editor?.history.undos.length ?? 0,
        redos: editor?.history.redos.length ?? 0,
    })

    // A mark on the text runs of the selection, and the same property on the
    // variable runs in it, which are elements rather than marked text.
    const setMark = (editor: Editor, key: keyof CustomText, value: string | boolean | null) => {
        if (value === null || value === false) Editor.removeMark(editor, key)
        else Editor.addMark(editor, key, value)
        Transforms.setNodes(editor, { [key]: value === null ? undefined : value }, { match: isVariable, at: editor.selection ?? undefined })
    }

    return {
        editor: null,
        isFocused: false,
        lastSelection: null,
        textFormat: DEFAULT_TEXT_FORMAT,
        textHistory: { undos: 0, redos: 0 },
        _textSession: null,

        beginTextSession: (shapeId, editor) => {
            if (get().editor === editor) return
            get().endTextSession()

            // Start from what the document holds: an undo or redo may have
            // replaced this text while the editor sat idle.
            const shape = get().template?.pages
                .map(page => findShapeById(page.shapes, shapeId)?.shape)
                .find(found => found !== undefined)
            if (shape?.type === 'text' && shape.paragraphes !== editor.children) {
                replaceEditorContent(editor, shape.paragraphes)
            }
            // Earlier sessions are steps of the canvas history; text undo only
            // walks back through this one.
            editor.history = { undos: [], redos: [] }

            set({
                editor,
                _textSession: { shapeId, start: editor.children },
                lastSelection: editor.selection,
                textFormat: readFormat(editor),
                textHistory: historyDepth(editor),
            })
        },

        endTextSession: () => {
            const { editor, _textSession, isFocused } = get()
            if (!editor && !_textSession && !isFocused) return
            set({ editor: null, _textSession: null, isFocused: false, textHistory: historyDepth(null) })
            if (editor && _textSession && hasTextChanged(editor.children, _textSession.start)) {
                get().updateShape(_textSession.shapeId, { paragraphes: editor.children as Paragraph[] })
            }
        },

        setIsFocused: (isFocused) => set({ isFocused }),

        syncFromEditor: () => {
            const { editor } = get()
            if (!editor) return
            set({
                lastSelection: editor.selection,
                textFormat: readFormat(editor),
                textHistory: historyDepth(editor),
            })
        },

        applyTextFormat: (format) => {
            const { editor } = get()
            if (!editor || !editor.selection) {
                // Nothing to format yet: the bar still shows the choice.
                set({ textFormat: { ...get().textFormat, ...format } })
                return
            }

            for (const key of BOOLEAN_MARKS) {
                const value = format[key]
                if (value !== undefined) setMark(editor, key, value)
            }
            if (format.color !== undefined) setMark(editor, 'color', format.color)
            if (format.fontSize !== undefined) setMark(editor, 'fontSize', `${format.fontSize}px`)
            if (format.fontFamily !== undefined) setMark(editor, 'fontFamily', format.fontFamily)
            if (format.textAlign !== undefined) {
                Transforms.setNodes(editor, { align: format.textAlign }, { match: isParagraph, mode: 'lowest' })
            }
            if (format.lineHeight !== undefined) {
                Transforms.setNodes(editor, { lineHeight: format.lineHeight }, { match: isParagraph, mode: 'lowest' })
            }
            if (format.listType !== undefined) {
                setParagraphList(editor, format.listType === 'none' ? null : format.listType)
            }

            get().syncFromEditor()
            // The toolbar control took the focus; typing goes on in the text.
            try {
                ReactEditor.focus(editor)
            } catch (error) {
                console.error('Failed to refocus the text editor:', error)
            }
        },

        insertVariable: (variableId, itemPath) => {
            const { editor, lastSelection } = get()
            if (!editor) return

            // The dropdown took the focus and with it the selection.
            if (lastSelection) {
                Transforms.select(editor, lastSelection)
            }

            const marks = Editor.marks(editor)
            const markStyles = {
                bold: marks?.bold === true,
                italic: marks?.italic === true,
                underline: marks?.underline === true,
                strikethrough: marks?.strikethrough === true,
                uppercase: marks?.uppercase === true,
                fontFamily: marks?.fontFamily,
                fontSize: marks?.fontSize,
                color: marks?.color,
            }

            const variable: VariableElement = {
                ...markStyles,
                type: 'variable',
                variableId,
                // Left unset for a template-wide reference, which is what
                // resolves against the variable's own value at export.
                ...(itemPath !== undefined ? { itemPath } : {}),
                children: [{ text: '' }],
            }
            const textNode: CustomText = { ...markStyles, text: ' ' }

            Transforms.insertNodes(editor, [variable, textNode])
        },

        changeListIndent: (delta) => {
            const { editor } = get()
            if (!editor || !editor.selection) return
            shiftListIndent(editor, delta)
            get().syncFromEditor()
        },
    }
}
