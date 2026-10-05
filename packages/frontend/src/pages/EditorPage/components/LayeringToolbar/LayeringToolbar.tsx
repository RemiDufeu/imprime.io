import { useState, useEffect } from 'react'
import { Button, Tooltip } from 'antd'
import {
  VerticalAlignTopOutlined,
  VerticalAlignBottomOutlined,
  UpOutlined,
  DownOutlined,
  DeleteFilled,
  UngroupOutlined,
} from '@ant-design/icons'
import './LayeringToolbar.css'
import { useCurrentPage, useEditorStore } from '../../../../store/editor/EditorStore'
import { findShapeById, getSiblingList } from '../../../../utils/shapeTree'
import { MOD_LABEL } from '../../../../utils/hotkeys'

const TOOLBAR_OFFSET = 12

export default function LayeringToolbar() {
  const isDragging = useEditorStore(state => !!state.dragData)
  const selectedShapeId = useEditorStore(state => state.selectedShapeId)
  const isTransforming = useEditorStore(state => !!state.transformationData)

  const zoom = useEditorStore(state => state.zoom)
  const currentPage = useCurrentPage()
  const deleteShape = useEditorStore(state => state.deleteShape)

  const bringToFront = useEditorStore(state => state.bringToFront)
  const sendToBack = useEditorStore(state => state.sendToBack)
  const bringForward = useEditorStore(state => state.bringForward)
  const sendBackward = useEditorStore(state => state.sendBackward)
  const ungroupShape = useEditorStore(state => state.ungroupShape)

  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  const loc = currentPage && selectedShapeId ? findShapeById(currentPage.shapes, selectedShapeId) : null
  // The selection's box moves without the selection changing — an undo, a
  // nudge, a group reflowing — and the toolbar has to follow it.
  const boxX = loc?.absX
  const boxY = loc?.absY
  const boxWidth = loc?.shape.width
  const boxHeight = loc?.shape.height

  useEffect(() => {
    if (!selectedShapeId || isDragging || isTransforming) {
      setPosition(null)
      return
    }

    // Find the selection rectangle
    const selectionRect = document.querySelector(`rect[data-selection-rect="${selectedShapeId}"]`)

    if (!selectionRect) {
      setPosition(null)
      return
    }

    const updatePosition = () => {
      const rect = selectionRect.getBoundingClientRect()
      setPosition({
        left: rect.right + TOOLBAR_OFFSET,
        top: rect.top,
      })
    }

    updatePosition()

    const handleUpdate = () => updatePosition()
    window.addEventListener('scroll', handleUpdate, true)
    window.addEventListener('resize', handleUpdate)

    return () => {
      window.removeEventListener('scroll', handleUpdate, true)
      window.removeEventListener('resize', handleUpdate)
    }
  }, [selectedShapeId, isDragging, isTransforming, zoom, boxX, boxY, boxWidth, boxHeight])

  if (!position) return null
  if (!loc) return null

  const siblings = getSiblingList(currentPage!.shapes, loc.parentGroupId)
  const shapeIndex = siblings.findIndex(s => s.id === selectedShapeId)
  const isAtFront = shapeIndex === siblings.length - 1
  const isAtBack = shapeIndex === 0
  const { left, top } = position

  return (
    <div className='tools-container' 
      style={{
        left: `${left}px`,
        top: `${top}px`,
      }}
    >
      {/* No confirmation: a deletion is one undo away. */}
      <Tooltip title="Delete shape (Del)" placement="left">
        <Button
          danger
          size='small'
          color='danger'
          icon={<DeleteFilled />}
          onClick={(e) => {
            e.stopPropagation()
            deleteShape(selectedShapeId!)
          }}
        />
      </Tooltip>
      {loc.parentGroupId !== null && (
        <div className='layering-toolbar'>
          <Tooltip title="Remove from group" placement="left">
            <Button
              type="text"
              size="small"
              icon={<UngroupOutlined />}
              onClick={() => ungroupShape(selectedShapeId!)}
            />
          </Tooltip>
        </div>
        )}
      <div className="layering-toolbar">
        <Tooltip title={`Bring to front (${MOD_LABEL}+Shift+↑)`} placement="left">
          <Button
            type="text"
            size="small"
            icon={<VerticalAlignTopOutlined />}
            onClick={() => bringToFront(selectedShapeId!)}
            disabled={isAtFront}
          />
        </Tooltip>

        <Tooltip title={`Bring forward (${MOD_LABEL}+↑)`} placement="left">
          <Button
            type="text"
            size="small"
            icon={<UpOutlined />}
            onClick={() => bringForward(selectedShapeId!)}
            disabled={isAtFront}
          />
        </Tooltip>

        <Tooltip title={`Send backward (${MOD_LABEL}+↓)`} placement="left">
          <Button
            type="text"
            size="small"
            icon={<DownOutlined />}
            onClick={() => sendBackward(selectedShapeId!)}
            disabled={isAtBack}
          />
        </Tooltip>

        <Tooltip title={`Send to back (${MOD_LABEL}+Shift+↓)`} placement="left">
          <Button
            type="text"
            size="small"
            icon={<VerticalAlignBottomOutlined />}
            onClick={() => sendToBack(selectedShapeId!)}
            disabled={isAtBack}
          />
        </Tooltip>
      </div>
    </div>
  )
}
