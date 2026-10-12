import { useRef, useState } from 'react'
import { Alert, Button, Modal, Spin } from 'antd'
import type { ImageCrop } from '@imprime/sdk'
import { FULL_IMAGE_CROP, getImageCrop } from '@imprime/sdk'
import { useImageData } from '../../../../../../../../components/page/svg/useImageData'
import './ImageCropModal.css'

// The image is shown as large as fits this area, whatever its own size.
const VIEW_MAX_WIDTH = 640
const VIEW_MAX_HEIGHT = 480
// The smallest crop, as a fraction of each side of the image.
const MIN_CROP = 0.02

type Handle = 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
const RESIZE_HANDLES: Exclude<Handle, 'move'>[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

// `start` dragged by (dx, dy), in fractions of the image: moved whole, or by
// the edges `handle` holds, inside the image and never below MIN_CROP.
function dragCrop(start: ImageCrop, handle: Handle, dx: number, dy: number): ImageCrop {
  if (handle === 'move') {
    return {
      ...start,
      x: clamp(start.x + dx, 0, 1 - start.width),
      y: clamp(start.y + dy, 0, 1 - start.height),
    }
  }
  let left = start.x
  let top = start.y
  let right = start.x + start.width
  let bottom = start.y + start.height
  if (handle.includes('w')) left = clamp(left + dx, 0, right - MIN_CROP)
  if (handle.includes('e')) right = clamp(right + dx, left + MIN_CROP, 1)
  if (handle.includes('n')) top = clamp(top + dy, 0, bottom - MIN_CROP)
  if (handle.includes('s')) bottom = clamp(bottom + dy, top + MIN_CROP, 1)
  return { x: left, y: top, width: right - left, height: bottom - top }
}

// Within a pixel of the whole image at any view size: stored as no crop.
const EPSILON = 0.001
const isWholeImage = (crop: ImageCrop) =>
  crop.x < EPSILON && crop.y < EPSILON && crop.width > 1 - EPSILON && crop.height > 1 - EPSILON

interface ImageCropModalProps {
  imageId: string
  crop: ImageCrop | undefined
  // Unset is the whole image.
  onApply: (crop: ImageCrop | undefined) => void
  onClose: () => void
}

// The whole image with the part a box shows framed; the frame is moved by
// dragging it and resized by its handles. Nothing is written until applied.
export function ImageCropModal({ imageId, crop, onApply, onClose }: ImageCropModalProps) {
  const data = useImageData(imageId)
  const [draft, setDraft] = useState(() => getImageCrop(crop))
  // The drag in progress: what it holds, where it started, and the crop then.
  const drag = useRef<{ handle: Handle; clientX: number; clientY: number; start: ImageCrop } | null>(null)

  const scale = data.status === 'loaded'
    ? Math.min(VIEW_MAX_WIDTH / data.image.width, VIEW_MAX_HEIGHT / data.image.height)
    : 0
  const view = data.status === 'loaded'
    ? { width: data.image.width * scale, height: data.image.height * scale }
    : null

  const startDrag = (handle: Handle) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    // Moves keep coming here, and bubbling to the frame, outside the image.
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { handle, clientX: e.clientX, clientY: e.clientY, start: draft }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current
    if (!current || !view) return
    const dx = (e.clientX - current.clientX) / view.width
    const dy = (e.clientY - current.clientY) / view.height
    setDraft(dragCrop(current.start, current.handle, dx, dy))
  }

  const endDrag = () => {
    drag.current = null
  }

  const apply = () => {
    onApply(isWholeImage(draft) ? undefined : draft)
    onClose()
  }

  // Computed geometry, in percentages of the image shown.
  const selection = {
    left: `${draft.x * 100}%`,
    top: `${draft.y * 100}%`,
    width: `${draft.width * 100}%`,
    height: `${draft.height * 100}%`,
  }

  return (
    <Modal
      open
      title="Crop image"
      width={VIEW_MAX_WIDTH + 48}
      onCancel={onClose}
      footer={[
        <Button key="reset" onClick={() => setDraft(FULL_IMAGE_CROP)} disabled={isWholeImage(draft)}>
          Reset
        </Button>,
        <Button key="cancel" onClick={onClose}>Cancel</Button>,
        <Button key="apply" type="primary" onClick={apply} disabled={!view}>Apply</Button>,
      ]}
    >
      <div className="image-crop-stage">
        {data.status === 'loaded' && view ? (
          <div
            className="image-crop-frame"
            style={{ width: view.width, height: view.height }}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <img className="image-crop-image" src={data.image.dataUrl} alt="" draggable={false} />
            <div className="image-crop-mask">
              <div className="image-crop-hole" style={selection} />
            </div>
            <div className="image-crop-selection" style={selection} onPointerDown={startDrag('move')}>
              {RESIZE_HANDLES.map(handle => (
                <div
                  key={handle}
                  className={`image-crop-handle image-crop-handle-${handle}`}
                  onPointerDown={startDrag(handle)}
                />
              ))}
            </div>
          </div>
        ) : data.status === 'error' ? (
          <Alert type="error" message="The image could not be loaded." showIcon />
        ) : (
          <Spin />
        )}
      </div>
    </Modal>
  )
}
