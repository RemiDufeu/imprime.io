import { Editor, Transforms, type BaseSelection, Element } from "slate";
import type { StateCreator } from "zustand";
import type { ToolAttributesSlice } from "./ToolAttributeSlice";
import type { CustomText, VariableElement } from "@imprime/sdk";
import { DEFAULT_FONT, DEFAULT_FONT_SIZE, getListStyle, getParagraphStyle } from "@imprime/sdk";
import { firstSelectedParagraph, isParagraph, setParagraphList, shiftListIndent } from "../../utils/paragraphs";

export interface RichTextEditorSlice {
    editor: Editor | null;
    isFocused: boolean;
    lastSelection: BaseSelection;
    syncSelection: boolean
    // Depth of the active editor's own history. Slate keeps it on the editor,
    // outside the store; mirrored here so the undo/redo buttons can follow it.
    textHistory: { undos: number; redos: number };
    syncTextHistory: () => void;
    setEditor: (editor: Editor | null) => void;
    setIsFocused: (isFocused: boolean) => void;
    setLastSelection: (selection: BaseSelection) => void;
    syncEditorToAttributes: () => void;
    syncAttributesToEditor: () => void;
    insertVariable: (variableId: string, itemPath?: string) => void;
    // A command rather than an attribute: the level is relative, and each
    // selected item moves from its own.
    changeListIndent: (delta: number) => void;
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
        textHistory: { undos: 0, redos: 0 },
        syncTextHistory: () => {
            const { editor, textHistory } = get();
            const undos = editor?.history.undos.length ?? 0;
            const redos = editor?.history.redos.length ?? 0;
            if (undos !== textHistory.undos || redos !== textHistory.redos) {
                set({ textHistory: { undos, redos } });
            }
        },
        setEditor: (editor) => {
            set({ editor });
            get().syncTextHistory();
        },
        setIsFocused: (isFocused) => set({ isFocused }),
        setLastSelection: (selection) => set({ lastSelection: selection }),
        syncEditorToAttributes: () => {
            const { editor, setTextAttributes } = get();
            if (!editor || !editor.selection) return;
            const marks = Editor.marks(editor);
            const paragraph = firstSelectedParagraph(editor);
            // Raised for the write below only, and lowered whatever happens:
            // left up, it would silence every later toolbar change.
            set({ syncSelection : true })
            try {
                setTextAttributes({
                    bold: marks?.bold === true,
                    italic: marks?.italic === true,
                    underline: marks?.underline === true,
                    strikethrough: marks?.strikethrough === true,
                    uppercase: marks?.uppercase === true,
                    textColor: (marks?.color as string) || '#000000',
                    fontSize: marks?.fontSize ? parseInt(marks.fontSize as string) : DEFAULT_FONT_SIZE,
                    fontFamily: (marks?.fontFamily as string) || DEFAULT_FONT,
                    ...(paragraph ? {
                        ...getParagraphStyle(paragraph),
                        listType: getListStyle(paragraph)?.list ?? 'none',
                    } : {}),
                });
            } finally {
                set({ syncSelection : false })
            }
        },

        syncAttributesToEditor: () => {
            const { editor, attributes, syncSelection } = get();
            if (!editor || !editor.selection) return;
            // The attributes were just read from the editor: writing them back
            // is never a no-op, since an unset mark reads as its default and
            // would come back as an explicit one — a text change the user did
            // not make, recorded in the text's undo history.
            if (syncSelection) return;

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
            const paragraph = firstSelectedParagraph(editor);
            if (paragraph) {
                const current = getParagraphStyle(paragraph);
                if (current.textAlign !== attributes.textAlign) {
                    Transforms.setNodes(editor, { align: attributes.textAlign }, { match: isParagraph, mode: 'lowest' });
                }
                if (current.lineHeight !== attributes.lineHeight) {
                    Transforms.setNodes(editor, { lineHeight: attributes.lineHeight }, { match: isParagraph, mode: 'lowest' });
                }
                const currentList = getListStyle(paragraph)?.list ?? 'none';
                if (currentList !== attributes.listType) {
                    setParagraphList(editor, attributes.listType === 'none' ? null : attributes.listType);
                }
            }

            // Apply styles to variable nodes in selection
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
        },

        changeListIndent: (delta: number) => {
            const { editor } = get();
            if (!editor || !editor.selection) return;
            shiftListIndent(editor, delta);
        }
    });