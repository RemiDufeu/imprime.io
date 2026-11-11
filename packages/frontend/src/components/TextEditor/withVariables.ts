import { Editor } from "slate";
import type { CustomElement } from "./TextBoxEditor";

const isInlineElement = (element: CustomElement) =>
  element.type === 'variable' || element.type === 'page-number';

// Enhance the editor to recognize the inline elements — a variable, a page
// number — as inline and void
export const withVariables = (editor: Editor) => {
  const { isInline, isVoid } = editor;

  editor.isInline = (element: CustomElement) => {
    return isInlineElement(element) ? true : isInline(element);
  };

  editor.isVoid = (element: CustomElement) => {
    return isInlineElement(element) ? true : isVoid(element);
  };

  return editor;
};
