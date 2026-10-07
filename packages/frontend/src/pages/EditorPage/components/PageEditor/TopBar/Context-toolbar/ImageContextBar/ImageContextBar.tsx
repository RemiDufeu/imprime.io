import { useState } from 'react'
import { Button, Divider, InputNumber, Select, Tag, Tooltip } from 'antd'
import { DeleteOutlined, PictureOutlined, ScissorOutlined, ThunderboltFilled } from '@ant-design/icons'
import type { ImageFit } from '@imprime/sdk'
import { getImageOpacity } from '@imprime/sdk'
import { useEditorStore } from '../../../../../../../store/editor/EditorStore'
import { selectSelectedShape } from '../../../../../../../store/editor/selectors'
import { variableReferenceLabel } from '../../../../../../../utils/variableScope'
import { StrokeControls, type StrokeValue } from '../StrokeControls'
import { ImageAlignGrid } from './ImageAlignGrid'
import { ImageCropModal } from './ImageCropModal/ImageCropModal'
import { ImagePickerModal } from './ImagePickerModal/ImagePickerModal'
import './ImageContextBar.css'

const FIT_OPTIONS: { value: ImageFit; label: string }[] = [
  { value: 'fill', label: 'Fill' },
  { value: 'contain', label: 'Contain' },
  { value: 'cover', label: 'Cover' },
]

// The selected image box: its image (choose, crop, remove), how the image
// fills it, and the box's own style.
export function ImageContextBar() {
  const shape = useEditorStore(selectSelectedShape)
  const variables = useEditorStore(state => state.template?.variableData)
  const drawStyle = useEditorStore(state => state.drawStyle)
  const updateShape = useEditorStore(state => state.updateShape)
  const [picking, setPicking] = useState(false)
  const [cropping, setCropping] = useState(false)

  if (shape?.type !== 'image') return null

  // A bound box's image is the export's: there is nothing to crop yet.
  const hasImage = shape.imageId !== undefined && shape.imageVariable === undefined
  const binding = shape.imageVariable
    ? variableReferenceLabel(variables ?? [], shape.imageVariable, shape.itemPath) ?? 'Unknown variable'
    : undefined
  const stroke: StrokeValue = {
    stroke: shape.stroke ?? drawStyle.stroke,
    strokeWidth: shape.strokeWidth ?? 0,
    strokeStyle: shape.strokeStyle ?? 'solid',
  }

  return (
    <div className="toolbar-container context-toolbar">
      <div className="toolbar-item">
        <Button size="small" type="text" icon={<PictureOutlined />} onClick={() => setPicking(true)}>
          Choose image
        </Button>
        {binding !== undefined && (
          <Tag className="image-binding-tag" color="processing" icon={<ThunderboltFilled />}>
            {binding}
          </Tag>
        )}
        <Tooltip title="Crop">
          <Button
            size="small"
            type="text"
            icon={<ScissorOutlined />}
            disabled={!hasImage}
            onClick={() => setCropping(true)}
          />
        </Tooltip>
        <Tooltip title="Remove image">
          <Button
            size="small"
            type="text"
            icon={<DeleteOutlined />}
            disabled={!hasImage && binding === undefined}
            onClick={() => updateShape(shape.id, {
              imageId: undefined,
              imageVariable: undefined,
              itemPath: undefined,
              alt: undefined,
              crop: undefined,
            })}
          />
        </Tooltip>
      </div>

      <Divider type="vertical" style={{ height: '24px' }} />

      <div className="toolbar-item">
        <span className="toolbar-label">Fit</span>
        <Select
          value={shape.fit}
          onChange={(fit: ImageFit) => updateShape(shape.id, { fit })}
          size="small"
          style={{ width: 96 }}
          options={FIT_OPTIONS}
        />
        <ImageAlignGrid
          value={shape.align}
          disabled={shape.fit === 'fill'}
          onChange={(align) => updateShape(shape.id, { align })}
        />
      </div>

      <Divider type="vertical" style={{ height: '24px' }} />

      <div className="toolbar-item">
        <span className="toolbar-label">Opacity</span>
        <InputNumber
          min={0}
          max={100}
          step={5}
          value={Math.round(getImageOpacity(shape) * 100)}
          onChange={(value: number | null) => updateShape(shape.id, { opacity: (value ?? 100) / 100 })}
          suffix="%"
          size="small"
          style={{ width: '76px' }}
        />
      </div>

      <div className="toolbar-item">
        <span className="toolbar-label">Radius</span>
        <InputNumber
          min={0}
          value={shape.cornerRadius ?? 0}
          onChange={(value: number | null) => updateShape(shape.id, { cornerRadius: value ?? 0 })}
          size="small"
          style={{ width: '60px' }}
        />
      </div>

      <Divider type="vertical" style={{ height: '24px' }} />

      {/* A width alone draws nothing: the colour shown is written with every
          edit, so a box without one gets it. Always, so that an edit's undo
          step merges with the next same edit (`updateShape` keys on fields). */}
      <StrokeControls value={stroke} onChange={(patch) => updateShape(shape.id, { stroke: stroke.stroke, ...patch })} />

      {picking && <ImagePickerModal shape={shape} onClose={() => setPicking(false)} />}

      {cropping && shape.imageId && (
        <ImageCropModal
          imageId={shape.imageId}
          crop={shape.crop}
          onApply={(crop) => updateShape(shape.id, { crop })}
          onClose={() => setCropping(false)}
        />
      )}
    </div>
  )
}
