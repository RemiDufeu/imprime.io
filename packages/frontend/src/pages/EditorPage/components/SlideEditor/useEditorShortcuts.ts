import { useEffect } from 'react'
import { Range } from 'slate'
import { useEditorStore } from '../../../../store/editor/EditorStore'

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

export function useEditorShortcuts() {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const store = useEditorStore.getState()
            const selectedId = store.selectedShape?.id ?? null
            const isMod = e.ctrlKey || e.metaKey
            const inFormField = isFormFieldTarget(e.target)
            const inEditable = isEditableTarget(e.target)

            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && !inEditable && !store.isFocused) {
                e.preventDefault()
                store.deleteShape(selectedId)
                return
            }

            if (isMod && (e.key === 'c' || e.key === 'C')) {
                if (inFormField) return
                if (isTextSelectionActive()) return
                if (!selectedId) return
                e.preventDefault()
                store.copyShape(selectedId)
                return
            }

            if (isMod && (e.key === 'v' || e.key === 'V')) {
                if (inEditable) return
                if (!store.clipboardShape) return
                e.preventDefault()
                store.pasteShape()
                return
            }

            if (isMod && (e.key === 'd' || e.key === 'D')) {
                if (inEditable) return
                if (!selectedId) return
                e.preventDefault()
                store.duplicateShape(selectedId)
                return
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [])
}
