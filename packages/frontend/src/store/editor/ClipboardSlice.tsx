import type { Shape, VariableData } from '@imprime/sdk'
import { bindVariables, shapeToPage } from '@imprime/sdk'
import type { StateCreator } from 'zustand'
import type { TemplateSlice } from './TemplateSlice'
import type { PageSlice } from './PageSlice'
import type { DocumentWriteSlice } from './DocumentWriteSlice'
import type { SelectionSlice } from './SelectionSlice'
import type { ShapeSlice } from './ShapeSlice'
import { COPY_OFFSET, copyName } from './ShapeSlice'
import { cloneShapeWithNewIds, findShapeById, insertNear } from '../../utils/shapeTree'
import { selectCurrentPage } from './selectors'
import { isPageNumberBox } from '../../utils/pageNumbering'

// What the next paste inserts, and where. The shape is held as it lies on the
// page — its rotation too, with its parents' — and the position is absolute,
// so the copy lands in the same place, turned the same way, whichever
// container receives it.
export interface Clipboard {
    shape: Shape
    x: number
    y: number
    // Names this copy on the system clipboard, so a paste can tell it is still
    // the last thing copied — not text or an image copied elsewhere since.
    token: string
    // The variables of the template it was copied from, to bind its
    // references in the one it is pasted into.
    variables: VariableData[]
}

/** The editor's own clipboard of shapes; the system clipboard only marks it (see useEditorShortcuts). */
export interface ClipboardSlice {
    clipboard: Clipboard | null
    copyShape: (id: string) => void
    // Copy, then delete. A cut shape pastes back in place rather than offset.
    cutShape: (id: string) => void
    // Insert the clipboard right after the selected shape, in its container,
    // or on top of the page when nothing is selected. Pasting again cascades.
    pasteShape: () => void
}

export const createClipboardSlice: StateCreator<
    ClipboardSlice & TemplateSlice & PageSlice & DocumentWriteSlice & SelectionSlice & ShapeSlice,
    [],
    [],
    ClipboardSlice
> = (set, get) => {
    // Not the page-number box: it is the template's, on every page already,
    // and a copy would be a text box no longer numbering anything.
    const take = (id: string, offset: number, shapeOf: (shape: Shape) => Shape) => {
        if (isPageNumberBox({ id })) return false
        const page = selectCurrentPage(get())
        const loc = page ? findShapeById(page.shapes, id) : null
        if (!loc) return false
        const onPage = shapeToPage(loc.shape, loc.parentFrame)
        set({ clipboard: {
            shape: shapeOf(onPage),
            x: onPage.x + offset,
            y: onPage.y + offset,
            token: crypto.randomUUID(),
            variables: get().template?.variableData ?? [],
        } })
        return true
    }

    return {
        clipboard: null,

        copyShape: (id) => {
            take(id, COPY_OFFSET, shape => ({ ...shape, name: copyName(shape) }))
        },

        cutShape: (id) => {
            if (take(id, 0, shape => shape)) get().deleteShape(id)
        },

        pasteShape: () => {
            const { clipboard, selectedShapeId, template } = get()
            if (!clipboard || !template) return
            // Bound to this template's variables (see `bindVariables`): the server
            // refuses every save of a page holding an unknown reference.
            const copy = cloneShapeWithNewIds(bindVariables(clipboard.shape, clipboard.variables, template.variableData ?? []).shape)
            get()._editPage(shapes => insertNear(shapes, { ...copy, x: clipboard.x, y: clipboard.y }, selectedShapeId))
            get().selectShape(copy.id)
            // The next paste lands one step further, not on top of this one.
            set({ clipboard: { ...clipboard, x: clipboard.x + COPY_OFFSET, y: clipboard.y + COPY_OFFSET } })
        },
    }
}
