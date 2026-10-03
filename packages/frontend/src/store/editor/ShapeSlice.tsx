import type { Shape } from '@imprime/sdk'
import type { SlideSlice } from './SlideSlice'
import type { PresentationSlice } from './PresentationSlice'
import type { ToolSlice } from './ToolSlice'
import type { ToolAttributesSlice } from './ToolAttributeSlice'
import { shapeToAttributesHelper } from './ToolAttributeSlice'
import type { StateCreator } from 'zustand'
import type { RichTextEditorSlice } from './RichTextEditorSlice'
import {
    findShapeById,
    updateShapeById,
    deleteShapeById,
    extractShapeById,
    insertShapeAt,
    cloneShapeWithNewIds,
    isDescendantOf,
    getSiblingList,
    isContainerShape,
} from '../../utils/shapeTree'
import { selectCurrentSlide } from './selectors'

// Offset between a copy and what it was copied from, so it reads as new.
const PASTE_OFFSET = 20

// What the next paste inserts, and where. The position is absolute, so the
// copy lands in the same place whichever container receives it.
export interface Clipboard {
    shape: Shape
    x: number
    y: number
    // Names this copy on the system clipboard, so a paste can tell it is still
    // the last thing copied — not text or an image copied elsewhere since.
    token: string
}

export interface ShapeSlice {
    selectedShape: Shape | null
    clipboard: Clipboard | null
    selectShape: (id: string | null) => void
    updateShape: (id: string, updates: Partial<Shape>) => void
    // Move a shape by (dx, dy) in its parent's space: the arrow keys.
    nudgeShape: (id: string, dx: number, dy: number) => void
    // Deselects too, when the selection was the shape or inside it.
    deleteShape: (id: string) => void
    // Duplicate a shape (recursively for groups, with fresh IDs) and insert
    // the copy immediately after the source in its own parent.
    duplicateShape: (id: string) => void
    // Move a shape to a new parent + index in the tree. `targetGroupId === null`
    // means the slide root. Rejects moves that would put a group inside itself.
    moveShape: (id: string, targetGroupId: string | null, index: number) => void
    // Move a shape into a group, appended at the end of its children — i.e. the
    // top of the group's visual stack (highest z-order among its children).
    moveShapeIntoGroup: (id: string, targetGroupId: string) => void
    copyShape: (id: string) => void
    // Copy, then delete. A cut shape pastes back in place rather than offset.
    cutShape: (id: string) => void
    // Insert the clipboard right after the selected shape, in its container,
    // or on top of the slide when nothing is selected. Pasting again cascades.
    pasteShape: () => void
    // Pull a shape out of its parent group into the group's own parent (or
    // the slide root), keeping its absolute position. No-op if the shape
    // isn't inside a group.
    ungroupShape: (id: string) => void
}

export const createShapeSlice : StateCreator<
  ShapeSlice & SlideSlice & PresentationSlice & ToolSlice & ToolAttributesSlice & RichTextEditorSlice,
  [],
    [],
    ShapeSlice
> = (set, get) => {
    const copyName = (shape: Shape) => shape.name ? `${shape.name} copy` : undefined

    // Insert `shape` at absolute (x, y), right after `anchorId` in the
    // anchor's container (the slide root when there is no anchor), and
    // select it.
    const insertNear = (shape: Shape, x: number, y: number, anchorId: string | null) => {
        const { updateSlideShapes, selectShape } = get()
        const currentSlide = selectCurrentSlide(get())
        if (!currentSlide) return

        const anchor = anchorId !== null ? findShapeById(currentSlide.shapes, anchorId) : null
        const parentId = anchor?.parentGroupId ?? null
        const parent = parentId !== null ? findShapeById(currentSlide.shapes, parentId) : null
        const siblings = getSiblingList(currentSlide.shapes, parentId)
        const anchorIndex = siblings.findIndex(s => s.id === anchorId)
        const index = anchorIndex === -1 ? siblings.length : anchorIndex + 1

        const placed = { ...shape, x: x - (parent?.absX ?? 0), y: y - (parent?.absY ?? 0) }
        updateSlideShapes(currentSlide._id, insertShapeAt(currentSlide.shapes, parentId, index, placed))
        selectShape(placed.id)
    }

    return {
        selectedShape: null,
        clipboard: null,
        selectShape: (id) => {
            // Retrieve with Id (walk the tree — shapes can be nested in groups)
            let selectedShape: Shape | null = null
             try {
                const currentSlide = selectCurrentSlide(get())
                if (!currentSlide) return
                if (id !== null) {
                    selectedShape = findShapeById(currentSlide.shapes, id)?.shape ?? null
                }
            } catch {
                return
            }

            const selectedTool = get().selectedTool
            let contextBarType = get().contextBarType

            // Update context bar type based on selected shape and tool
            if (selectedTool === 'move') {
                if(selectedShape) {
                    if (selectedShape.type === 'rectangle' || selectedShape.type === 'ellipse') {
                        contextBarType = 'shape'
                    } else if (selectedShape.type === 'text') {
                        contextBarType = 'text'
                    } else if (selectedShape.type === 'group') {
                        contextBarType = 'group'
                    } else if (selectedShape.type === 'if-group') {
                        contextBarType = 'if-group'
                    } else if (selectedShape.type === 'for-group') {
                        contextBarType = 'for-group'
                    }
                } else {
                    contextBarType = 'none'
                }
            }

            // Sync attributes with selected shape properties
            const shapeAttributes = selectedShape ? shapeToAttributesHelper(selectedShape) : {}
            const updatedAttributes = { ...get().attributes, ...shapeAttributes }

            // Update store
             // Unselect editor when we change selection
            set({ selectedShape, contextBarType, attributes: updatedAttributes, editor : null })
        },
        updateShape: (id: string, updates: Partial<Shape>) => {
            const { presentation, updateSlideShapes } = get()
            if (!presentation) return
            const currentSlide = selectCurrentSlide(get())
            if (!currentSlide) return
            const updatedShapes = updateShapeById(currentSlide.shapes, id, updates)
            updateSlideShapes(currentSlide._id, updatedShapes, {
                // Successive edits of the same fields of one shape undo as one step.
                mergeKey: `${id}:${Object.keys(updates).sort().join(',')}`,
                selection: id,
            })
        },
        nudgeShape: (id: string, dx: number, dy: number) => {
            const { updateShape, selectShape } = get()
            const currentSlide = selectCurrentSlide(get())
            if (!currentSlide) return
            const shape = findShapeById(currentSlide.shapes, id)?.shape
            if (!shape) return
            updateShape(id, { x: shape.x + dx, y: shape.y + dy })
            // A drag starts from the selection snapshot, so refresh it.
            selectShape(id)
        },
        deleteShape: (id: string) => {
            const { presentation, updateSlideShapes, selectedShape, selectShape } = get()
            if (!presentation) return
            const currentSlide = selectCurrentSlide(get())
            if (!currentSlide) return
            const updatedShapes = deleteShapeById(currentSlide.shapes, id)
            updateSlideShapes(currentSlide._id, updatedShapes)
            if (selectedShape && !findShapeById(updatedShapes, selectedShape.id)) selectShape(null)
        },
        duplicateShape: (id: string) => {
            const currentSlide = selectCurrentSlide(get())
            if (!currentSlide) return
            const loc = findShapeById(currentSlide.shapes, id)
            if (!loc) return
            const copy = cloneShapeWithNewIds({ ...loc.shape, name: copyName(loc.shape) })
            insertNear(copy, loc.absX + PASTE_OFFSET, loc.absY + PASTE_OFFSET, id)
        },
        moveShape: (id: string, targetGroupId: string | null, index: number) => {
            const { presentation, updateSlideShapes, selectShape } = get()
            if (!presentation) return
            const currentSlide = selectCurrentSlide(get())
            if (!currentSlide) return
            // Reject moves into own subtree (would make a group its own descendant).
            if (targetGroupId !== null && isDescendantOf(currentSlide.shapes, targetGroupId, id)) return

            const sourceLoc = findShapeById(currentSlide.shapes, id)
            if (!sourceLoc) return
            const targetParentAbs = targetGroupId === null
                ? { absX: 0, absY: 0 }
                : findShapeById(currentSlide.shapes, targetGroupId)
            if (targetParentAbs === null) return
            const newX = sourceLoc.absX - targetParentAbs.absX
            const newY = sourceLoc.absY - targetParentAbs.absY

            const { removed, remaining } = extractShapeById(currentSlide.shapes, id)
            if (!removed) return
            const repositioned = { ...removed, x: newX, y: newY } as Shape

            // If moving within the same parent, the target index may shift once the
            // source is removed. Caller passes the index in the *pre-removal* tree,
            // and we adjust here.
            const preSiblings = targetGroupId === null
                ? currentSlide.shapes
                : (findShapeById(currentSlide.shapes, targetGroupId)?.shape as { children?: Shape[] } | undefined)?.children ?? []
            const sourceIndexInTarget = preSiblings.findIndex(s => s.id === id)
            const adjustedIndex = sourceIndexInTarget !== -1 && sourceIndexInTarget < index
                ? index - 1
                : index

            const nextShapes = insertShapeAt(remaining, targetGroupId, adjustedIndex, repositioned)
            updateSlideShapes(currentSlide._id, nextShapes)
            selectShape(id)
        },
        moveShapeIntoGroup: (id: string, targetGroupId: string) => {
            const { presentation, moveShape } = get()
            if (!presentation) return
            const currentSlide = selectCurrentSlide(get())
            if (!currentSlide) return

            const target = findShapeById(currentSlide.shapes, targetGroupId)?.shape
            if (!target || !isContainerShape(target)) return
            moveShape(id, targetGroupId, target.children.length)
        },
        copyShape: (id: string) => {
            const currentSlide = selectCurrentSlide(get())
            if (!currentSlide) return
            const loc = findShapeById(currentSlide.shapes, id)
            if (!loc) return
            set({ clipboard: {
                shape: { ...loc.shape, name: copyName(loc.shape) },
                x: loc.absX + PASTE_OFFSET,
                y: loc.absY + PASTE_OFFSET,
                token: crypto.randomUUID(),
            } })
        },
        cutShape: (id: string) => {
            const currentSlide = selectCurrentSlide(get())
            if (!currentSlide) return
            const loc = findShapeById(currentSlide.shapes, id)
            if (!loc) return
            set({ clipboard: { shape: loc.shape, x: loc.absX, y: loc.absY, token: crypto.randomUUID() } })
            get().deleteShape(id)
        },
        pasteShape: () => {
            const { clipboard, selectedShape } = get()
            if (!clipboard) return
            insertNear(cloneShapeWithNewIds(clipboard.shape), clipboard.x, clipboard.y, selectedShape?.id ?? null)
            // The next paste lands one step further, not on top of this one.
            set({ clipboard: { ...clipboard, x: clipboard.x + PASTE_OFFSET, y: clipboard.y + PASTE_OFFSET } })
        },
        ungroupShape: (id: string) => {
            const { presentation, updateSlideShapes, selectShape } = get()
            if (!presentation) return
            const currentSlide = selectCurrentSlide(get())
            if (!currentSlide) return
            const loc = findShapeById(currentSlide.shapes, id)
            if (!loc || loc.parentGroupId === null) return

            const parentLoc = findShapeById(currentSlide.shapes, loc.parentGroupId)
            if (!parentLoc || !isContainerShape(parentLoc.shape)) return
            const group = parentLoc.shape

            const relocated = { ...loc.shape, x: loc.shape.x + group.x, y: loc.shape.y + group.y } as Shape

            const { remaining } = extractShapeById(currentSlide.shapes, id)

            // Insert right after the (former) group in its own container, so the
            // shape stays visually close to where it came from.
            const grandSiblings = getSiblingList(remaining, parentLoc.parentGroupId)
            const groupIndex = grandSiblings.findIndex(s => s.id === loc.parentGroupId)
            const insertIndex = groupIndex === -1 ? grandSiblings.length : groupIndex + 1

            const nextShapes = insertShapeAt(remaining, parentLoc.parentGroupId, insertIndex, relocated)
            updateSlideShapes(currentSlide._id, nextShapes)
            selectShape(id)
        },
    }
}
