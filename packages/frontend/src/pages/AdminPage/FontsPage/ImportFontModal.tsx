import { useState } from 'react'
import { Button, Form, Input, Modal, Typography, Upload, message } from 'antd'
import { CloseOutlined, UploadOutlined } from '@ant-design/icons'
import { FONT_VARIANTS } from '@imprime/sdk'
import type { FontDTO, FontVariant } from '@imprime/sdk'
import { fontsAPI } from '../../../api/api'
import { parseApiError } from '../../../utils/apiError'
import {
  FONT_FILE_ACCEPT,
  FONT_FILE_SIZE_LIMIT,
  FONT_VARIANT_LABELS,
  guessFontFamily,
  isFontFileTooLarge,
  readFontFile,
} from './fontFiles'

interface ImportFontModalProps {
  open: boolean
  onClose: () => void
  // Called whenever the instance's fonts changed, including when an import
  // stopped halfway with the family already created.
  onChanged: () => void
}

export default function ImportFontModal({ open, onClose, onChanged }: ImportFontModalProps) {
  const [family, setFamily] = useState('')
  const [files, setFiles] = useState<Partial<Record<FontVariant, File>>>({})
  const [importing, setImporting] = useState(false)

  function close() {
    setFamily('')
    setFiles({})
    onClose()
  }

  function pickFile(variant: FontVariant, file: File) {
    if (isFontFileTooLarge(file)) {
      message.error(`${file.name} is larger than ${FONT_FILE_SIZE_LIMIT}`)
      return
    }
    setFiles(current => ({ ...current, [variant]: file }))
    if (variant === 'regular' && !family) {
      setFamily(guessFontFamily(file.name))
    }
  }

  function clearFile(variant: FontVariant) {
    setFiles(current => ({ ...current, [variant]: undefined }))
  }

  async function handleImport() {
    const regular = files.regular
    if (!regular || !family.trim()) return

    setImporting(true)
    let created: FontDTO.Response | undefined
    try {
      // The regular face creates the family; each other face is its own
      // request, which keeps every request within the API's body limit.
      created = await fontsAPI.create(family.trim(), await readFontFile(regular))
      for (const variant of FONT_VARIANTS) {
        const file = variant === 'regular' ? undefined : files[variant]
        if (file) {
          await fontsAPI.setFace(created._id, variant, await readFontFile(file))
        }
      }
      message.success(`${created.family} imported`)
      close()
    } catch (error) {
      const reason = parseApiError(error).message ?? 'Unknown error'
      message.error(created
        ? `${created.family} was imported, but a face failed: ${reason}`
        : `Import failed: ${reason}`)
    } finally {
      setImporting(false)
      if (created) onChanged()
    }
  }

  return (
    <Modal
      title="Import font"
      open={open}
      onOk={handleImport}
      okText="Import"
      okButtonProps={{ disabled: !files.regular || !family.trim() }}
      confirmLoading={importing}
      onCancel={close}
      cancelText="Cancel"
    >
      <Form layout="vertical">
        <Form.Item label="Name" extra="Text refers to the font by this name.">
          <Input
            placeholder="e.g. Brand Sans"
            value={family}
            maxLength={64}
            onChange={(e) => setFamily(e.target.value)}
          />
        </Form.Item>

        {FONT_VARIANTS.map(variant => {
          const file = files[variant]
          return (
            <Form.Item key={variant} label={FONT_VARIANT_LABELS[variant]} required={variant === 'regular'}>
              <Upload
                accept={FONT_FILE_ACCEPT}
                showUploadList={false}
                beforeUpload={(picked) => {
                  pickFile(variant, picked)
                  // Kept in this component's state, not uploaded by antd.
                  return Upload.LIST_IGNORE
                }}
              >
                <Button icon={<UploadOutlined />}>{file ? file.name : 'Choose file'}</Button>
              </Upload>
              {file && variant !== 'regular' && (
                <Button
                  type="text"
                  icon={<CloseOutlined />}
                  title="Remove file"
                  onClick={() => clearFile(variant)}
                />
              )}
            </Form.Item>
          )
        })}
      </Form>

      <Typography.Text type="secondary">
        TrueType (.ttf) or OpenType (.otf), {FONT_FILE_SIZE_LIMIT} at most per
        file. Text set in a face you do not provide is drawn with the closest
        one you do.
      </Typography.Text>
    </Modal>
  )
}
