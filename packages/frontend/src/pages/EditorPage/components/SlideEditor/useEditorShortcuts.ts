import { useEffect, type RefObject } from 'react'
import { Range } from 'slate'
import { useEditorStore } from '../../../../store/editor/EditorStore'
import { isModChord, isRedoHotkey, isUndoHotkey } from '../../../../utils/hotkeys'

// Arrow keys move the selection by this much, or by the large step with Shift.
const NUDGE_STEP = 1
const NUDGE_STEP_LARGE = 10

// Written to the system clipboard by a shape copy, holding that copy's token.
// A paste that finds it knows the last thing copied was the editor's shape,
// not text or an image copied elsewhere since.
const SHAPE_CLIPBOARD_TYPE = 'application/x-imprime-shape'

// Replace the system clipboard with the shape marker. A synthetic copy is the
// one way to write a custom type that browsers allow with nothing selected.
function writeShapeMarker(token: string) {
    const onCopy = (e: ClipboardEvent) => {
        e.clipboardData?.setData(SHAPE_CLIPBOARD_TYPE, token)
        e.preventDefault()
    }
    document.addEventListener('copy', onCopy)
    try {
        // Deprecated, but the async Clipboard API takes no custom types
        // outside Chromium; recheck when `ClipboardItem` accepts them.
        document.execCommand('copy')
    } finally {
        document.removeEventListener('copy', onCopy)
    }
}

// True when the rich-text editor holds focus with a non-collapsed selection —
// in that case native copy/paste should own the event so the browser handles
// the text selection.
function isTextSelectionActive(): boolean {
    const { isFocused, editor } = useEditorStore.getState()
    if (!isFocused || !editor) return false
    const selection = editor.selection
    return selection !== null && !Range.isCollapsed(selection)
}

function isFormFieldTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    const tag = target.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    if (target.isContentEditable) return true
    return isFormFieldTarget(target)
}

// Keys pressed with nothing focused, or with focus inside the editor. Modals,
// dropdowns and popovers are portaled out of it, so a Backspace typed in one
// never deletes the selected shape.
function isEditorTarget(target: EventTarget | null, editorRoot: HTMLElement | null): boolean {
    if (target === document.body) return true
    return target instanceof Node && editorRoot !== null && editorRoot.contains(target)
}

export function useEditorShortcuts(editorRootRef: RefObject<HTMLElement | null>) {
    useEffect(() => {
        // Whether the paste event followed Ctrl+V. Some browsers send none
        // when nothing editable has focus; the editor's own copy then pastes.
        let pasteHandled = false

        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isEditorTarget(e.target, editorRootRef.current)) return

            const store = useEditorStore.getState()
            const selectedId = store.selectedShape?.id ?? null
            const isMod = isModChord(e)
            const key = e.key.toLowerCase()
            const inFormField = isFormFieldTarget(e.target)
            const inEditable = isEditableTarget(e.target)

            // In a field, undo belongs to the field; in a text box, the text
            // editor has already routed it.
            if (isUndoHotkey(e) || isRedoHotkey(e)) {
                if (inEditable) return
                e.preventDefault()
                // Mid-gesture, the drop would write over whatever undo restored.
                if (store.dragData || store.isDrawing) return
                if (isUndoHotkey(e)) store.undo()
                else store.redo()
                return
            }

            if (e.key === 'Escape') {
                if (inFormField) return
                if (store.isDrawing) {
                    store.cancelDrawing()
                } else if (store.selectedTool !== 'move') {
                    store.setTool('move')
                } else if (selectedId) {
                    // Also ends text editing; the text commits on its way out.
                    store.selectShape(null)
                }
                return
            }

            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !inEditable && !store.isFocused) {
                e.preventDefault()
                store.deleteShape(selectedId)
                return
            }

            if (isMod && key === 'c') {
                if (inFormField) return
                if (isTextSelectionActive()) return
                if (!selectedId) return
                e.preventDefault()
                store.copyShape(selectedId)
                const token = useEditorStore.getState().clipboard?.token
                if (token) writeShapeMarker(token)
                return
            }

            if (isMod && key === 'x') {
                if (inEditable) return
                if (!selectedId) return
                e.preventDefault()
                store.cutShape(selectedId)
                const token = useEditorStore.getState().clipboard?.token
                if (token) writeShapeMarker(token)
                return
            }

            if (isMod && key === 'v') {
                if (inEditable) return
                // Not prevented: that would cancel the paste event, the only
                // way to read the system clipboard without a permission prompt.
                pasteHandled = false
                setTimeout(() => {
                    if (!pasteHandled) useEditorStore.getState().pasteShape()
                }, 0)
                return
            }

            if (isMod && key === 'd') {
                if (inEditable) return
                if (!selectedId) return
                e.preventDefault()
                store.duplicateShape(selectedId)
                return
            }

            if (e.key.startsWith('Arrow') && selectedId && !inEditable) {
                e.preventDefault()
                if (isMod) {
                    // Layer order: Ctrl+↑/↓ one step, with Shift all the way.
                    if (e.key === 'ArrowUp') {
                        if (e.shiftKey) store.bringToFront(selectedId)
                        else store.bringForward(selectedId)
                    } else if (e.key === 'ArrowDown') {
                        if (e.shiftKey) store.sendToBack(selectedId)
                        else store.sendBackward(selectedId)
                    }
                    return
                }
                const step = e.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP
                const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
                const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
                store.nudgeShape(selectedId, dx, dy)
                return
            }
        }

        // What was copied last decides: the editor's shape, an image (a
        // screenshot, a copied picture), or text, each becoming a shape.
        const handlePaste = (e: ClipboardEvent) => {
            pasteHandled = true
            if (!isEditorTarget(e.target, editorRootRef.current)) return
            if (isEditableTarget(e.target)) return
            const data = e.clipboardData
            if (!data) return
            e.preventDefault()
            const store = useEditorStore.getState()

            if (data.types.includes(SHAPE_CLIPBOARD_TYPE)) {
                // Another tab's copy: its shape is not in this tab to paste.
                if (data.getData(SHAPE_CLIPBOARD_TYPE) === store.clipboard?.token) store.pasteShape()
                return
            }

            const images = Array.from(data.files).filter(file => file.type.startsWith('image/'))
            if (images.length > 0) {
                void (async () => {
                    for (const image of images) await store.insertImageFile(image)
                })()
                return
            }

            const text = data.getData('text/plain')
            if (text.trim()) {
                store.insertTextBox(text)
                return
            }

            store.pasteShape()
        }

        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('paste', handlePaste)
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('paste', handlePaste)
        }
    }, [editorRootRef])
}
