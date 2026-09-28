import { Editor, Transforms, type BaseSelection, Element, type Node } from "slate";
import type { StateCreator } from "zustand";
import type { ToolAttributesSlice } from "./ToolAttributeSlice";
import type { CustomText, Paragraph, VariableElement } from "@imprime/sdk";
import { getParagraphStyle } from "@imprime/sdk";

const isParagraph = (n: Node): n is Paragraph => Element.isElement(n) && n.type === 'paragraph';

// Paragraph formatting is shown for, and diffed against, the first paragraph
// of the selection. Diffing against the same paragraph that was read means an
// unrelated change (a mark) on a selection spanning differently-aligned
// paragraphs leaves their alignment alone.
function firstSelectedParagraph(editor: Editor): Paragraph | undefined {
    const [entry] = Editor.nodes(editor, { match: isParagraph, mode: 'lowest' });
    return entry?.[0];
}

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
    insertVariable: (variableId: string, itemPath?: string) => void;
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
            const paragraph = firstSelectedParagraph(editor);
            setTextAttributes({
                bold: marks?.bold === true,
                italic: marks?.italic === true,
                underline: marks?.underline === true,
                strikethrough: marks?.strikethrough === true,
                uppercase: marks?.uppercase === true,
                textColor: (marks?.color as string) || '#000000',
                fontSize: marks?.fontSize ? parseInt(marks.fontSize as string) : 16,
                fontFamily: (marks?.fontFamily as string) || 'Roboto',
                ...(paragraph ? getParagraphStyle(paragraph) : {}),
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

            if (attributes.strikethrough && !marks?.strikethrough) {
                Editor.addMark(editor, 'strikethrough', true);
            } else if (!attributes.strikethrough && marks?.strikethrough) {
                Editor.removeMark(editor, 'strikethrough');
            }

            if (attributes.uppercase && !marks?.uppercase) {
                Editor.addMark(editor, 'uppercase', true);
            } else if (!attributes.uppercase && marks?.uppercase) {
                Editor.removeMark(editor, 'uppercase');
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

            // Apply paragraph formatting to every paragraph in the selection.
            // Not gated on `syncSelection`: when syncing from the editor the
            // values were just read from this paragraph, so nothing differs.
            const paragraph = firstSelectedParagraph(editor);
            if (paragraph) {
                const current = getParagraphStyle(paragraph);
                if (current.textAlign !== attributes.textAlign) {
                    Transforms.setNodes(editor, { align: attributes.textAlign }, { match: isParagraph, mode: 'lowest' });
                }
                if (current.lineHeight !== attributes.lineHeight) {
                    Transforms.setNodes(editor, { lineHeight: attributes.lineHeight }, { match: isParagraph, mode: 'lowest' });
                }
            }

            // Apply styles to variable nodes in selection
            if(syncSelection) return;
            Transforms.setNodes(
                editor,
                {
                    bold: attributes.bold,
                    italic: attributes.italic,
                    underline: attributes.underline,
                    strikethrough: attributes.strikethrough,
                    uppercase: attributes.uppercase,
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

        insertVariable: (variableId: string, itemPath?: string) => {
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
                strikethrough: marks?.strikethrough === true,
                uppercase: marks?.uppercase === true,
                fontFamily: marks?.fontFamily as string | undefined,
                fontSize: marks?.fontSize as string | undefined,
                color: marks?.color as string | undefined,
            };

            const variable: VariableElement = {
                ...markStyles,
                type: 'variable',
                variableId: variableId,
                // Left unset for a presentation-wide reference, which is what
                // resolves against the variable's own value at export.
                ...(itemPath !== undefined ? { itemPath } : {}),
                children: [{ text: '' }],
            };
            const textNode: CustomText = { 
                ...markStyles,
                text: ' ' 
            };

            Transforms.insertNodes(editor, [variable, textNode]);
        }
    });