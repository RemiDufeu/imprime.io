import type { Shape, Page, VariableData } from '@imprime/sdk'
import type { StateCreator } from 'zustand'
import { message } from 'antd'
import type { TemplateSlice } from './TemplateSlice'
import type { PageSlice } from './PageSlice'
import type { SelectionSlice } from './SelectionSlice'
import type { DocumentWriteSlice } from './DocumentWriteSlice'
import type { TextEditorSlice } from './TextEditorSlice'
import type { VariableSlice } from './VariableSlice'
import { parseApiError } from '../../utils/apiError'

// Steps kept per direction. A shape-tree step shares every branch it did not
// touch with the live tree, so the cost is what each step rebuilt.
const MAX_HISTORY = 100

// Writes with the same merge key closer together than this are one step: a
// colour dragged across the picker, an arrow key held down.
const MERGE_WINDOW_MS = 500

export interface PageSnapshot {
    page: Page
    index: number
}

// The state one step restores. Undo and redo swap the live state for the
// stored one, so the same entry serves both stacks.
export type HistoryEntry =
    // A page's shape tree, and the shape to select again.
    | { kind: 'shapes'; pageId: string; shapes: Shape[]; selection: string | null }
    // Whether a page exists. A snapshot brings it back under the same id, at
    // the same place, with the same shapes; null removes it.
    | { kind: 'page'; pageId: string; snapshot: PageSnapshot | null }
    | { kind: 'page-order'; pageIds: string[] }
    | { kind: 'title'; title: string }
    // A variable's definition; null removes it. It comes back under the same
    // id, because text runs and containers point to that id.
    | { kind: 'variable'; variableId: string; snapshot: VariableData | null }

export interface HistoryStep {
    entry: HistoryEntry
    mergeKey?: string
    at: number
}

export interface HistorySlice {
    undoStack: HistoryStep[]
    redoStack: HistoryStep[]
    // Both go to the text being edited first, while it has steps of its own.
    // Steps that reach the API run one at a time, in order.
    undo: () => Promise<void>
    redo: () => Promise<void>
    clearHistory: () => void
    // Called by the actions that change the document, once their change is in.
    _recordHistory: (entry: HistoryEntry, mergeKey?: string) => void
}

type Stack = 'undoStack' | 'redoStack'

export const createHistorySlice: StateCreator<
    HistorySlice & TemplateSlice & PageSlice & SelectionSlice & DocumentWriteSlice & TextEditorSlice & VariableSlice,
    [],
    [],
    HistorySlice
> = (set, get) => {
    let queue: Promise<void> = Promise.resolve()

    const setStack = (stack: Stack, steps: HistoryStep[]) =>
        set(stack === 'undoStack' ? { undoStack: steps } : { redoStack: steps })

    // Bring the document to the state `entry` describes, and return the entry
    // that brings it back to the state it is in now — or null when `entry` no
    // longer applies (its page is gone, or it already holds).
    const apply = async (entry: HistoryEntry): Promise<HistoryEntry | null> => {
        const { template } = get()
        if (!template) return null

        switch (entry.kind) {
            case 'shapes': {
                const index = template.pages.findIndex(s => s._id === entry.pageId)
                if (index === -1) return null
                const inverse = { ...entry, shapes: template.pages[index].shapes }
                const { currentPageIndex, selectPage, _writePageShapes, selectShape } = get()
                if (index !== currentPageIndex) selectPage(index)
                _writePageShapes(entry.pageId, entry.shapes)
                selectShape(entry.selection)
                return inverse
            }
            case 'page': {
                const index = template.pages.findIndex(s => s._id === entry.pageId)
                const inverse = {
                    ...entry,
                    snapshot: index === -1 ? null : { page: template.pages[index], index },
                }
                if (entry.snapshot) {
                    if (index !== -1) return null
                    await get()._insertPage(entry.snapshot.index, entry.snapshot.page)
                } else {
                    if (index === -1) return null
                    await get()._removePage(entry.pageId)
                }
                return inverse
            }
            case 'page-order': {
                const inverse: HistoryEntry = { kind: 'page-order', pageIds: template.pages.map(s => s._id) }
                await get()._applyPageOrder(entry.pageIds)
                return inverse
            }
            case 'title': {
                const inverse: HistoryEntry = { kind: 'title', title: template.title }
                await get()._saveTitle(entry.title)
                return inverse
            }
            case 'variable': {
                const current = template.variableData?.find(v => v._id === entry.variableId) ?? null
                const inverse = { ...entry, snapshot: current }
                await get()._restoreVariable(entry.variableId, entry.snapshot)
                return inverse
            }
        }
    }

    // Pop the newest step that still applies off one stack, apply it, and push
    // its inverse onto the other. A step the server refuses (4xx: a page id
    // taken, a variable gone) would be refused again and block every step
    // under it, so it is dropped; any other failure (network, 5xx) puts it
    // back where it was, to be tried again.
    const replay = async (from: Stack) => {
        const to: Stack = from === 'undoStack' ? 'redoStack' : 'undoStack'
        for (;;) {
            const step = get()[from].at(-1)
            if (!step) return
            setStack(from, get()[from].slice(0, -1))

            let inverse: HistoryEntry | null
            try {
                inverse = await apply(step.entry)
            } catch (err) {
                console.error('History step failed:', err)
                const { status, message: detail } = parseApiError(err)
                const action = from === 'undoStack' ? 'Undo' : 'Redo'
                if (status !== undefined && status >= 400 && status < 500) {
                    message.error(`${action} skipped a step that can no longer apply${detail ? `: ${detail}` : ''}`)
                    continue
                }
                setStack(from, [...get()[from], step])
                message.error(`${action} failed${detail ? `: ${detail}` : ''}`)
                return
            }
            if (inverse) {
                setStack(to, [...get()[to], { entry: inverse, at: 0 }])
                return
            }
        }
    }

    const enqueue = (from: Stack) => {
        // A step that throws past `replay` must not stall every later one.
        queue = queue.then(() => replay(from)).catch(err => console.error('History replay failed:', err))
        return queue
    }

    return {
        undoStack: [],
        redoStack: [],

        undo: () => {
            const { editor } = get()
            if (editor && editor.history.undos.length > 0) {
                editor.undo()
                return Promise.resolve()
            }
            return enqueue('undoStack')
        },

        redo: () => {
            const { editor } = get()
            if (editor) {
                if (editor.history.redos.length > 0) {
                    editor.redo()
                    return Promise.resolve()
                }
                // Uncommitted typing is newer than anything on the redo stack:
                // replaying past it would be overwritten when the text commits.
                if (editor.history.undos.length > 0) return Promise.resolve()
            }
            return enqueue('redoStack')
        },

        clearHistory: () => set({ undoStack: [], redoStack: [] }),

        _recordHistory: (entry, mergeKey) => {
            const now = Date.now()
            const { undoStack } = get()
            const last = undoStack.at(-1)

            const merges = mergeKey !== undefined
                && last !== undefined
                && last.mergeKey === mergeKey
                && now - last.at < MERGE_WINDOW_MS

            const nextUndo = merges
                // Keep the oldest state: undo returns to before the gesture began.
                ? [...undoStack.slice(0, -1), { ...last, at: now }]
                : [...undoStack, { entry, mergeKey, at: now }].slice(-MAX_HISTORY)

            set({ undoStack: nextUndo, redoStack: [] })
        },
    }
}
