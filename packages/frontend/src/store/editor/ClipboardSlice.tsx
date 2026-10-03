import type { Shape, VariableData } from '@imprime/sdk'
import { rebindVariables } from '@imprime/sdk'
import type { StateCreator } from 'zustand'
import type { PresentationSlice } from './PresentationSlice'
import type { SlideSlice } from './SlideSlice'
import type { DocumentWriteSlice } from './DocumentWriteSlice'
import type { SelectionSlice } from './SelectionSlice'
import type { ShapeSlice } from './ShapeSlice'
import { COPY_OFFSET, copyName } from './ShapeSlice'
import { cloneShapeWithNewIds, findShapeById, insertNear } from '../../utils/shapeTree'
import { selectCurrentSlide } from './selectors'

// What the next paste inserts, and where. The position is absolute, so the
// copy lands in the same place whichever container receives it.
export interface Clipboard {
    shape: Shape
    x: number
    y: number
    // Names this copy on the system clipboard, so a paste can tell it is still
    // the last thing copied — not text or an image copied elsewhere since.
    token: string
    // The variables of the presentation it was copied from, to bind its
    // references in the one it is pasted into.
    variables: VariableData[]
}

// A copied shape's variable references, as the presentation it is pasted into
// knows them: kept by id, else matched by name and type (a copy from another
// presentation, or a variable deleted and recreated since), else dropped — a
// text run then becomes its name as plain text. The server refuses every save
// of a slide holding an unknown reference, so none may get through.
function bindVariables(shape: Shape, from: VariableData[], to: VariableData[]): Shape {
    const present = new Set(to.map(variable => variable._id))
    const original = new Map(from.map(variable => [variable._id, variable]))
    return rebindVariables(
        shape,
        variableId => {
            if (present.has(variableId)) return variableId
            const source = original.get(variableId)
            if (!source) return null
            return to.find(variable => variable.name === source.name && variable.type === source.type)?._id ?? null
        },
        run => {
            const name = original.get(run.variableId)?.name ?? 'variable'
            return `{${run.itemPath ? `${name}.${run.itemPath}` : name}}`
        },
    )
}

/** The editor's own clipboard of shapes; the system clipboard only marks it (see useEditorShortcuts). */
export interface ClipboardSlice {
    clipboard: Clipboard | null
    copyShape: (id: string) => void
    // Copy, then delete. A cut shape pastes back in place rather than offset.
    cutShape: (id: string) => void
    // Insert the clipboard right after the selected shape, in its container,
    // or on top of the slide when nothing is selected. Pasting again cascades.
    pasteShape: () => void
}

export const createClipboardSlice: StateCreator<
    ClipboardSlice & PresentationSlice & SlideSlice & DocumentWriteSlice & SelectionSlice & ShapeSlice,
    [],
    [],
    ClipboardSlice
> = (set, get) => {
    const take = (id: string, offset: number, shapeOf: (shape: Shape) => Shape) => {
        const slide = selectCurrentSlide(get())
        const loc = slide ? findShapeById(slide.shapes, id) : null
        if (!loc) return false
        set({ clipboard: {
            shape: shapeOf(loc.shape),
            x: loc.absX + offset,
            y: loc.absY + offset,
            token: crypto.randomUUID(),
            variables: get().presentation?.variableData ?? [],
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
            const { clipboard, selectedShapeId, presentation } = get()
            if (!clipboard || !presentation) return
            const copy = cloneShapeWithNewIds(bindVariables(clipboard.shape, clipboard.variables, presentation.variableData ?? []))
            get()._editSlide(shapes => insertNear(shapes, copy, clipboard.x, clipboard.y, selectedShapeId))
            get().selectShape(copy.id)
            // The next paste lands one step further, not on top of this one.
            set({ clipboard: { ...clipboard, x: clipboard.x + COPY_OFFSET, y: clipboard.y + COPY_OFFSET } })
        },
    }
}
