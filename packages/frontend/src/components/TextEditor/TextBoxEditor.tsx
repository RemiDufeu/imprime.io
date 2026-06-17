import type { CustomText, Paragraph, VariableElement } from '@imprime/sdk';
import { useCallback } from 'react';
import { Editor, type BaseEditor, type Descendant } from 'slate';
import { Slate, Editable, ReactEditor, type RenderLeafProps, type RenderElementProps } from 'slate-react';
import { VariableBlock } from './VariableBlock';

export type CustomElement = VariableElement | Paragraph;

declare module 'slate' {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor;
    Element: CustomElement;
    Text: CustomText;
  }
}

export type CustomRenderLeafProps = RenderLeafProps & {
  leaf: CustomText;
};

export type CustomRenderElementProps = RenderElementProps & {
  element: VariableElement;
};

export type VariableEditorProps = {
  initialContent?: Descendant[];
  editor: Editor;
  readonly?: boolean;
  onValueChange?: (descendants: Descendant[]) => void;
  onChange?: (descendants: Descendant[]) => void;
  onFocus?: () => void
};

export const TextBoxEditor = ({ initialContent, editor, readonly, onValueChange, onChange, onFocus }: VariableEditorProps) => {

  const initialValue: Descendant[] = initialContent?.length ? initialContent : [
    {
      type: 'paragraph',
      children: [{ text: '' }],
    },
  ];

  const renderElement = useCallback((props: RenderElementProps) => {
    switch (props.element.type) {
      case 'variable':
        return <VariableBlock {...props} element={props.element as VariableElement}/>;
      default:
        return <p {...props.attributes} style={{ margin: 0, marginBottom: 8 }}>{props.children}</p>;
    }
  }, []);

  const renderLeaf = useCallback((props: RenderLeafProps) => {
    let { children } = props;

    if (props.leaf.bold) {
      children = <strong>{children}</strong>;
    }

    if (props.leaf.italic) {
      children = <em>{children}</em>;
    }

    if (props.leaf.underline) {
      children = <u>{children}</u>;
    }

    const style: React.CSSProperties = {};
    if (props.leaf.color) {
      style.color = props.leaf.color;
    }

    if (props.leaf.fontSize) {
      style.fontSize = props.leaf.fontSize;
    }

    if (props.leaf.fontFamily) {
      style.fontFamily = props.leaf.fontFamily;
    }

    if (props.leaf.bold) {
      style.fontWeight = 'bold';
    }

    if (props.leaf.italic) {
      style.fontStyle = 'italic';
    }

    return <span {...props.attributes} style={style}>{children}</span>;
  }, []);

  return (
    <Slate
      editor={editor}
      initialValue={initialValue}
      onChange={(newValue) => {
        onChange?.(newValue);
      }}
      onValueChange={(newValue) => {
        onValueChange?.(newValue);
      }}
    >
      <Editable
        style={{
          width: '100%',
          height: '100%',
          outline: 'none',
        }}
        readOnly={readonly}
        onFocus={() => {onFocus?.()}}
        renderElement={renderElement}
        renderLeaf={renderLeaf}
        placeholder="Insert some text"
      />
    </Slate>
  );
};

export default TextBoxEditor;