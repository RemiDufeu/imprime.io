import type { Shape } from '@imprime/sdk'
import type { StateCreator } from 'zustand'
import type { TemplateSlice } from './TemplateSlice'
import type { PageSlice } from './PageSlice'
import type { SelectionSlice } from './SelectionSlice'
import type { HistorySlice } from './HistorySlice'
import { templatesAPI } from '../../api/api'
import { reflowGroups } from '../../utils/groupLayout'
import { selectCurrentPage } from './selectors'

// What a shape write tells the history about itself.
export interface HistoryHint {
    // Successive writes sharing this key, close together, undo as one step.
    mergeKey?: string
    // The shape undo selects again; defaults to the current selection.
    selection?: string
}

/**
 * The single path every shape tree takes to the document: reflow, record for
 * undo, set, save. Shape actions compute a tree and hand it here; none of them
 * touches the API or the template directly.
 */
export interface DocumentWriteSlice {
    updatePageShapes: (pageId: string, shapes: Shape[], hint?: HistoryHint) => void
    // The read-transform-write every shape action is: `transform` gets the
    // page's shapes and returns the new tree, or null to leave it alone. The
    // page on screen unless `pageId` names another.
    _editPage: (transform: (shapes: Shape[]) => Shape[] | null, options?: HistoryHint & { pageId?: string }) => void
    // Set and save without recording: the path undo and redo replay through.
    _writePageShapes: (pageId: string, shapes: Shape[]) => void
    // Fire-and-forget; saves of one page reach the server one at a time, in
    // order, and only the latest tree waiting is sent.
    _savePage: (pageId: string, shapes: Shape[]) => void
}

const MAX_SAVE_RETRIES = 2
const SAVE_RETRY_BASE_MS = 1000

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export const createDocumentWriteSlice: StateCreator<
    DocumentWriteSlice & TemplateSlice & PageSlice & SelectionSlice & HistorySlice,
    [],
    [],
    DocumentWriteSlice
> = (set, get) => {
    // The server reads a page, replaces its tree and writes it back, with no
    // check that nothing changed in between: two saves of one page in flight
    // can land in either order and leave the older tree — delete an image,
    // undo at once, and the image is gone on reload. So a page has at most
    // one save out. Present in the map = a save is out; the value is the tree
    // to send once it is back (null: nothing newer yet).
    const pendingSaves = new Map<string, { templateId: string; shapes: Shape[] } | null>()

    // Removed from the open template since (or undone): nothing to save to.
    // A page of a template no longer open is saved all the same.
    const isGone = (templateId: string, pageId: string) => {
        const { template } = get()
        return template?._id === templateId && !template.pages.some(page => page._id === pageId)
    }

    const send = async (pageId: string, templateId: string, shapes: Shape[]) => {
        for (let attempt = 0; !isGone(templateId, pageId); attempt++) {
            try {
                await templatesAPI.updatePage(templateId, pageId, shapes)
                return
            } catch {
                // A newer tree is waiting, or arrives during the back-off: it
                // replaces this one, so no retry.
                if (pendingSaves.get(pageId)) return
                if (attempt >= MAX_SAVE_RETRIES) {
                    set({ error: 'Failed to save changes after multiple attempts' })
                    return
                }
                await sleep(SAVE_RETRY_BASE_MS * 2 ** attempt)
                if (pendingSaves.get(pageId)) return
            }
        }
    }

    const drain = async (pageId: string) => {
        for (let next = pendingSaves.get(pageId); next; next = pendingSaves.get(pageId)) {
            pendingSaves.set(pageId, null)
            await send(pageId, next.templateId, next.shapes)
        }
        pendingSaves.delete(pageId)
    }

    return {
        updatePageShapes: (pageId: string, shapes: Shape[], hint?: HistoryHint) => {
            const { template, selectedShapeId, _recordHistory, _writePageShapes } = get()
            if (!template) return
            const previous = template.pages.find(page => page._id === pageId)?.shapes
            if (!previous) return
            // Groups with an active layout are re-laid-out before the write, so
            // every consumer downstream reads final, real shape positions
            // (rendering, hit-testing, selection).
            const reflowed = reflowGroups(shapes)

            _recordHistory({
                kind: 'shapes',
                pageId,
                shapes: previous,
                selection: hint?.selection ?? selectedShapeId,
            }, hint?.mergeKey)
            _writePageShapes(pageId, reflowed)
        },

        _editPage: (transform, options) => {
            const { template, updatePageShapes } = get()
            if (!template) return
            const page = options?.pageId !== undefined
                ? template.pages.find(s => s._id === options.pageId)
                : selectCurrentPage(get())
            if (!page) return
            const next = transform(page.shapes)
            if (next) updatePageShapes(page._id, next, options)
        },

        _writePageShapes: (pageId: string, shapes: Shape[]) => {
            const { template, _savePage } = get()
            if (!template) return

            set({
                template: {
                    ...template,
                    pages: template.pages.map((page) =>
                        page._id === pageId ? { ...page, shapes } : page
                    ),
                },
            })

            _savePage(pageId, shapes)
        },

        _savePage: (pageId: string, shapes: Shape[]) => {
            const { template } = get()
            if (!template) return
            const sending = pendingSaves.has(pageId)
            pendingSaves.set(pageId, { templateId: template._id, shapes })
            if (!sending) void drain(pageId)
        },
    }
}
