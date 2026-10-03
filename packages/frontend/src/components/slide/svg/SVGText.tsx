import type { TextBoxShape, Paragraph } from '@imprime/sdk'
import { getSlideContentWrapperStyles } from '@imprime/sdk'
import TextBoxEditor from '../../TextEditor/TextBoxEditor'
import { useMemo, useEffect, useRef } from 'react';
import { withVariables } from '../../TextEditor/withVariables';
import { withLists } from '../../TextEditor/withLists';
import { withReact, ReactEditor } from 'slate-react';
import { withHistory } from 'slate-history';
import { createEditor, type Descendant } from 'slate';
import { useEditorStore } from '../../../store/editor/EditorStore';
import { toEditorValue } from '../../../utils/paragraphs';

// Typing then undoing it leaves new arrays with the old content: compare by
// value once the references differ.
const hasTextChanged = (current: Descendant[], start: Descendant[] | null) =>
  current !== start && JSON.stringify(current) !== JSON.stringify(start)

interface SVGTextProps {
  shape: TextBoxShape
  readonly?: boolean
}

export function SVGText({ shape, readonly }: SVGTextProps) {
  const localEditor = useMemo(() => withLists(withVariables(withHistory(withReact(createEditor())))), []);

  const currentEditor = useEditorStore(state => state.editor)
  const setEditor = useEditorStore(state => state.setEditor)
  const setIsFocused = useEditorStore(state => state.setIsFocused)
  const setLastSelection = useEditorStore(state => state.setLastSelection)
  const selectedShape = useEditorStore(state => state.selectedShape)
  const syncEditorToAttributes = useEditorStore(state => state.syncEditorToAttributes)
  const syncAttributesToEditor = useEditorStore(state => state.syncAttributesToEditor)
  const syncTextHistory = useEditorStore(state => state.syncTextHistory)
  const updateShape = useEditorStore(state => state.updateShape)

  const isDragging = useEditorStore(state => !!state.dragData)
  const isTransforming = useEditorStore(state => !!state.transformationData)
  const isInteracting = isDragging || isTransforming

  const isSelected = selectedShape?.id === shape.id
  const isReadOnly = readonly || currentEditor !== localEditor || !isSelected;
  const isTopAligned = (shape.verticalAlign ?? 'top') === 'top';
  const wasActiveRef = useRef(false);
  // The editor's content when the current editing session began.
  const sessionStartRef = useRef<Descendant[] | null>(null);
  // The stored paragraphs the editor's content came from: tells an outside
  // change (undo, redo) apart from this editor's own commit coming back.
  const loadedRef = useRef(shape.paragraphes);

  // Auto-activate editor when text shape becomes selected without an active editor (e.g. right after creation)
  useEffect(() => {
    if (isSelected && !readonly && currentEditor === null) {
      setEditor(localEditor)
      syncEditorToAttributes()
    }
  }, [isSelected, readonly, currentEditor, localEditor, setEditor, syncEditorToAttributes])

  // Set time out required in order to focus after the state changement when local editor is available
  useEffect(() => {
    if (currentEditor === localEditor && !isReadOnly) {
      if (!wasActiveRef.current) {
        wasActiveRef.current = true;
        sessionStartRef.current = localEditor.children;
        // Earlier sessions are steps of the canvas history; text undo only
        // walks back through this one.
        localEditor.history = { undos: [], redos: [] };
        syncTextHistory();
      }
      setTimeout(() => {
        setIsFocused(true);
        try {
          ReactEditor.focus(localEditor);
        } catch (e) {
          console.error('Failed to focus editor:', e)
        }
      }, 0)
    }
  }, [currentEditor, localEditor, isReadOnly, setIsFocused, syncTextHistory])

  // Once the editor is let go: commit the session if it changed the text,
  // otherwise pick up any outside change to it. One effect, so the order is
  // fixed — an undo that replaced this text must not be read as typing.
  useEffect(() => {
    if (readonly || currentEditor === localEditor) return
    if (wasActiveRef.current) {
      wasActiveRef.current = false;
      setIsFocused(false);
      if (hasTextChanged(localEditor.children, sessionStartRef.current)) {
        loadedRef.current = localEditor.children as Paragraph[];
        updateShape(shape.id, { paragraphes: loadedRef.current });
        return;
      }
    }
    // Slate reads its value on mount only, so an undo or redo of this text
    // has to be loaded by hand.
    if (shape.paragraphes !== loadedRef.current) {
      loadedRef.current = shape.paragraphes;
      localEditor.children = toEditorValue(shape.paragraphes);
      localEditor.selection = null;
      localEditor.history = { undos: [], redos: [] };
      localEditor.onChange();
    }
  }, [readonly, currentEditor, localEditor, shape.id, shape.paragraphes, updateShape, setIsFocused])

  // Unmounted mid-session — its slide was left, or the editor closed — the
  // effect above never runs. Commit the typing here (`updateShape` finds the
  // slide the box is on), and release the editor and the focus flag, which
  // would otherwise keep shortcuts aimed at a detached editor.
  useEffect(() => () => {
    if (!wasActiveRef.current) return
    wasActiveRef.current = false
    if (hasTextChanged(localEditor.children, sessionStartRef.current)) {
      updateShape(shape.id, { paragraphes: localEditor.children as Paragraph[] })
    }
    const store = useEditorStore.getState()
    if (store.editor === localEditor) {
      store.setEditor(null)
      store.setIsFocused(false)
    }
  }, [localEditor, shape.id, updateShape])

  // Subscribe to attributes changes and sync them to the editor
  useEffect(() => {
    const unsubscribe = useEditorStore.subscribe(
      (state) => state.attributes,
      (_) => {
        if (currentEditor === localEditor && !isReadOnly) {
          syncAttributesToEditor()
          try {
            ReactEditor.focus(localEditor)
          } catch (e) {
            console.error('Failed to refocus editor after style change:', e)
          }
        }
      }
    )

    return unsubscribe
  }, [currentEditor, localEditor, isReadOnly, syncAttributesToEditor])

  const handleClick = isSelected ? ((e: React.MouseEvent) => {
    e.stopPropagation()
    setEditor(localEditor)
    syncEditorToAttributes()
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

  const handleEditorChange = () => {
    // An inactive editor only changes when its content is reloaded; that is
    // not a selection the toolbar should follow.
    if (currentEditor !== localEditor) return
    syncTextHistory()
    const selection = localEditor.selection;
    setLastSelection(selection);
    syncEditorToAttributes()
  }

  const handleEditorFocus = () => {
    setEditor(localEditor)
    syncEditorToAttributes()
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
          onFocus={handleEditorFocus}
        />
      </div>
    </foreignObject>
  )
}
