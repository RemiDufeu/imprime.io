import { useState, useEffect } from 'react'
import { Button, Tooltip, Popconfirm } from 'antd'
import {
  VerticalAlignTopOutlined,
  VerticalAlignBottomOutlined,
  UpOutlined,
  DownOutlined,
  DeleteFilled,
} from '@ant-design/icons'
import './LayeringToolbar.css'
import { useCurrentSlide, useEditorStore } from '../../../../store/editor/EditorStore'

const TOOLBAR_OFFSET = 12

export default function LayeringToolbar() {
  const selectShape = useEditorStore(state => state.selectShape)
  const isDragging = useEditorStore(state => !!state.dragData)
  const selectedShapeId = useEditorStore(state => state.selectedShape?.id)
  const isTransforming = useEditorStore(state => !!state.transformationData)

  const zoom = useEditorStore(state => state.zoom)
  const currentSlide = useCurrentSlide()
  const deleteShape = useEditorStore(state => state.deleteShape)

  const bringToFront = useEditorStore(state => state.bringToFront)
  const sendToBack = useEditorStore(state => state.sendToBack)
  const bringForward = useEditorStore(state => state.bringForward)
  const sendBackward = useEditorStore(state => state.sendBackward)

  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

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
  }, [selectedShapeId, isDragging, isTransforming, zoom])

  if (!position) return null

  const selectedShape = currentSlide?.shapes.find(s => s.id === selectedShapeId)
  if (!selectedShape) return null

  const shapeIndex = currentSlide!.shapes.findIndex(s => s.id === selectedShapeId)
  const isAtFront = shapeIndex === currentSlide!.shapes.length - 1
  const isAtBack = shapeIndex === 0
  const { left, top } = position

  return (
    <div className='tools-container' 
      style={{
        left: `${left}px`,
        top: `${top}px`,
      }}
    >
      <Popconfirm
        title="Delete this shape?"
        description="This action is irreversible."
        onConfirm={(e) => {
          e?.stopPropagation()
          deleteShape(selectedShapeId!)
          selectShape(null)
        }}
        okText="Delete"
        cancelText="Cancel"
        okButtonProps={{ danger: true }}
      >
        <Tooltip title="Delete shape" placement="left">
          <Button
            danger
            size='small'
            color='danger'
            icon={<DeleteFilled />}
          />
        </Tooltip>
      </Popconfirm>
      <div className="layering-toolbar">
        <Tooltip title="Bring to front" placement="left">
          <Button
            type="text"
            size="small"
            icon={<VerticalAlignTopOutlined />}
            onClick={() => bringToFront(selectedShapeId!)}
            disabled={isAtFront}
          />
        </Tooltip>

        <Tooltip title="Bring forward" placement="left">
          <Button
            type="text"
            size="small"
            icon={<UpOutlined />}
            onClick={() => bringForward(selectedShapeId!)}
            disabled={isAtFront}
          />
        </Tooltip>

        <Tooltip title="Send backward" placement="left">
          <Button
            type="text"
            size="small"
            icon={<DownOutlined />}
            onClick={() => sendBackward(selectedShapeId!)}
            disabled={isAtBack}
          />
        </Tooltip>

        <Tooltip title="Send to back" placement="left">
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
