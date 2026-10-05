import type { Page } from "@imprime/sdk"
import type { StateCreator } from "zustand"
import type { TemplateSlice } from "./TemplateSlice"
import type { HistorySlice } from "./HistorySlice"
import type { TextEditorSlice } from "./TextEditorSlice"
import type { SelectionSlice } from "./SelectionSlice"
import { templatesAPI } from "../../api/api"

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

/**
 * The template's pages as a set: which one is on screen, and adding,
 * deleting and reordering them. What a page holds goes through
 * DocumentWriteSlice.
 */
export interface PageSlice {
    currentPageIndex: number
    // Ends any text editing (committing it) and clears the selection, which
    // belongs to the page being left.
    selectPage: (index: number) => void
    addPage: (afterIndex?: number) => Promise<void>
    deletePage: (pageId: string) => Promise<void>
    reorderPages: (pages: Page[]) => Promise<void>
    // The halves undo and redo replay, unrecorded. Given a page,
    // `_insertPage` recreates that one: same id, same shapes. None of them
    // takes the server's copy of the template back: it would overwrite
    // shape edits still being saved.
    _insertPage: (index: number, page?: Page) => Promise<Page>
    _removePage: (pageId: string) => Promise<void>
    _applyPageOrder: (pageIds: string[]) => Promise<void>
}

export const createPageSlice: StateCreator<
    PageSlice & TemplateSlice & HistorySlice & TextEditorSlice & SelectionSlice,
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

    _insertPage: async (index: number, page?: Page) => {
        const { template } = get()
        if (!template) throw new Error('No template loaded')

        const created = await templatesAPI.addPage(template._id, page
            ? { _id: page._id, order: index, shapes: page.shapes }
            : { order: index })

        // Read again: the document may have changed during the request.
        const current = get().template
        if (!current) return created
        const at = Math.min(index, current.pages.length)
        const pages = [...current.pages.slice(0, at), created, ...current.pages.slice(at)]
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
})
