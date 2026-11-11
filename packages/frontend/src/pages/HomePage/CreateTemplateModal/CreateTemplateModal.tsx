import { useState } from 'react'
import { App, Form, Input, InputNumber, Modal, Segmented, Typography } from 'antd'
import { MAX_PAGE_DIMENSION, MIN_PAGE_DIMENSION, PAGE_FORMATS, isValidPageSize } from '@imprime/sdk'
import type { PageFormatId, PageSize, Template } from '@imprime/sdk'
import { templatesAPI } from '../../../api/api'
import { parseApiError } from '../../../utils/apiError'
import './CreateTemplateModal.css'

type FormatChoice = PageFormatId | 'custom'

// Sides as the inputs hold them: null while one is cleared.
interface CustomSize {
  width: number | null
  height: number | null
}

const DEFAULT_TITLE = 'New Template'
const DEFAULT_FORMAT = PAGE_FORMATS[0]

// The longer side of a format's preview, in pixels.
const PREVIEW_SIZE = 40

interface CreateTemplateModalProps {
  open: boolean
  onClose: () => void
  onCreated: (template: Template) => void
}

export default function CreateTemplateModal({ open, onClose, onCreated }: CreateTemplateModalProps) {
  const { message } = App.useApp()
  const [title, setTitle] = useState(DEFAULT_TITLE)
  const [format, setFormat] = useState<FormatChoice>(DEFAULT_FORMAT.id)
  const [customSize, setCustomSize] = useState<CustomSize>(DEFAULT_FORMAT.size)
  const [creating, setCreating] = useState(false)

  const preset = PAGE_FORMATS.find(f => f.id === format)
  const pageSize = preset ? preset.size : customSize
  const isValid = isValidPageSize(pageSize)

  function close() {
    setTitle(DEFAULT_TITLE)
    setFormat(DEFAULT_FORMAT.id)
    setCustomSize(DEFAULT_FORMAT.size)
    onClose()
  }

  function chooseFormat(choice: FormatChoice) {
    // A custom size starts from the format chosen until now.
    if (choice === 'custom' && preset) setCustomSize(preset.size)
    setFormat(choice)
  }

  async function handleCreate() {
    if (creating || !isValidPageSize(pageSize)) return
    setCreating(true)
    try {
      const template = await templatesAPI.create(title.trim() || undefined, pageSize)
      message.success('Template created')
      onCreated(template)
    } catch (error) {
      message.error(`Failed to create template: ${parseApiError(error).message ?? 'Unknown error'}`)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Modal
      title="New template"
      open={open}
      onOk={handleCreate}
      okText="Create"
      okButtonProps={{ disabled: !isValid }}
      confirmLoading={creating}
      onCancel={close}
      cancelText="Cancel"
      width={560}
    >
      <Form layout="vertical">
        <Form.Item label="Name">
          <Input
            placeholder="Untitled Template"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onPressEnter={handleCreate}
          />
        </Form.Item>

        <Form.Item label="Page format">
          <Segmented<FormatChoice>
            className="create-template-format"
            block
            value={format}
            onChange={chooseFormat}
            options={[
              ...PAGE_FORMATS.map(f => ({
                value: f.id,
                label: <FormatOption label={f.label} size={f.size} />,
              })),
              {
                value: 'custom',
                label: <FormatOption label="Custom" hideSize={true} size={isValidPageSize(customSize) ? customSize : undefined} />,
              },
            ]}
          />
        </Form.Item>

        {format === 'custom' && (
          <>
            <div className="create-template-custom-size">
              <Form.Item label="Width" required>
                <InputNumber
                  min={MIN_PAGE_DIMENSION}
                  max={MAX_PAGE_DIMENSION}
                  precision={0}
                  value={customSize.width}
                  onChange={(width) => setCustomSize(current => ({ ...current, width }))}
                />
              </Form.Item>
              <Form.Item label="Height" required>
                <InputNumber
                  min={MIN_PAGE_DIMENSION}
                  max={MAX_PAGE_DIMENSION}
                  precision={0}
                  value={customSize.height}
                  onChange={(height) => setCustomSize(current => ({ ...current, height }))}
                />
              </Form.Item>
            </div>
            <Typography.Text type="secondary">
              Whole numbers from {MIN_PAGE_DIMENSION} to {MAX_PAGE_DIMENSION}. One
              unit is one point in the PDF.
            </Typography.Text>
          </>
        )}
      </Form>
    </Modal>
  )
}

// A format as the picker shows it: its page in proportion, its name and size.
// `size` is undefined while a custom size is incomplete.
function FormatOption({ label, size, hideSize }: { label: string; size?: PageSize; hideSize?: boolean }) {
  const scale = size ? PREVIEW_SIZE / Math.max(size.width, size.height) : 0
  return (
    <div className="create-template-format-option">
      <div className="create-template-format-preview">
        <div
          className={size ? 'create-template-format-page' : 'create-template-format-page unknown'}
          style={size ? { width: size.width * scale, height: size.height * scale } : undefined}
        />
      </div>
      <div>{label}</div>
      {!hideSize && (
        <div className="create-template-format-size">
          {size ? `${size.width} × ${size.height}` : '—'}
        </div>
      )}
    </div>
  )
}
