import { Editor, Transforms } from "slate";
import type { ListType } from "@imprime/sdk";
import { getListStyle } from "@imprime/sdk";
import {
  isCaretAtParagraphStart,
  paragraphAtCaret,
  setParagraphList,
  shiftListIndent,
  textBeforeCaret,
} from "../../utils/paragraphs";

// Typed at the start of a plain paragraph and followed by a space, these turn
// it into a list item. A Map, not an object literal, so typed text cannot hit
// a prototype key.
const LIST_SHORTCUTS = new Map<string, ListType>([
  ['-', 'bullet'],
  ['*', 'bullet'],
  ['1.', 'number'],
]);

// Word-processor list editing. Enter on a non-empty item needs nothing here:
// Slate's split copies the paragraph's properties, so the new paragraph is an
// item of the same list and level.
export const withLists = (editor: Editor) => {
  const { insertBreak, deleteBackward, insertText } = editor;

  // Enter on an empty item steps out: one level up, or out of the list.
  editor.insertBreak = () => {
    const entry = paragraphAtCaret(editor);
    const style = entry ? getListStyle(entry[0]) : null;

    if (entry && style && Editor.isEmpty(editor, entry[0])) {
      if (style.level > 0) {
        shiftListIndent(editor, -1);
      } else {
        setParagraphList(editor, null);
      }
      return;
    }

    insertBreak();
  };

  // Backspace at the start of an item removes its marker; a second one then
  // merges with the previous paragraph as usual.
  editor.deleteBackward = (unit) => {
    const entry = paragraphAtCaret(editor);

    if (entry && getListStyle(entry[0]) && isCaretAtParagraphStart(editor, entry)) {
      setParagraphList(editor, null);
      return;
    }

    deleteBackward(unit);
  };

  editor.insertText = (text, options) => {
    const { selection } = editor;
    // Only typing at the caret: an insertion targeted elsewhere (`options.at`)
    // is programmatic.
    const entry = text === ' ' && !options?.at ? paragraphAtCaret(editor) : undefined;

    if (selection && entry && !getListStyle(entry[0])) {
      const typed = textBeforeCaret(editor, entry);
      const list = typed !== undefined ? LIST_SHORTCUTS.get(typed) : undefined;
      if (list) {
        Transforms.delete(editor, { at: { anchor: Editor.start(editor, entry[1]), focus: selection.anchor } });
        setParagraphList(editor, list);
        return;
      }
    }

    insertText(text, options);
  };

  return editor;
};
