import { Editor } from "slate";
import type { CustomElement } from "./TextBoxEditor";

// Enhance the editor to recognize VariableElement as inline and void
export const withVariables = (editor: Editor) => {
  const { isInline, isVoid } = editor;

  editor.isInline = (element: CustomElement) => {
    return element.type === 'variable' ? true : isInline(element);
  };

  editor.isVoid = (element: CustomElement) => {
    return element.type === 'variable' ? true : isVoid(element);
  };

  return editor;
};
