import { InputNumber, Select, Divider } from 'antd'
import { useEditorStore } from '../../../../../store/editor/EditorStore'
import { DebouncedColorPicker } from '../../../../../components/common'

export function ShapeContextBar() {
  const selectedTool = useEditorStore(state => state.selectedTool)
  const selectedShape = useEditorStore(state => state.selectedShape)
  const updateShape = useEditorStore(state => state.updateShape)

  const attributes = useEditorStore(state => state.attributes)
  const setFillColor = useEditorStore(state => state.setFillColor)
  const setStrokeColor = useEditorStore(state => state.setStrokeColor)
  const setStrokeWidth = useEditorStore(state => state.setStrokeWidth)
  const setStrokeStyle = useEditorStore(state => state.setStrokeStyle)
  const setCornerRadius = useEditorStore(state => state.setCornerRadius)

  const isRectangleContext = selectedTool === 'rectangle' || selectedShape?.type === 'rectangle'

  const handleColorChange = (hex: string) => {
    setFillColor(hex)
    if (selectedShape && (selectedShape.type === 'rectangle' || selectedShape.type === 'ellipse')) {
      updateShape(selectedShape.id, { fill: hex })
    }
  }

  const handleStrokeColorChange = (hex: string) => {
    setStrokeColor(hex)
    if (selectedShape && (selectedShape.type === 'rectangle' || selectedShape.type === 'ellipse')) {
      updateShape(selectedShape.id, { stroke: hex })
    }
  }

  const handleStrokeWidthChange = (value: number | null) => {
    const width = value ?? 0
    setStrokeWidth(width)
    if (selectedShape && (selectedShape.type === 'rectangle' || selectedShape.type === 'ellipse')) {
      updateShape(selectedShape.id, { strokeWidth: width })
    }
  }

  const handleStrokeStyleChange = (value: 'solid' | 'dashed' | 'dotted') => {
    setStrokeStyle(value)
    if (selectedShape && (selectedShape.type === 'rectangle' || selectedShape.type === 'ellipse')) {
      updateShape(selectedShape.id, { strokeStyle: value })
    }
  }

  const handleCornerRadiusChange = (value: number | null) => {
    const radius = value ?? 0
    setCornerRadius(radius)
    if (selectedShape && selectedShape.type === 'rectangle') {
      updateShape(selectedShape.id, { cornerRadius: radius })
    }
  }

  return (
    <div className="toolbar-container toolbar-section">
      {/* Fill Section */}
      <div className="toolbar-item">
        <span className="toolbar-label">Fill</span>
        <DebouncedColorPicker
          value={attributes.fillColor}
          onChange={handleColorChange}
          size="small"
          showText
        />
      </div>

      <Divider type="vertical" style={{ height: '24px' }} />

      {/* Stroke Section */}
      <div className="toolbar-item">
        <span className="toolbar-label">Stroke</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <DebouncedColorPicker
            value={attributes.strokeColor}
            onChange={handleStrokeColorChange}
            size="small"
            showText
          />
          <InputNumber
            min={0}
            max={20}
            value={attributes.strokeWidth}
            onChange={handleStrokeWidthChange}
            style={{ width: '60px' }}
            size="small"
            placeholder="Width"
          />
          <Select
            value={attributes.strokeStyle}
            onChange={handleStrokeStyleChange}
            style={{ width: '90px' }}
            size="small"
            options={[
              { value: 'solid', label: 'Solid' },
              { value: 'dashed', label: 'Dashed' },
              { value: 'dotted', label: 'Dotted' },
            ]}
          />
        </div>
      </div>

      {isRectangleContext && (
        <>
          <Divider type="vertical" style={{ height: '24px' }} />

          <div className="toolbar-item">
            <span className="toolbar-label">Radius</span>
            <InputNumber
              min={0}
              max={100}
              value={attributes.cornerRadius}
              onChange={handleCornerRadiusChange}
              style={{ width: '60px' }}
              size="small"
            />
          </div>
        </>
      )}
    </div>
  )
}