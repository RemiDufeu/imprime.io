import { useEffect, useState } from 'react'
import { InputNumber, Popover, Tooltip } from 'antd'
import { RotateRightOutlined } from '@ant-design/icons'
import type { Shape } from '@imprime/sdk'
import { getImposedAxes, getRotation, shapeToPage } from '@imprime/sdk'
import { useCurrentPage, useEditorStore } from '../../../../store/editor/EditorStore'
import { findShapeById } from '../../../../utils/shapeTree'
import { MIN_SIZE } from '../../../../utils/transform'
import { HANDLE_OFFSET } from '../../../../components/page/svg/SVGSelectionWrapper'
import './SelectionSize.css'

// Between the bottom handle and the chip, in screen pixels.
const GAP = 4

const AXES = [
  { axis: 'width', prefix: 'W', label: 'Width' },
  { axis: 'height', prefix: 'H', label: 'Height' },
] as const

// The selection's width × height — and its angle, once turned — under it,
// live while a handle is dragged; a click on it opens fields to type them in.
export default function SelectionSize() {
  const selectedShapeId = useEditorStore(state => state.selectedShapeId)
  const transformationData = useEditorStore(state => state.transformationData)
  const isDragging = useEditorStore(state => state.dragData !== null)
  const zoom = useEditorStore(state => state.zoom)
  const resizeShape = useEditorStore(state => state.resizeShape)
  const rotateShape = useEditorStore(state => state.rotateShape)
  const currentPage = useCurrentPage()

  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  // The shape whose fields are open: selecting another one closes them.
  const [editingId, setEditingId] = useState<string | null>(null)

  const loc = currentPage && selectedShapeId ? findShapeById(currentPage.shapes, selectedShapeId) : null
  const size = transformationData ?? loc?.shape
  // Only a turn sets the dragged rotation; a resize or a move keeps the shape's.
  const rotation = getRotation({ rotation: transformationData?.rotation ?? loc?.shape.rotation })
  // The box moves without the selection changing — a drag, an undo, a group
  // reflowing — and the chip has to follow it.
  const box = loc ? shapeToPage({ ...loc.shape, ...transformationData }, loc.parentFrame) : null
  const boxX = box?.x
  const boxY = box?.y
  const boxWidth = size?.width
  const boxHeight = size?.height
  const boxRotation = box?.rotation

  useEffect(() => {
    if (!selectedShapeId) {
      setPosition(null)
      return
    }

    const selectionRect = document.querySelector(`rect[data-selection-rect="${selectedShapeId}"]`)
    if (!(selectionRect instanceof SVGGraphicsElement)) {
      setPosition(null)
      return
    }

    const updatePosition = () => {
      const rect = selectionRect.getBoundingClientRect()
      // Screen pixels per page unit, to clear the bottom handle at any zoom —
      // the length of a unit, which a turned shape's matrix spreads over a and b.
      const ctm = selectionRect.getScreenCTM()
      const unit = ctm ? Math.hypot(ctm.a, ctm.b) : 1
      // A shape turned over puts its rotation handle below it: clear that too.
      // Looked up each time, as it is not drawn mid-drag.
      const handle = document.querySelector(`[data-rotation-handle="${selectedShapeId}"]`)
      const handleBottom = handle?.getBoundingClientRect().bottom ?? -Infinity
      setPosition({
        left: rect.left + rect.width / 2,
        top: Math.max(rect.bottom + HANDLE_OFFSET * unit, handleBottom) + GAP,
      })
    }

    updatePosition()

    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)

    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [selectedShapeId, zoom, boxX, boxY, boxWidth, boxHeight, boxRotation])

  if (!position || !loc || !size) return null

  const parent = loc.parentGroupId !== null ? findShapeById(currentPage!.shapes, loc.parentGroupId)?.shape : undefined
  const imposed = parent?.type === 'group' ? getImposedAxes(parent, loc.shape) : { width: false, height: false }
  const open = editingId === loc.shape.id && !isDragging

  return (
    <Popover
      open={open}
      onOpenChange={(next) => setEditingId(next ? loc.shape.id : null)}
      trigger="click"
      placement="bottom"
      content={<SizeFields shape={loc.shape} imposed={imposed} onResize={resizeShape} onRotate={rotateShape} />}
    >
      <button
        type="button"
        className={`selection-size${isDragging ? ' dragging' : ''}`}
        style={{ left: `${position.left}px`, top: `${position.top}px` }}
      >
        {Math.round(size.width)} × {Math.round(size.height)}
        {rotation !== 0 && ` · ${Math.round(rotation)}°`}
      </button>
    </Popover>
  )
}

interface SizeFieldsProps {
  shape: Shape
  // The sizes its parent group sets: a value typed there would not hold.
  imposed: Record<'width' | 'height', boolean>
  onResize: (id: string, size: { width?: number; height?: number }) => void
  onRotate: (id: string, rotation: number) => void
}

function SizeFields({ shape, imposed, onResize, onRotate }: SizeFieldsProps) {
  return (
    <div className="selection-size-fields">
      {AXES.map(({ axis, prefix, label }) => (
        <Tooltip key={axis} title={imposed[axis] ? `${label} set by its parent group` : null}>
          <span>
            <InputNumber
              size="small"
              prefix={prefix}
              aria-label={label}
              min={MIN_SIZE}
              precision={0}
              value={Math.round(shape[axis])}
              disabled={imposed[axis]}
              onChange={(value: number | null) => {
                if (value === null) return
                onResize(shape.id, axis === 'width' ? { width: value } : { height: value })
              }}
              style={{ width: 88 }}
            />
          </span>
        </Tooltip>
      ))}
      {/* Any angle is taken, and kept as the same turn within ±180°. */}
      <InputNumber
        size="small"
        prefix={<RotateRightOutlined />}
        suffix="°"
        aria-label="Rotation"
        precision={0}
        value={Math.round(getRotation(shape))}
        onChange={(value: number | null) => {
          if (value === null) return
          onRotate(shape.id, value)
        }}
        style={{ width: 88 }}
      />
    </div>
  )
}
