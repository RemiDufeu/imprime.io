import { Button, Slider, Tooltip, theme } from 'antd'
import { ZoomInOutlined, ZoomOutOutlined } from '@ant-design/icons'
import { useEditorStore } from '../../../../store/editor/EditorStore'
import { MAX_ZOOM, MIN_ZOOM, ZOOM_LEVELS } from '../../../../store/editor/ZoomSlice'

export default function ZoomBar() {
  const zoom = useEditorStore(state => state.zoom)
  const setZoom = useEditorStore(state => state.setZoom)
  const { token } = theme.useToken()

  const handleZoomIn = () => {
    const currentIndex = ZOOM_LEVELS.findIndex(level => level >= zoom)
    if (currentIndex < ZOOM_LEVELS.length - 1) {
      setZoom(ZOOM_LEVELS[currentIndex + 1])
    }
  }

  const handleZoomOut = () => {
    const currentIndex = ZOOM_LEVELS.findIndex(level => level >= zoom)
    if (currentIndex > 0) {
      setZoom(ZOOM_LEVELS[currentIndex - 1])
    }
  }

  const handleResetZoom = () => {
    setZoom(1)
  }

  const handleSliderChange = (value: number) => {
    setZoom(value)
  }

  const canZoomIn = zoom < MAX_ZOOM
  const canZoomOut = zoom > MIN_ZOOM

  return (
    <div className="zoombar-container">
      <Tooltip title="Zoom out">
        <Button
          className="btn"
          style={{
            color: canZoomOut ? token.colorTextSecondary : token.colorTextDisabled,
          }}
          type="text"
          icon={<ZoomOutOutlined />}
          onClick={handleZoomOut}
          disabled={!canZoomOut}
        />
      </Tooltip>

      <div style={{ width: '140px' }}>
        <Slider
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.05}
          value={zoom}
          onChange={handleSliderChange}
          tooltip={{ formatter: (value) => `${Math.round((value || 0) * 100)}%` }}
        />
      </div>

      <Tooltip title="Reset zoom (100%)">
        <Button
          style={{
            color: token.colorTextSecondary,
            minWidth: '50px',
          }}
          type="text"
          size='small'
          onClick={handleResetZoom}
        >
          {Math.round(zoom * 100)}%
        </Button>
      </Tooltip>

      <Tooltip title="Zoom in">
        <Button
          className="btn"
          style={{
            color: canZoomIn ? token.colorTextSecondary : token.colorTextDisabled,
          }}
          type="text"
          icon={<ZoomInOutlined />}
          onClick={handleZoomIn}
          disabled={!canZoomIn}
        />
      </Tooltip>
    </div>
  )
}
