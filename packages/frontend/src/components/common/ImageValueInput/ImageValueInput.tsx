import { useRef, useState } from 'react'
import { Button, Tooltip, Typography } from 'antd'
import { DeleteOutlined, PictureOutlined, UploadOutlined } from '@ant-design/icons'
import { imageFileToDataUrl, readImageDataUrl } from '../../../utils/imageFile'
import './ImageValueInput.css'

// The export's whole request is capped at 10 MB by the server (express.json in
// server.ts), every variable together: one image may take half of it.
const MAX_DATA_URL_LENGTH = 5 * 1024 * 1024

// How large a vector image is redrawn, when it has no page to be measured
// against: about as large as a page's longer side.
const DEFAULT_VECTOR_SIZE = 2048

interface ImageValueInputProps {
  // antd Form control contract: the form owns the value, a PNG or JPEG data URL.
  value?: string
  onChange?: (value: string | undefined) => void
  disabled?: boolean
  vectorSize?: number
  // For a table cell: the thumbnail is the button, and an error shows on
  // hover rather than under it.
  compact?: boolean
}

/**
 * An image variable's value: a file picked from the computer, held as a data
 * URL — what the export takes — and checked as the server will check it.
 */
export function ImageValueInput({
  value,
  onChange,
  disabled,
  vectorSize = DEFAULT_VECTOR_SIZE,
  compact = false,
}: ImageValueInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | undefined>()

  const pick = async (file: File) => {
    let dataUrl: string
    try {
      ({ dataUrl } = await imageFileToDataUrl(file, vectorSize))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to read image file')
      return
    }
    if (dataUrl.length > MAX_DATA_URL_LENGTH) {
      setError(`This image is too large: at most ${MAX_DATA_URL_LENGTH / 1024 / 1024} MB once encoded`)
      return
    }
    // Kept as the export draws it: typed by its bytes, not by the file's name.
    const image = readImageDataUrl(dataUrl)
    if (!image) {
      setError('This image cannot be read: the file is damaged')
      return
    }
    setError(undefined)
    onChange?.(image.dataUrl)
  }

  const preview = value ? <img src={value} alt="" draggable={false} /> : <PictureOutlined />
  const choose = () => inputRef.current?.click()

  return (
    <div className={compact ? 'image-value-input compact' : 'image-value-input'}>
      <div className="image-value-input-row">
        {compact ? (
          <Tooltip title={error ?? (value ? 'Replace image' : 'Choose image')}>
            <button
              type="button"
              className={error ? 'image-value-input-preview error' : 'image-value-input-preview'}
              disabled={disabled}
              onClick={choose}
            >
              {preview}
            </button>
          </Tooltip>
        ) : (
          <>
            <div className="image-value-input-preview">{preview}</div>
            <Button size="small" icon={<UploadOutlined />} disabled={disabled} onClick={choose}>
              {value ? 'Replace' : 'Choose image'}
            </Button>
          </>
        )}
        {value && (
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            title="Remove image"
            disabled={disabled}
            onClick={() => onChange?.(undefined)}
          />
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0]
            // Cleared, so picking the same file again still reports a change.
            e.target.value = ''
            if (file) void pick(file)
          }}
        />
      </div>
      {error && !compact && <Typography.Text type="danger">{error}</Typography.Text>}
    </div>
  )
}
