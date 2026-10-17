import type { PageDTO, PageNumbering, Shape } from '@imprime/sdk'
import { layoutTree } from '@imprime/sdk'
import type { StateCreator } from 'zustand'
import type { TemplateSlice } from './TemplateSlice'
import type { PageSlice } from './PageSlice'
import type { SelectionSlice } from './SelectionSlice'
import type { HistorySlice } from './HistorySlice'
import { templatesAPI } from '../../api/api'
import { selectCurrentPage } from './selectors'
import { splitPageNumberBox, withPageNumberBox } from '../../utils/pageNumbering'

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
 * touches the API or the template directly. A page's condition and repeat
 * reach the server through the same save queue (`_savePage`).
 */
export interface DocumentWriteSlice {
    updatePageShapes: (pageId: string, shapes: Shape[], hint?: HistoryHint) => void
    // The read-transform-write every shape action is: `transform` gets the
    // page's shapes and returns the new tree, or null to leave it alone. The
    // page on screen unless `pageId` names another.
    _editPage: (transform: (shapes: Shape[]) => Shape[] | null, options?: HistoryHint & { pageId?: string }) => void
    // Set and save without recording: the path undo and redo replay through.
    // The template's page-number box among `shapes` is taken out: the page
    // shows it or not (`hidePageNumber`), and a box changed is the template's
    // new one, on every page.
    _writePageShapes: (pageId: string, shapes: Shape[]) => void
    // Fire-and-forget; saves of one page reach the server one at a time, in
    // order. Updates waiting are merged, each field keeping its latest value.
    _savePage: (pageId: string, update: PageDTO.Update) => void
    // As `_savePage`, for the template's numbering: one save out at a time,
    // the latest waiting.
    _savePageNumbering: (numbering: PageNumbering | null) => void
    // Resolves once every save out has landed, retries included: what reads
    // the template from the server — a preview — sees what is on screen.
    whenSaved: () => Promise<void>
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
    const pendingSaves = new Map<string, { templateId: string; update: PageDTO.Update } | null>()
    // The drain of each page with a save out.
    const drains = new Map<string, Promise<void>>()

    // The numbering save out, and the one to send once it is back.
    let numberingSave: Promise<void> | null = null
    let numberingWaiting: { templateId: string; numbering: PageNumbering | null } | undefined
    const drainNumbering = async () => {
        for (let next = numberingWaiting; next; next = numberingWaiting) {
            numberingWaiting = undefined
            try {
                await templatesAPI.update(next.templateId, { pageNumbering: next.numbering })
            } catch {
                set({ error: 'Failed to save the page numbering' })
            }
        }
    }
    // Started again when a save arrived between the drain's last check and
    // its end.
    const startNumberingDrain = () => {
        numberingSave = drainNumbering().finally(() => {
            numberingSave = null
            if (numberingWaiting) startNumberingDrain()
        })
    }

    // Removed from the open template since (or undone): nothing to save to.
    // A page of a template no longer open is saved all the same.
    const isGone = (templateId: string, pageId: string) => {
        const { template } = get()
        return template?._id === templateId && !template.pages.some(page => page._id === pageId)
    }

    const send = async (pageId: string, templateId: string, update: PageDTO.Update) => {
        for (let attempt = 0; !isGone(templateId, pageId); attempt++) {
            try {
                await templatesAPI.updatePage(templateId, pageId, update)
                return
            } catch {
                // A newer update is waiting, or arrives during the back-off:
                // it is sent instead, carrying this one's fields, so no retry.
                if (pendingSaves.get(pageId)) {
                    mergeFailed(pageId, update)
                    return
                }
                if (attempt >= MAX_SAVE_RETRIES) {
                    set({ error: 'Failed to save changes after multiple attempts' })
                    return
                }
                await sleep(SAVE_RETRY_BASE_MS * 2 ** attempt)
                if (pendingSaves.get(pageId)) {
                    mergeFailed(pageId, update)
                    return
                }
            }
        }
    }

    // A failed update's fields go out with the newer one waiting, under its
    // own: a failed condition change must not be dropped by a shape save.
    const mergeFailed = (pageId: string, failed: PageDTO.Update) => {
        const next = pendingSaves.get(pageId)
        if (next) pendingSaves.set(pageId, { ...next, update: { ...failed, ...next.update } })
    }

    const drain = async (pageId: string) => {
        for (let next = pendingSaves.get(pageId); next; next = pendingSaves.get(pageId)) {
            pendingSaves.set(pageId, null)
            await send(pageId, next.templateId, next.update)
        }
        pendingSaves.delete(pageId)
    }

    return {
        updatePageShapes: (pageId: string, shapes: Shape[], hint?: HistoryHint) => {
            const { template, selectedShapeId, _recordHistory, _writePageShapes } = get()
            if (!template) return
            const previous = template.pages.find(page => page._id === pageId)?.shapes
            if (!previous) return
            // Hugging groups are sized and groups with a layout re-laid-out
            // before the write — by the export's own `layoutTree` — so every
            // consumer downstream reads final, real shape positions
            // (rendering, hit-testing, selection).
            const reflowed = layoutTree(shapes)

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
            const { template, _savePage, _savePageNumbering } = get()
            if (!template) return

            const { shapes: own, box } = splitPageNumberBox(shapes)
            const numbering = template.pageNumbering
            // No numbering, no box: one left in a tree is dropped.
            const next = numbering && box && box !== numbering.box ? { ...numbering, box } : numbering
            const shown = numbering ? { hidePageNumber: box === undefined } : {}

            set({
                template: {
                    ...template,
                    pageNumbering: next,
                    pages: template.pages.map((page) => {
                        if (page._id === pageId) return withPageNumberBox({ ...page, ...shown, shapes: own }, next)
                        return next !== numbering ? withPageNumberBox(page, next) : page
                    }),
                },
            })

            _savePage(pageId, { shapes: own, ...shown })
            if (next !== numbering) _savePageNumbering(next ?? null)
        },

        _savePage: (pageId: string, update: PageDTO.Update) => {
            const { template } = get()
            if (!template) return
            const sending = pendingSaves.has(pageId)
            const waiting = pendingSaves.get(pageId)
            pendingSaves.set(pageId, {
                templateId: template._id,
                update: waiting ? { ...waiting.update, ...update } : update,
            })
            if (!sending) {
                // A drain started for this page before this one's `finally`
                // ran is the next one, and stays.
                const draining: Promise<void> = drain(pageId).finally(() => {
                    if (drains.get(pageId) === draining) drains.delete(pageId)
                })
                drains.set(pageId, draining)
            }
        },

        _savePageNumbering: (numbering) => {
            const { template } = get()
            if (!template) return
            numberingWaiting = { templateId: template._id, numbering }
            if (!numberingSave) startNumberingDrain()
        },

        whenSaved: async () => {
            await Promise.all([...drains.values(), numberingSave])
        },
    }
}
