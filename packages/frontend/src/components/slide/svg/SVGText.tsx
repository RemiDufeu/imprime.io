import type { TextBoxShape } from '@imprime/sdk'
import { getSlideContentWrapperStyles } from '@imprime/sdk'
import TextBoxEditor from '../../TextEditor/TextBoxEditor'
import { useMemo, useEffect } from 'react';
import { withVariables } from '../../TextEditor/withVariables';
import { withLists } from '../../TextEditor/withLists';
import { withReact, ReactEditor } from 'slate-react';
import { withHistory } from 'slate-history';
import { createEditor } from 'slate';
import { useEditorStore } from '../../../store/editor/EditorStore';
import { replaceEditorContent } from '../../../utils/paragraphs';

interface SVGTextProps {
  shape: TextBoxShape
  readonly?: boolean
}

// The editing session itself — when it begins and ends, and committing what
// was typed — lives in the store (TextEditorSlice). This component only hands
// it its editor, puts the focus in it, and keeps the content in step with the
// document while the box is not being edited.
export function SVGText({ shape, readonly }: SVGTextProps) {
  const localEditor = useMemo(() => withLists(withVariables(withHistory(withReact(createEditor())))), []);

  const currentEditor = useEditorStore(state => state.editor)
  const isSelected = useEditorStore(state => state.selectedShapeId === shape.id)
  const beginTextSession = useEditorStore(state => state.beginTextSession)
  const endTextSession = useEditorStore(state => state.endTextSession)
  const setIsFocused = useEditorStore(state => state.setIsFocused)
  const syncFromEditor = useEditorStore(state => state.syncFromEditor)

  const isDragging = useEditorStore(state => !!state.dragData)
  const isTransforming = useEditorStore(state => !!state.transformationData)
  const isInteracting = isDragging || isTransforming

  const isActive = currentEditor === localEditor
  const isReadOnly = readonly || !isActive || !isSelected;
  const isTopAligned = (shape.verticalAlign ?? 'top') === 'top';

  // While not edited, follow the document: Slate reads its value on mount
  // only, and an undo or redo can replace this text.
  useEffect(() => {
    if (!readonly && !isActive) replaceEditorContent(localEditor, shape.paragraphes)
  }, [readonly, isActive, localEditor, shape.paragraphes])

  // Selecting a text box edits it (e.g. right after drawing it).
  useEffect(() => {
    if (isSelected && !readonly && currentEditor === null) {
      beginTextSession(shape.id, localEditor)
    }
  }, [isSelected, readonly, currentEditor, shape.id, localEditor, beginTextSession])

  // Focus once the editable is rendered, which is after the state change.
  useEffect(() => {
    if (isActive && !isReadOnly) {
      setTimeout(() => {
        setIsFocused(true);
        try {
          ReactEditor.focus(localEditor);
        } catch (e) {
          console.error('Failed to focus editor:', e)
        }
      }, 0)
    }
  }, [isActive, isReadOnly, localEditor, setIsFocused])

  // Unmounted while edited — the page closed, the shape went away: the store
  // still commits the typing (to whichever slide the box is on) and releases
  // the editor, which shortcuts would otherwise keep aiming at.
  useEffect(() => () => {
    if (useEditorStore.getState().editor === localEditor) endTextSession()
  }, [localEditor, endTextSession])

  const handleClick = isSelected ? ((e: React.MouseEvent) => {
    e.stopPropagation()
    beginTextSession(shape.id, localEditor)
    // A middle- or bottom-aligned editable does not fill the box, so a click
    // in the empty part blurs it; give focus back, at the last selection.
    // No-op when the click landed in the text and the editor is focused.
    if (!isTopAligned) {
      try {
        ReactEditor.focus(localEditor)
      } catch (err) {
        console.error('Failed to focus editor:', err)
      }
    }
  }) : undefined

  // An inactive editor only changes when its content is reloaded; that is
  // not a selection the text bar should follow.
  const handleEditorChange = () => {
    if (isActive) syncFromEditor()
  }

  const contentKey = readonly ? JSON.stringify(shape.paragraphes) : 'editing';

  return (
    <foreignObject
      key={contentKey}
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      onClick={handleClick}
      style={{
        cursor: isSelected ? 'text' : 'unset',
        overflow: 'visible',
        pointerEvents: isInteracting ? 'none' : 'auto',
        userSelect: isInteracting ? 'none' : 'auto',
      }}>
      <div style={getSlideContentWrapperStyles(shape.verticalAlign)}>
        <TextBoxEditor
          editor={localEditor}
          readonly={isReadOnly}
          fillHeight={isTopAligned}
          initialContent={shape.paragraphes}
          onChange={handleEditorChange}
          onFocus={() => beginTextSession(shape.id, localEditor)}
        />
      </div>
    </foreignObject>
  )
}
