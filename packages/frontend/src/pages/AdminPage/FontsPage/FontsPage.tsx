import { useEffect, useState } from 'react'
import { Button, Card, List, Popconfirm, Typography, Upload, message } from 'antd'
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { DEFAULT_FONT, FONT_VARIANTS, importedFontFamilyName } from '@imprime/sdk'
import type { FontDTO, FontVariant } from '@imprime/sdk'
import { fontsAPI } from '../../../api/api'
import { registerImportedFont } from '../../../fonts'
import { parseApiError } from '../../../utils/apiError'
import ImportFontModal from './ImportFontModal'
import {
  FONT_FILE_ACCEPT,
  FONT_FILE_SIZE_LIMIT,
  FONT_VARIANT_LABELS,
  formatFileSize,
  isFontFileTooLarge,
  readFontFile,
} from './fontFiles'
import './FontsPage.css'

// Loaded so each family's name can be shown in the family itself.
function preview(font: FontDTO.Response) {
  registerImportedFont(font).catch(error => console.error(`Failed to load font "${font.family}":`, error))
}

function errorMessage(error: unknown, fallback: string): string {
  return parseApiError(error).message ?? fallback
}

export default function FontsPage() {
  const [fonts, setFonts] = useState<FontDTO.Response[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)

  async function loadFonts() {
    setLoading(true)
    try {
      const list = await fontsAPI.list()
      list.forEach(preview)
      setFonts(list)
    } catch (error) {
      message.error(errorMessage(error, 'Failed to load fonts'))
    }
    setLoading(false)
  }

  useEffect(() => {
    void loadFonts()
  }, [])

  function replaceFont(updated: FontDTO.Response) {
    preview(updated)
    setFonts(current => current.map(font => font._id === updated._id ? updated : font))
  }

  async function handleSetFace(font: FontDTO.Response, variant: FontVariant, file: File) {
    if (isFontFileTooLarge(file)) {
      message.error(`${file.name} is larger than ${FONT_FILE_SIZE_LIMIT}`)
      return
    }
    try {
      replaceFont(await fontsAPI.setFace(font._id, variant, await readFontFile(file)))
      message.success(`${FONT_VARIANT_LABELS[variant]} face of ${font.family} updated`)
    } catch (error) {
      message.error(errorMessage(error, 'Failed to upload the face'))
    }
  }

  async function handleRemoveFace(font: FontDTO.Response, variant: Exclude<FontVariant, 'regular'>) {
    try {
      replaceFont(await fontsAPI.deleteFace(font._id, variant))
    } catch (error) {
      message.error(errorMessage(error, 'Failed to remove the face'))
    }
  }

  async function handleDelete(font: FontDTO.Response) {
    try {
      await fontsAPI.delete(font._id)
      setFonts(current => current.filter(f => f._id !== font._id))
      message.success(`${font.family} deleted`)
    } catch (error) {
      message.error(errorMessage(error, 'Failed to delete the font'))
    }
  }

  return (
    <>
      <Card
        title="Fonts"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            Import font
          </Button>
        }
      >
        <Typography.Paragraph type="secondary">
          Fonts imported here are available to every user of this instance, in
          the editor and in exported PDFs, alongside the built-in ones.
        </Typography.Paragraph>

        <List
          loading={loading}
          dataSource={fonts}
          locale={{ emptyText: 'No imported fonts' }}
          renderItem={(font) => (
            <List.Item
              actions={[
                <Popconfirm
                  key="delete"
                  title={`Delete ${font.family}?`}
                  description={`Text using it, in every presentation, will be drawn in ${DEFAULT_FONT}.`}
                  onConfirm={() => handleDelete(font)}
                  okText="Delete"
                  okButtonProps={{ danger: true }}
                  cancelText="Cancel"
                >
                  <Button danger type="text" icon={<DeleteOutlined />} title="Delete font" />
                </Popconfirm>,
              ]}
            >
              <List.Item.Meta
                title={
                  <span className="font-family-name" style={{ fontFamily: importedFontFamilyName(font) }}>
                    {font.family}
                  </span>
                }
                description={
                  <div className="font-faces">
                    {FONT_VARIANTS.map(variant => {
                      const face = font.faces[variant]
                      return (
                        <div key={variant} className="font-face-row">
                          <Typography.Text>{FONT_VARIANT_LABELS[variant]}</Typography.Text>
                          <Typography.Text type={face ? undefined : 'secondary'} ellipsis>
                            {face ? `${face.originalName ?? 'Font file'} · ${formatFileSize(face.size)}` : 'Not provided'}
                          </Typography.Text>
                          <Upload
                            accept={FONT_FILE_ACCEPT}
                            showUploadList={false}
                            beforeUpload={(file) => {
                              void handleSetFace(font, variant, file)
                              // Sent by handleSetFace, not uploaded by antd.
                              return Upload.LIST_IGNORE
                            }}
                          >
                            <Button type="link" size="small">{face ? 'Replace' : 'Add'}</Button>
                          </Upload>
                          {face && variant !== 'regular' ? (
                            <Popconfirm
                              title={`Remove the ${FONT_VARIANT_LABELS[variant].toLowerCase()} face?`}
                              description="Text set in it will use the closest face left."
                              onConfirm={() => handleRemoveFace(font, variant)}
                              okText="Remove"
                              cancelText="Cancel"
                            >
                              <Button type="link" size="small" danger>Remove</Button>
                            </Popconfirm>
                          ) : <span />}
                        </div>
                      )
                    })}
                  </div>
                }
              />
            </List.Item>
          )}
        />
      </Card>

      <ImportFontModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onChanged={() => void loadFonts()}
      />
    </>
  )
}
