import { useState, useRef, useEffect } from 'react'
import type { Shape } from '@imprime/sdk'
import { Button, Tooltip } from 'antd'
import {
    BorderOutlined,
    Loading3QuartersOutlined,
    FontSizeOutlined,
    PictureOutlined,
    FolderOutlined,
    CaretDownOutlined,
    CaretRightOutlined,
    EyeOutlined,
    EyeInvisibleOutlined,
    CopyOutlined,
    DeleteOutlined,
    HolderOutlined,
} from '@ant-design/icons'
import './ShapeTreePanel.css'
import { useCurrentSlide, useEditorStore } from '../../../../../../store/editor/EditorStore'

const INDENT_PX = 14
const DRAG_MIME = 'application/x-imprime-shape-id'

// Whole-row drop model (mirrors SlideList): every visible row is a drop zone,
// the mouse-Y midpoint of the row decides whether the drop lands above or
// below the row's shape within its parent. For groups, a middle band drops
// into the group. `overShapeId`/`position` drive the visual indicator so the
// user always sees where the drop will land.
type DropTarget =
    | {
        kind: 'sibling'
        parentId: string | null
        arrayIndex: number
        overShapeId: string
        position: 'above' | 'below'
    }
    | { kind: 'into'; groupId: string }

export default function ShapeTreePanel() {
    const currentSlide = useCurrentSlide()
    const selectedShapeId = useEditorStore(s => s.selectedShape?.id ?? null)
    const selectShape = useEditorStore(s => s.selectShape)
    const updateShape = useEditorStore(s => s.updateShape)
    const deleteShape = useEditorStore(s => s.deleteShape)
    const duplicateShape = useEditorStore(s => s.duplicateShape)
    const moveShape = useEditorStore(s => s.moveShape)

    const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
    const [renamingId, setRenamingId] = useState<string | null>(null)
    const [draggedId, setDraggedId] = useState<string | null>(null)
    const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)

    const toggleCollapse = (id: string) => {
        setCollapsed(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const commitDrop = (source: string, target: DropTarget) => {
        if (target.kind === 'sibling') {
            moveShape(source, target.parentId, target.arrayIndex)
        } else {
            // Drop into group = append at end of children array = top of the
            // group's visual list (highest z-order among its children).
            const groupLoc = currentSlide
                ? findGroupById(currentSlide.shapes, target.groupId)
                : null
            const insertIndex = groupLoc ? groupLoc.children.length : 0
            moveShape(source, target.groupId, insertIndex)
        }
    }

    if (!currentSlide) return null

    const handlers = {
        selectedShapeId,
        renamingId,
        collapsed,
        draggedId,
        dropTarget,
        onSelect: selectShape,
        onToggleCollapse: toggleCollapse,
        onToggleHidden: (id: string, hidden: boolean) => updateShape(id, { hidden: !hidden }),
        onDuplicate: duplicateShape,
        onDelete: (id: string) => {
            deleteShape(id)
            if (selectedShapeId === id) selectShape(null)
        },
        onStartRename: (id: string) => setRenamingId(id),
        onCommitRename: (id: string, name: string) => {
            const trimmed = name.trim()
            updateShape(id, { name: trimmed.length > 0 ? trimmed : undefined })
            setRenamingId(null)
        },
        onCancelRename: () => setRenamingId(null),
        onDragStart: (id: string) => setDraggedId(id),
        onDragEnd: () => {
            setDraggedId(null)
            setDropTarget(null)
        },
        onDropTargetChange: (t: DropTarget | null) => setDropTarget(t),
        onDrop: (target: DropTarget) => {
            if (draggedId) commitDrop(draggedId, target)
            setDraggedId(null)
            setDropTarget(null)
        },
    }

    return (
        <div className="shape-tree-panel">
            <div className="shape-tree-panel-header">Layers</div>
            <div className="shape-tree-panel-content">
                {currentSlide.shapes.length === 0 ? (
                    <div className="shape-tree-panel-empty">No shapes yet</div>
                ) : (
                    <SiblingList
                        shapes={currentSlide.shapes}
                        parentId={null}
                        depth={0}
                        handlers={handlers}
                    />
                )}
            </div>
        </div>
    )
}

interface Handlers {
    selectedShapeId: string | null
    renamingId: string | null
    collapsed: Set<string>
    draggedId: string | null
    dropTarget: DropTarget | null
    onSelect: (id: string) => void
    onToggleCollapse: (id: string) => void
    onToggleHidden: (id: string, currentHidden: boolean) => void
    onDuplicate: (id: string) => void
    onDelete: (id: string) => void
    onStartRename: (id: string) => void
    onCommitRename: (id: string, name: string) => void
    onCancelRename: () => void
    onDragStart: (id: string) => void
    onDragEnd: () => void
    onDropTargetChange: (t: DropTarget | null) => void
    onDrop: (target: DropTarget) => void
}

// Render a parent's children top-down (highest z-index first). The row itself
// is the drop zone — no separators.
function SiblingList({
    shapes,
    parentId,
    depth,
    handlers,
}: {
    shapes: Shape[]
    parentId: string | null
    depth: number
    handlers: Handlers
}) {
    return (
        <>
            {shapes.map((shape, arrayIndex) => (
                <ShapeRow
                    key={shape.id}
                    shape={shape}
                    depth={depth}
                    parentId={parentId}
                    arrayIndex={arrayIndex}
                    handlers={handlers}
                />
            ))}
        </>
    )
}

function ShapeRow({
    shape,
    depth,
    parentId,
    arrayIndex,
    handlers,
}: {
    shape: Shape
    depth: number
    parentId: string | null
    // Index of `shape` in its parent's children array. Used to translate
    // "above/below this row" (visual) into the correct array insertion index
    // for `moveShape`. Display order matches array order (row 0 = shapes[0]),
    // so `above = arrayIndex` and `below = arrayIndex + 1`.
    arrayIndex: number
    handlers: Handlers
}) {
    const isGroup = shape.type === 'group'
    const isCollapsed = isGroup && handlers.collapsed.has(shape.id)
    const isSelected = handlers.selectedShapeId === shape.id
    const isRenaming = handlers.renamingId === shape.id
    const isBeingDragged = handlers.draggedId === shape.id

    const dt = handlers.dropTarget
    const isDropInto = dt?.kind === 'into' && dt.groupId === shape.id
    const isDropAbove = dt?.kind === 'sibling' && dt.overShapeId === shape.id && dt.position === 'above'
    const isDropBelow = dt?.kind === 'sibling' && dt.overShapeId === shape.id && dt.position === 'below'

    const rowClass = [
        'shape-tree-row',
        isSelected ? 'selected' : '',
        shape.hidden ? 'hidden' : '',
        isDropInto ? 'drop-into' : '',
        isDropAbove ? 'drop-above' : '',
        isDropBelow ? 'drop-below' : '',
    ].filter(Boolean).join(' ')

    // Compute drop position from the cursor's vertical position within the row.
    // For non-groups: top half → above, bottom half → below.
    // For groups: top 25% → above, middle 50% → into, bottom 25% → below.
    const computeDropTarget = (e: React.DragEvent<HTMLDivElement>): DropTarget | null => {
        if (!handlers.draggedId || handlers.draggedId === shape.id) return null
        const rect = e.currentTarget.getBoundingClientRect()
        const ratio = (e.clientY - rect.top) / rect.height
        if (isGroup) {
            if (ratio < 0.25) {
                return {
                    kind: 'sibling',
                    parentId,
                    arrayIndex,
                    overShapeId: shape.id,
                    position: 'above',
                }
            }
            if (ratio > 0.75) {
                return {
                    kind: 'sibling',
                    parentId,
                    arrayIndex: arrayIndex + 1,
                    overShapeId: shape.id,
                    position: 'below',
                }
            }
            return { kind: 'into', groupId: shape.id }
        }
        return ratio < 0.5
            ? {
                kind: 'sibling',
                parentId,
                arrayIndex,
                overShapeId: shape.id,
                position: 'above',
            }
            : {
                kind: 'sibling',
                parentId,
                arrayIndex: arrayIndex + 1,
                overShapeId: shape.id,
                position: 'below',
            }
    }

    return (
        <>
            <div
                className={rowClass}
                style={{
                    opacity: isBeingDragged ? 0.4 : undefined,
                    ['--depth-offset' as string]: `${depth * INDENT_PX}px`,
                }}
                draggable={!isRenaming}
                onClick={() => handlers.onSelect(shape.id)}
                onDoubleClick={(e) => {
                    e.stopPropagation()
                    handlers.onStartRename(shape.id)
                }}
                onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_MIME, shape.id)
                    e.dataTransfer.effectAllowed = 'move'
                    handlers.onDragStart(shape.id)
                }}
                onDragEnd={handlers.onDragEnd}
                onDragOver={(e) => {
                    const t = computeDropTarget(e)
                    if (!t) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    handlers.onDropTargetChange(t)
                }}
                onDrop={(e) => {
                    const t = computeDropTarget(e)
                    if (!t) return
                    e.preventDefault()
                    handlers.onDrop(t)
                }}
            >
                {depth > 0 && (
                    <span
                        className="shape-tree-row-indent"
                        style={{ width: depth * INDENT_PX }}
                        aria-hidden="true"
                    />
                )}
                <span
                    className="shape-tree-row-handle"
                    onClick={(e) => e.stopPropagation()}
                >
                    <HolderOutlined />
                </span>
                <span
                    className="shape-tree-row-caret"
                    onClick={(e) => {
                        if (!isGroup) return
                        e.stopPropagation()
                        handlers.onToggleCollapse(shape.id)
                    }}
                >
                    {isGroup ? (isCollapsed ? <CaretRightOutlined /> : <CaretDownOutlined />) : null}
                </span>
                <span className="shape-tree-row-icon">{shapeIcon(shape)}</span>
                {isRenaming ? (
                    <RenameInput
                        initial={shape.name ?? ''}
                        onCommit={(v) => handlers.onCommitRename(shape.id, v)}
                        onCancel={handlers.onCancelRename}
                    />
                ) : (
                    <span className="shape-tree-row-label">
                        {shape.name ?? ''}
                    </span>
                )}
                <span
                    className="shape-tree-row-actions"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Tooltip title={shape.hidden ? 'Show' : 'Hide'} mouseEnterDelay={0.4}>
                        <Button
                            type="text"
                            size="small"
                            icon={shape.hidden ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                            onClick={() => handlers.onToggleHidden(shape.id, !!shape.hidden)}
                        />
                    </Tooltip>
                    <Tooltip title="Duplicate" mouseEnterDelay={0.4}>
                        <Button
                            type="text"
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={() => handlers.onDuplicate(shape.id)}
                        />
                    </Tooltip>
                    <Tooltip title="Delete" mouseEnterDelay={0.4}>
                        <Button
                            type="text"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => handlers.onDelete(shape.id)}
                        />
                    </Tooltip>
                </span>
            </div>
            {isGroup && !isCollapsed && (
                <SiblingList
                    shapes={shape.children}
                    parentId={shape.id}
                    depth={depth + 1}
                    handlers={handlers}
                />
            )}
        </>
    )
}

function RenameInput({
    initial,
    onCommit,
    onCancel,
}: {
    initial: string
    onCommit: (v: string) => void
    onCancel: () => void
}) {
    const [value, setValue] = useState(initial)
    const ref = useRef<HTMLInputElement>(null)

    useEffect(() => {
        ref.current?.focus()
        ref.current?.select()
    }, [])

    return (
        <input
            ref={ref}
            className="shape-tree-row-label-input"
            value={value}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => onCommit(value)}
            onKeyDown={(e) => {
                if (e.key === 'Enter') {
                    e.preventDefault()
                    onCommit(value)
                } else if (e.key === 'Escape') {
                    e.preventDefault()
                    onCancel()
                }
            }}
        />
    )
}

function shapeIcon(shape: Shape) {
    switch (shape.type) {
        case 'rectangle': return <BorderOutlined />
        case 'ellipse': return <Loading3QuartersOutlined />
        case 'text': return <FontSizeOutlined />
        case 'image': return <PictureOutlined />
        case 'group': return <FolderOutlined />
    }
}

// Local helper: find a group's children by id. Returns null if the target
// isn't a group. Used to compute the insertion index for "drop into group".
function findGroupById(shapes: Shape[], id: string): { children: Shape[] } | null {
    for (const s of shapes) {
        if (s.id === id) return s.type === 'group' ? s : null
        if (s.type === 'group') {
            const nested = findGroupById(s.children, id)
            if (nested) return nested
        }
    }
    return null
}
