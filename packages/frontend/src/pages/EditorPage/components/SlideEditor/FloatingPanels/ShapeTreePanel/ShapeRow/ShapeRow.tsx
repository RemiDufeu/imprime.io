import { useState } from 'react'
import { Button, Tooltip } from 'antd'
import {
    CaretDownOutlined,
    CaretRightOutlined,
    EyeOutlined,
    EyeInvisibleOutlined,
    CopyOutlined,
    DeleteOutlined,
    HolderOutlined,
} from '@ant-design/icons'
import type { Shape } from '@imprime/sdk'
import { useEditorStore } from '../../../../../../../store/editor/EditorStore'
import type { DropTarget } from '../types'
import { useShapeTreeUI } from '../ShapeTreeUIContext'
import { SiblingList } from '../SiblingList/SiblingList'
import { RenameInput } from '../RenameInput/RenameInput'
import { shapeIcon } from './shapeIcon'

const INDENT_PX = 14
const DRAG_MIME = 'application/x-imprime-shape-id'

export function ShapeRow({
    shape,
    depth,
    parentId,
    arrayIndex,
}: {
    shape: Shape
    depth: number
    parentId: string | null
    // Index of `shape` in its parent's children array. Used to translate
    // "above/below this row" (visual) into the correct array insertion index
    // for `moveShape`. Display order matches array order (row 0 = shapes[0]),
    // so `above = arrayIndex` and `below = arrayIndex + 1`.
    arrayIndex: number
}) {
    const selectShape = useEditorStore(s => s.selectShape)
    const updateShape = useEditorStore(s => s.updateShape)
    const deleteShape = useEditorStore(s => s.deleteShape)
    const duplicateShape = useEditorStore(s => s.duplicateShape)
    const moveShape = useEditorStore(s => s.moveShape)
    const moveShapeIntoGroup = useEditorStore(s => s.moveShapeIntoGroup)
    const isSelected = useEditorStore(s => s.selectedShape?.id === shape.id)

    const { draggedId, setDraggedId, dropTarget, setDropTarget } = useShapeTreeUI()

    const [collapsed, setCollapsed] = useState(false)
    const [isRenaming, setIsRenaming] = useState(false)

    const isGroup = shape.type === 'group'
    const isCollapsed = isGroup && collapsed
    const isBeingDragged = draggedId === shape.id

    const isDropInto = dropTarget?.kind === 'into' && dropTarget.groupId === shape.id
    const isDropAbove = dropTarget?.kind === 'sibling' && dropTarget.overShapeId === shape.id && dropTarget.position === 'above'
    const isDropBelow = dropTarget?.kind === 'sibling' && dropTarget.overShapeId === shape.id && dropTarget.position === 'below'

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
        if (!draggedId || draggedId === shape.id) return null
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

    const commitDrop = (source: string, target: DropTarget) => {
        if (target.kind === 'sibling') moveShape(source, target.parentId, target.arrayIndex)
        else moveShapeIntoGroup(source, target.groupId)
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
                onClick={() => selectShape(shape.id)}
                onDoubleClick={(e) => {
                    e.stopPropagation()
                    setIsRenaming(true)
                }}
                onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_MIME, shape.id)
                    e.dataTransfer.effectAllowed = 'move'
                    setDraggedId(shape.id)
                }}
                onDragEnd={() => {
                    setDraggedId(null)
                    setDropTarget(null)
                }}
                onDragOver={(e) => {
                    const t = computeDropTarget(e)
                    if (!t) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    setDropTarget(t)
                }}
                onDrop={(e) => {
                    const t = computeDropTarget(e)
                    if (!t) return
                    e.preventDefault()
                    if (draggedId) commitDrop(draggedId, t)
                    setDraggedId(null)
                    setDropTarget(null)
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
                        setCollapsed(c => !c)
                    }}
                >
                    {isGroup ? (isCollapsed ? <CaretRightOutlined /> : <CaretDownOutlined />) : null}
                </span>
                <span className="shape-tree-row-icon">{shapeIcon(shape)}</span>
                {isRenaming ? (
                    <RenameInput
                        initial={shape.name ?? ''}
                        onCommit={(name) => {
                            const trimmed = name.trim()
                            updateShape(shape.id, { name: trimmed.length > 0 ? trimmed : undefined })
                            setIsRenaming(false)
                        }}
                        onCancel={() => setIsRenaming(false)}
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
                            onClick={() => updateShape(shape.id, { hidden: !shape.hidden })}
                        />
                    </Tooltip>
                    <Tooltip title="Duplicate" mouseEnterDelay={0.4}>
                        <Button
                            type="text"
                            size="small"
                            icon={<CopyOutlined />}
                            onClick={() => duplicateShape(shape.id)}
                        />
                    </Tooltip>
                    <Tooltip title="Delete" mouseEnterDelay={0.4}>
                        <Button
                            type="text"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={() => {
                                deleteShape(shape.id)
                                if (isSelected) selectShape(null)
                            }}
                        />
                    </Tooltip>
                </span>
            </div>
            {isGroup && !isCollapsed && (
                <SiblingList
                    shapes={shape.children}
                    parentId={shape.id}
                    depth={depth + 1}
                />
            )}
        </>
    )
}
