import type { Page, PageDTO, PageNumbering } from "@imprime/sdk"
import type { StateCreator } from "zustand"
import type { TemplateSlice } from "./TemplateSlice"
import type { HistorySlice } from "./HistorySlice"
import type { TextEditorSlice } from "./TextEditorSlice"
import type { SelectionSlice } from "./SelectionSlice"
import type { DocumentWriteSlice } from "./DocumentWriteSlice"
import { templatesAPI } from "../../api/api"
import { cloneShapeWithNewIds } from "../../utils/shapeTree"
import { isPageNumberBox, splitPageNumberBox, withPageNumberBox } from "../../utils/pageNumbering"

// `pages` in the order of `pageIds`; pages the list leaves out keep their
// relative order, after it. `order` is rewritten to match.
function orderPages(pages: Page[], pageIds: string[]): Page[] {
    const rank = (page: Page, index: number) => {
        const position = pageIds.indexOf(page._id)
        return position === -1 ? pageIds.length + index : position
    }
    return pages
        .map((page, index) => ({ page, rank: rank(page, index) }))
        .sort((a, b) => a.rank - b.rank)
        .map(({ page }, order) => (page.order === order ? page : { ...page, order }))
}

// What the data does to a page as a whole: the condition it is exported
// under, and the list it is repeated for. Unset is neither.
export type PageBindings = Pick<Page, 'visibleWhen' | 'repeat'>

export const pageBindings = (page: Page): PageBindings => ({ visibleWhen: page.visibleWhen, repeat: page.repeat })

// What a page is created with: its content, and an `_id` when it comes back
// from a deletion.
type PageContent = Pick<PageDTO.Create, '_id' | 'shapes' | 'visibleWhen' | 'repeat' | 'hidePageNumber'>

/**
 * The template's pages as a set: which one is on screen, adding, deleting and
 * reordering them, and the condition and repeat each carries. What a page
 * holds goes through DocumentWriteSlice — and so do its condition and repeat,
 * through its save queue.
 */
export interface PageSlice {
    currentPageIndex: number
    // Ends any text editing (committing it) and clears the selection, which
    // belongs to the page being left.
    selectPage: (index: number) => void
    addPage: (afterIndex?: number) => Promise<void>
    // A copy of the page right after it — shapes, condition and repeat — its
    // shapes under new ids, and shown. Undone as an added page is.
    duplicatePage: (pageId: string) => Promise<void>
    deletePage: (pageId: string) => Promise<void>
    reorderPages: (pages: Page[]) => Promise<void>
    // Merged into the page's bindings: a field given as undefined is removed,
    // one left out is kept. Recorded for undo.
    updatePageBindings: (pageId: string, changes: Partial<PageBindings>) => void
    // The template's numbering, replaced whole — null numbers no page — and
    // its box put on, or taken off, every page that shows it. Recorded.
    setPageNumbering: (numbering: PageNumbering | null) => void
    // Whether the page shows the template's page-number box: the box added
    // to its shapes or taken out of them, which is what deleting it does too.
    setPageNumberShown: (pageId: string, shown: boolean) => void
    // The halves undo and redo replay, unrecorded. Given content, `_insertPage`
    // creates the page with it — with an `_id`, recreates that one: same id,
    // same shapes. None of them takes the server's copy of the template back:
    // it would overwrite shape edits still being saved.
    _insertPage: (index: number, content?: PageContent) => Promise<Page>
    _removePage: (pageId: string) => Promise<void>
    _applyPageOrder: (pageIds: string[]) => Promise<void>
    // Replaces the page's bindings whole: set at once, saved in the page's
    // save queue, in order with its shape saves.
    _applyPageBindings: (pageId: string, bindings: PageBindings) => void
    _applyPageNumbering: (numbering: PageNumbering | null) => void
}

export const createPageSlice: StateCreator<
    PageSlice & TemplateSlice & HistorySlice & TextEditorSlice & SelectionSlice & DocumentWriteSlice,
    [],
    [],
    PageSlice
> = (set, get) => ({
    currentPageIndex: 0,

    selectPage: (index: number) => {
        get().endTextSession()
        set({ currentPageIndex: index, selectedShapeId: null })
    },

    addPage: async (afterIndex?: number) => {
        const { template, _insertPage, _recordHistory } = get()
        if (!template) return

        try {
            const page = await _insertPage(afterIndex === undefined ? template.pages.length : afterIndex + 1)
            _recordHistory({ kind: 'page', pageId: page._id, snapshot: null })
        } catch {
            set({ error: 'Failed to add page' })
        }
    },

    duplicatePage: async (pageId: string) => {
        const { template, _insertPage, _recordHistory } = get()
        if (!template) return
        const index = template.pages.findIndex(page => page._id === pageId)
        if (index === -1) return
        const page = template.pages[index]

        // New ids: a shape's id is how the editor finds its page. Not the
        // page-number box's, which is the template's: the copy shows it as
        // the page does.
        try {
            const copy = await _insertPage(index + 1, {
                shapes: splitPageNumberBox(page.shapes).shapes.map(cloneShapeWithNewIds),
                visibleWhen: page.visibleWhen,
                repeat: page.repeat,
                hidePageNumber: page.hidePageNumber,
            })
            _recordHistory({ kind: 'page', pageId: copy._id, snapshot: null })
        } catch {
            set({ error: 'Failed to duplicate page' })
        }
    },

    deletePage: async (pageId: string) => {
        const { template, _removePage, _recordHistory } = get()
        if (!template) return
        const index = template.pages.findIndex(page => page._id === pageId)
        if (index === -1) return
        const page = template.pages[index]

        try {
            await _removePage(pageId)
            _recordHistory({ kind: 'page', pageId, snapshot: { page, index } })
        } catch {
            set({ error: 'Failed to delete page' })
        }
    },

    reorderPages: async (pages: Page[]) => {
        const { template, _applyPageOrder, _recordHistory } = get()
        if (!template) return
        const previous = template.pages.map(page => page._id)

        try {
            await _applyPageOrder(pages.map(page => page._id))
            _recordHistory({ kind: 'page-order', pageIds: previous })
        } catch {
            set({ error: 'Failed to reorder pages' })
        }
    },

    updatePageBindings: (pageId: string, changes: Partial<PageBindings>) => {
        const { template, _applyPageBindings, _recordHistory } = get()
        const page = template?.pages.find(p => p._id === pageId)
        if (!page) return
        const previous = pageBindings(page)

        _recordHistory({ kind: 'page-bindings', pageId, bindings: previous })
        _applyPageBindings(pageId, { ...previous, ...changes })
    },

    setPageNumbering: (numbering: PageNumbering | null) => {
        const { template, _applyPageNumbering, _recordHistory } = get()
        if (!template) return

        _recordHistory({ kind: 'page-numbering', numbering: template.pageNumbering ?? null })
        _applyPageNumbering(numbering)
    },

    setPageNumberShown: (pageId: string, shown: boolean) => {
        const box = get().template?.pageNumbering?.box
        if (!box) return
        get()._editPage(shapes => {
            const showing = shapes.some(isPageNumberBox)
            if (showing === shown) return null
            return shown ? [...shapes, box] : shapes.filter(shape => !isPageNumberBox(shape))
        }, { pageId })
    },

    _insertPage: async (index: number, content?: PageContent) => {
        const { template } = get()
        if (!template) throw new Error('No template loaded')

        // A page's own shapes only: a page restored by undo holds the
        // template's page-number box among them.
        const created = await templatesAPI.addPage(template._id, content
            ? {
                _id: content._id,
                order: index,
                shapes: content.shapes && splitPageNumberBox(content.shapes).shapes,
                visibleWhen: content.visibleWhen,
                repeat: content.repeat,
                hidePageNumber: content.hidePageNumber,
            }
            : { order: index })

        // Read again: the document may have changed during the request.
        const current = get().template
        if (!current) return created
        const at = Math.min(index, current.pages.length)
        const shown = withPageNumberBox(created, current.pageNumbering)
        const pages = [...current.pages.slice(0, at), shown, ...current.pages.slice(at)]
        get().endTextSession()
        set({ template: { ...current, pages }, currentPageIndex: at, selectedShapeId: null })
        return created
    },

    _removePage: async (pageId: string) => {
        const { template } = get()
        if (!template) return

        await templatesAPI.deletePage(template._id, pageId)

        const current = get().template
        if (!current) return
        const index = current.pages.findIndex(page => page._id === pageId)
        if (index === -1) return
        const pages = current.pages.filter(page => page._id !== pageId)
        const { currentPageIndex } = get()
        // Stay on the page that was showing; when that is the one removed,
        // show its neighbour.
        if (index === currentPageIndex) {
            get().endTextSession()
            set({ template: { ...current, pages }, currentPageIndex: Math.min(index, pages.length - 1), selectedShapeId: null })
        } else {
            set({ template: { ...current, pages }, currentPageIndex: index < currentPageIndex ? currentPageIndex - 1 : currentPageIndex })
        }
    },

    _applyPageOrder: async (pageIds: string[]) => {
        const { template, currentPageIndex } = get()
        if (!template) return

        const pages = orderPages(template.pages, pageIds)
        const showing = template.pages[currentPageIndex]?._id

        // Applied at once, so a dragged page does not jump back while the
        // request runs; undone if the request fails.
        set({
            template: { ...template, pages },
            currentPageIndex: Math.max(0, pages.findIndex(page => page._id === showing)),
        })
        try {
            await templatesAPI.update(template._id, { pages })
        } catch (err) {
            const current = get().template
            if (current) {
                const restored = orderPages(current.pages, template.pages.map(page => page._id))
                set({
                    template: { ...current, pages: restored },
                    currentPageIndex: Math.max(0, restored.findIndex(page => page._id === showing)),
                })
            }
            throw err
        }
    },

    _applyPageBindings: (pageId: string, bindings: PageBindings) => {
        const { template, _savePage } = get()
        if (!template?.pages.some(p => p._id === pageId)) return

        set({
            template: {
                ...template,
                pages: template.pages.map(p => (p._id === pageId ? { ...p, ...bindings } : p)),
            },
        })
        // Both fields, always: null removes what undefined leaves out.
        _savePage(pageId, { visibleWhen: bindings.visibleWhen ?? null, repeat: bindings.repeat ?? null })
    },

    _applyPageNumbering: (numbering: PageNumbering | null) => {
        const { template, selectedShapeId, _savePageNumbering } = get()
        if (!template) return

        // Typing in the box is committed while it is still there; a box taken
        // away is no longer selected.
        get().endTextSession()
        const next = numbering ?? undefined
        set({
            template: {
                ...template,
                pageNumbering: next,
                pages: template.pages.map(page => withPageNumberBox(page, next)),
            },
            ...(next === undefined && selectedShapeId !== null && isPageNumberBox({ id: selectedShapeId })
                ? { selectedShapeId: null }
                : {}),
        })
        _savePageNumbering(numbering)
    },
})
