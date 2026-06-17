import type { TextBoxShape, Paragraph } from '@imprime/sdk'
import { getSlideContentWrapperStyles } from '@imprime/sdk'
import TextBoxEditor from '../../TextEditor/TextBoxEditor'
import { useMemo, useEffect, useRef } from 'react';
import { withVariables } from '../../TextEditor/withVariables';
import { withReact, ReactEditor } from 'slate-react';
import { createEditor } from 'slate';
import { useEditorStore } from '../../../store/editor/EditorStore';

interface SVGTextProps {
  shape: TextBoxShape
  readonly?: boolean
}

export function SVGText({ shape, readonly }: SVGTextProps) {
  const localEditor = useMemo(() => withVariables(withReact(createEditor())), []);

  const currentEditor = useEditorStore(state => state.editor)
  const setEditor = useEditorStore(state => state.setEditor)
  const setIsFocused = useEditorStore(state => state.setIsFocused)
  const setLastSelection = useEditorStore(state => state.setLastSelection)
  const selectedShape = useEditorStore(state => state.selectedShape)
  const syncEditorToAttributes = useEditorStore(state => state.syncEditorToAttributes)
  const syncAttributesToEditor = useEditorStore(state => state.syncAttributesToEditor)
  const updateShape = useEditorStore(state => state.updateShape)

  const isDragging = useEditorStore(state => !!state.dragData)
  const isTransforming = useEditorStore(state => !!state.transformationData)
  const isInteracting = isDragging || isTransforming

  const isSelected = selectedShape?.id === shape.id
  const isReadOnly = readonly || currentEditor !== localEditor || !isSelected;
  const wasActiveRef = useRef(false);

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
      setTimeout(() => {
        wasActiveRef.current = true;
        setIsFocused(true);
        try {
          ReactEditor.focus(localEditor);
        } catch (e) {
          console.error('Failed to focus editor:', e)
        }
      }, 0)
    }
  }, [currentEditor, localEditor, isReadOnly, setIsFocused])

  // Save when editor loses focus
  useEffect(() => {
    if (wasActiveRef.current && currentEditor !== localEditor) {
      updateShape(shape.id, {
        paragraphes: localEditor.children as Paragraph[]
      })
      wasActiveRef.current = false;
      setIsFocused(false);
    }
  }, [currentEditor, localEditor, shape.id, updateShape, setIsFocused])

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
  }) : undefined

  const handleEditorChange = () => {
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
      <div style={getSlideContentWrapperStyles()}>
        <TextBoxEditor
          editor={localEditor}
          readonly={isReadOnly}
          initialContent={shape.paragraphes}
          onChange={handleEditorChange}
          onFocus={handleEditorFocus}
        />
      </div>
    </foreignObject>
  )
}
