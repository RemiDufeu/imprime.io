import type { Shape } from '@imprime/sdk'
import type { StateCreator } from 'zustand'
import type { TemplateSlice } from './TemplateSlice'
import type { PageSlice } from './PageSlice'
import type { DocumentWriteSlice } from './DocumentWriteSlice'
import type { SelectionSlice } from './SelectionSlice'
import {
    findShapeById,
    updateShapeById,
    deleteShapeById,
    extractShapeById,
    insertShapeAt,
    insertNear,
    cloneShapeWithNewIds,
    isDescendantOf,
    getSiblingList,
    replaceSiblingList,
    isContainerShape,
} from '../../utils/shapeTree'
import { selectCurrentPage } from './selectors'

// Offset between a copy and what it was copied from, so it reads as new.
export const COPY_OFFSET = 20

export const copyName = (shape: Shape) => shape.name ? `${shape.name} copy` : undefined

/** Edits of the shapes on a page: their properties, place in the tree and z-order. */
export interface ShapeSlice {
    // Writes to the page holding the shape, not only the one on screen: a
    // text box commits its typing as it unmounts, after its page was left.
    // A shape found nowhere is a no-op.
    updateShape: (id: string, updates: Partial<Shape>) => void
    // Move a shape by (dx, dy) in its parent's space: the arrow keys.
    nudgeShape: (id: string, dx: number, dy: number) => void
    // Deselects too, when the selection was the shape or inside it.
    deleteShape: (id: string) => void
    // Duplicate a shape (recursively for groups, with fresh IDs) and insert
    // the copy immediately after the source in its own parent.
    duplicateShape: (id: string) => void
    // Move a shape to a new parent + index in the tree. `targetGroupId === null`
    // means the page root. Rejects moves that would put a group inside itself.
    moveShape: (id: string, targetGroupId: string | null, index: number) => void
    // Move a shape into a group, appended at the end of its children — i.e. the
    // top of the group's visual stack (highest z-order among its children).
    moveShapeIntoGroup: (id: string, targetGroupId: string) => void
    // Pull a shape out of its parent group into the group's own parent (or
    // the page root), keeping its absolute position. No-op if the shape
    // isn't inside a group.
    ungroupShape: (id: string) => void
    // Z-order within the shape's own container.
    bringToFront: (id: string) => void
    sendToBack: (id: string) => void
    bringForward: (id: string) => void
    sendBackward: (id: string) => void
}

export const createShapeSlice: StateCreator<
    ShapeSlice & TemplateSlice & PageSlice & DocumentWriteSlice & SelectionSlice,
    [],
    [],
    ShapeSlice
> = (_, get) => {
    // Move a shape within its own container's list, to the index `target`
    // computes from its current one (clamped).
    const reorder = (id: string, target: (index: number, length: number) => number) => {
        get()._editPage(shapes => {
            const loc = findShapeById(shapes, id)
            if (!loc) return null
            const siblings = getSiblingList(shapes, loc.parentGroupId)
            const from = siblings.findIndex(s => s.id === id)
            const to = Math.max(0, Math.min(siblings.length - 1, target(from, siblings.length)))
            if (from === -1 || from === to) return null
            const next = siblings.filter(s => s.id !== id)
            next.splice(to, 0, siblings[from])
            return replaceSiblingList(shapes, loc.parentGroupId, next)
        })
    }

    return {
        updateShape: (id, updates) => {
            const { template, _editPage } = get()
            if (!template) return
            const current = selectCurrentPage(get())
            const page = current && findShapeById(current.shapes, id)
                ? current
                : template.pages.find(s => findShapeById(s.shapes, id) !== null)
            if (!page) return
            _editPage(shapes => updateShapeById(shapes, id, updates), {
                pageId: page._id,
                // Successive edits of the same fields of one shape undo as one step.
                mergeKey: `${id}:${Object.keys(updates).sort().join(',')}`,
                selection: id,
            })
        },

        nudgeShape: (id, dx, dy) => {
            const page = selectCurrentPage(get())
            const shape = page ? findShapeById(page.shapes, id)?.shape : undefined
            if (shape) get().updateShape(id, { x: shape.x + dx, y: shape.y + dy })
        },

        deleteShape: (id) => {
            get()._editPage(shapes => deleteShapeById(shapes, id))
            const { selectedShapeId, selectShape } = get()
            const page = selectCurrentPage(get())
            if (selectedShapeId && page && !findShapeById(page.shapes, selectedShapeId)) selectShape(null)
        },

        duplicateShape: (id) => {
            const page = selectCurrentPage(get())
            const loc = page ? findShapeById(page.shapes, id) : null
            if (!loc) return
            const copy = cloneShapeWithNewIds({ ...loc.shape, name: copyName(loc.shape) })
            get()._editPage(shapes => insertNear(shapes, copy, loc.absX + COPY_OFFSET, loc.absY + COPY_OFFSET, id))
            get().selectShape(copy.id)
        },

        moveShape: (id, targetGroupId, index) => {
            get()._editPage(shapes => {
                // Reject moves into own subtree (would make a group its own descendant).
                if (targetGroupId !== null && isDescendantOf(shapes, targetGroupId, id)) return null

                const source = findShapeById(shapes, id)
                const target = targetGroupId === null ? { absX: 0, absY: 0 } : findShapeById(shapes, targetGroupId)
                if (!source || !target) return null

                const { removed, remaining } = extractShapeById(shapes, id)
                if (!removed) return null
                const repositioned = { ...removed, x: source.absX - target.absX, y: source.absY - target.absY }

                // The caller's index is in the pre-removal tree: moving down
                // within the same container shifts it by one.
                const sourceIndex = getSiblingList(shapes, targetGroupId).findIndex(s => s.id === id)
                const adjusted = sourceIndex !== -1 && sourceIndex < index ? index - 1 : index
                return insertShapeAt(remaining, targetGroupId, adjusted, repositioned)
            })
            get().selectShape(id)
        },

        moveShapeIntoGroup: (id, targetGroupId) => {
            const page = selectCurrentPage(get())
            const target = page ? findShapeById(page.shapes, targetGroupId)?.shape : undefined
            if (!target || !isContainerShape(target)) return
            get().moveShape(id, targetGroupId, target.children.length)
        },

        ungroupShape: (id) => {
            get()._editPage(shapes => {
                const loc = findShapeById(shapes, id)
                if (!loc || loc.parentGroupId === null) return null
                const parentLoc = findShapeById(shapes, loc.parentGroupId)
                if (!parentLoc || !isContainerShape(parentLoc.shape)) return null
                const group = parentLoc.shape

                const relocated = { ...loc.shape, x: loc.shape.x + group.x, y: loc.shape.y + group.y }
                const { remaining } = extractShapeById(shapes, id)

                // Right after the (former) group in its own container, so the
                // shape stays visually close to where it came from.
                const grandSiblings = getSiblingList(remaining, parentLoc.parentGroupId)
                const groupIndex = grandSiblings.findIndex(s => s.id === loc.parentGroupId)
                const insertIndex = groupIndex === -1 ? grandSiblings.length : groupIndex + 1
                return insertShapeAt(remaining, parentLoc.parentGroupId, insertIndex, relocated)
            })
            get().selectShape(id)
        },

        bringToFront: (id) => reorder(id, (_index, length) => length - 1),
        sendToBack: (id) => reorder(id, () => 0),
        bringForward: (id) => reorder(id, index => index + 1),
        sendBackward: (id) => reorder(id, index => index - 1),
    }
}
