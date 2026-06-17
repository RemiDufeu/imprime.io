import { Editor, Transforms, type BaseSelection, Element } from "slate";
import type { StateCreator } from "zustand";
import type { ToolAttributesSlice } from "./ToolAttributeSlice";
import type { CustomText, VariableElement } from "@imprime/sdk";

export interface RichTextEditorSlice {
    editor: Editor | null;
    isFocused: boolean;
    lastSelection: BaseSelection;
    syncSelection: boolean
    setEditor: (editor: Editor | null) => void;
    setIsFocused: (isFocused: boolean) => void;
    setLastSelection: (selection: BaseSelection) => void;
    syncEditorToAttributes: () => void;
    syncAttributesToEditor: () => void;
    insertVariable: (variableId: string) => void;
};

export const createRichTextEditorSlice: StateCreator<
    RichTextEditorSlice & ToolAttributesSlice,
    [],
    [],
    RichTextEditorSlice> = (set, get) => ({
        editor: null,
        isFocused: false,
        lastSelection: null,
        syncSelection: false,
        setEditor: (editor) => set({ editor }),
        setIsFocused: (isFocused) => set({ isFocused }),
        setLastSelection: (selection) => set({ lastSelection: selection }),
        syncEditorToAttributes: () => {
            set({ syncSelection : true })
            const { editor, setTextAttributes } = get();
            if (!editor || !editor.selection) return;
            const marks = Editor.marks(editor);
            setTextAttributes({
                bold: marks?.bold === true,
                italic: marks?.italic === true,
                underline: marks?.underline === true,
                textColor: (marks?.color as string) || '#000000',
                fontSize: marks?.fontSize ? parseInt(marks.fontSize as string) : 16,
                fontFamily: (marks?.fontFamily as string) || 'Roboto',
            });
            set({ syncSelection : false })
        },

        syncAttributesToEditor: () => {
            const { editor, attributes, syncSelection } = get();
            if (!editor || !editor.selection) return;

            const marks = Editor.marks(editor);

            // Apply marks to text nodes
            if (attributes.bold && !marks?.bold) {
                Editor.addMark(editor, 'bold', true);
            } else if (!attributes.bold && marks?.bold) {
                Editor.removeMark(editor, 'bold');
            }

            if (attributes.italic && !marks?.italic) {
                Editor.addMark(editor, 'italic', true);
            } else if (!attributes.italic && marks?.italic) {
                Editor.removeMark(editor, 'italic');
            }

            if (attributes.underline && !marks?.underline) {
                Editor.addMark(editor, 'underline', true);
            } else if (!attributes.underline && marks?.underline) {
                Editor.removeMark(editor, 'underline');
            }

            if (attributes.textColor && marks?.color !== attributes.textColor) {
                Editor.addMark(editor, 'color', attributes.textColor);
            } else if (!attributes.textColor && marks?.color) {
                Editor.removeMark(editor, 'color');
            }

            const fontSize = `${attributes.fontSize}px`;
            if (attributes.fontSize && marks?.fontSize !== fontSize) {
                Editor.addMark(editor, 'fontSize', fontSize);
            } else if (!attributes.fontSize && marks?.fontSize) {
                Editor.removeMark(editor, 'fontSize');
            }

            if (attributes.fontFamily && marks?.fontFamily !== attributes.fontFamily) {
                Editor.addMark(editor, 'fontFamily', attributes.fontFamily);
            } else if (!attributes.fontFamily && marks?.fontFamily) {
                Editor.removeMark(editor, 'fontFamily');
            }

            // Apply styles to variable nodes in selection
            if(syncSelection) return;
            Transforms.setNodes(
                editor,
                {
                    bold: attributes.bold,
                    italic: attributes.italic,
                    underline: attributes.underline,
                    color: attributes.textColor,
                    fontSize: fontSize,
                    fontFamily: attributes.fontFamily,
                },
                {
                    match: n => Element.isElement(n) && n.type === 'variable',
                    at: editor.selection,
                }
            );
        },

        insertVariable: (variableId: string) => {
            const { editor, lastSelection } = get();
            if (!editor) return;

            // Restore the last selection if we have one
            if (lastSelection) {
                Transforms.select(editor, lastSelection);
            }

            const marks = Editor.marks(editor);

            const markStyles = {
                bold: marks?.bold === true,
                italic: marks?.italic === true,
                underline: marks?.underline === true,
                fontFamily: marks?.fontFamily as string | undefined,
                fontSize: marks?.fontSize as string | undefined,
                color: marks?.color as string | undefined,
            };

            const variable: VariableElement = {
                ...markStyles,
                type: 'variable',
                variableId: variableId,
                children: [{ text: '' }],
            };
            const textNode: CustomText = { 
                ...markStyles,
                text: ' ' 
            };

            Transforms.insertNodes(editor, [variable, textNode]);
        }
    });