import type { CustomText, Paragraph, VariableElement } from '@imprime/sdk';
import { getRunTextStyle, PARAGRAPH_SPACING } from '@imprime/sdk';
import { useCallback } from 'react';
import { Editor, type BaseEditor, type Descendant } from 'slate';
import { Slate, Editable, ReactEditor, type RenderLeafProps, type RenderElementProps } from 'slate-react';
import { VariableBlock } from './VariableBlock';
import { ParagraphElement } from './ParagraphElement';
import { ListMarkersProvider } from './ListMarkersProvider';
import { selectionHasListItem, shiftListIndent } from '../../utils/paragraphs';
import { useEditorStore } from '../../store/editor/EditorStore';
import './TextBoxEditor.css';

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
  // Stretch the editable to the full box. Only a top-aligned box can: in a
  // middle- or bottom-aligned one the editable must shrink to its content so
  // the enclosing flex column can place it.
  fillHeight?: boolean;
  onValueChange?: (descendants: Descendant[]) => void;
  onChange?: (descendants: Descendant[]) => void;
  onFocus?: () => void
};

export const TextBoxEditor = ({ initialContent, editor, readonly, fillHeight = true, onValueChange, onChange, onFocus }: VariableEditorProps) => {
  const fontCatalog = useEditorStore(state => state.fontCatalog);

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
        return <ParagraphElement {...props} element={props.element}/>;
    }
  }, []);

  // The face comes from the catalog, as in the PDF; no <strong>/<em> around
  // the text, which would ask the browser for a weight the catalog ruled out.
  const renderLeaf = useCallback((props: RenderLeafProps) => {
    const style: React.CSSProperties = getRunTextStyle(props.leaf, fontCatalog);
    if (props.leaf.color) {
      style.color = props.leaf.color;
    }

    return <span {...props.attributes} style={style}>{props.children}</span>;
  }, [fontCatalog]);

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
      <ListMarkersProvider>
        <Editable
          style={{
            width: '100%',
            height: fillHeight ? '100%' : 'auto',
            outline: 'none',
            // Read by `.text-box-paragraph`; the constant is shared with the PDF export.
            ['--paragraph-spacing' as string]: `${PARAGRAPH_SPACING}px`,
          }}
          readOnly={readonly}
          onFocus={() => {onFocus?.()}}
          onKeyDown={(event) => {
            // Tab nests list items; outside a list it keeps its default.
            if (!readonly && event.key === 'Tab' && selectionHasListItem(editor)) {
              event.preventDefault();
              shiftListIndent(editor, event.shiftKey ? -1 : 1);
            }
          }}
          renderElement={renderElement}
          renderLeaf={renderLeaf}
          placeholder="Insert some text"
        />
      </ListMarkersProvider>
    </Slate>
  );
};

export default TextBoxEditor;