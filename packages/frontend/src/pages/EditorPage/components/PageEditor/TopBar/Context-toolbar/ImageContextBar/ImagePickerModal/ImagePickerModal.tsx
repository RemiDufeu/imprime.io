import { useState } from 'react'
import { Empty, Modal, Spin, Tabs, Upload } from 'antd'
import { InboxOutlined, ThunderboltFilled, WarningOutlined } from '@ant-design/icons'
import type { ImageShape } from '@imprime/sdk'
import { collectImageIds } from '@imprime/sdk'
import { useCurrentPage, useEditorStore } from '../../../../../../../../store/editor/EditorStore'
import { itemFieldsInScope } from '../../../../../../../../utils/variableScope'
import { useImageData } from '../../../../../../../../components/page/svg/useImageData'
import './ImagePickerModal.css'

const PICKER_TABS = ['presentation', 'upload', 'variable'] as const
type PickerTab = (typeof PICKER_TABS)[number]

interface VariableOption {
  variableId: string
  // Unset for the variable itself, a field of an iterated item otherwise.
  itemPath?: string
  label: string
}

function ImageThumbnail({ imageId }: { imageId: string }) {
  const data = useImageData(imageId)
  if (data.status === 'loaded') return <img src={data.image.dataUrl} alt="" draggable={false} />
  if (data.status === 'error') return <WarningOutlined className="image-picker-thumbnail-error" />
  return <Spin size="small" />
}

interface ImagePickerModalProps {
  shape: ImageShape
  onClose: () => void
}

// Where an image box's image comes from: an image the presentation already
// shows, a new upload, or an image variable — the template's own, or an image
// field of an item a for-group around the box iterates. Picking one replaces
// whatever the box showed, and closes.
export function ImagePickerModal({ shape, onClose }: ImagePickerModalProps) {
  const pages = useEditorStore(state => state.template?.pages)
  const variables = useEditorStore(state => state.template?.variableData)
  const updateShape = useEditorStore(state => state.updateShape)
  const importImageFileInto = useEditorStore(state => state.importImageFileInto)
  const currentPage = useCurrentPage()
  const [uploading, setUploading] = useState(false)

  // Every page, once each, in the order they show them.
  const imageIds = [...new Set((pages ?? []).flatMap(page => collectImageIds(page.shapes)))]
  const variableOptions: VariableOption[] = [
    ...(variables ?? [])
      .filter(variable => variable.type === 'image')
      .map(variable => ({ variableId: variable._id, label: variable.name })),
    ...itemFieldsInScope(currentPage?.shapes ?? [], shape.id, variables ?? [], 'image').map(option => ({
      variableId: option.variableId,
      itemPath: option.itemPath,
      label: option.label,
    })),
  ]

  const [tab, setTab] = useState<PickerTab>(() => {
    if (shape.imageVariable) return 'variable'
    return imageIds.length > 0 ? 'presentation' : 'upload'
  })

  const chooseImage = (imageId: string) => {
    updateShape(shape.id, { imageId, alt: undefined, crop: undefined, imageVariable: undefined, itemPath: undefined })
    onClose()
  }

  // A crop belongs to one image, and each export brings another.
  const chooseVariable = (option: VariableOption) => {
    updateShape(shape.id, {
      imageVariable: option.variableId,
      itemPath: option.itemPath,
      imageId: undefined,
      alt: undefined,
      crop: undefined,
    })
    onClose()
  }

  const uploadFile = async (file: File) => {
    setUploading(true)
    const uploaded = await importImageFileInto(shape.id, file)
    setUploading(false)
    if (uploaded) onClose()
  }

  const isBoundTo = (option: VariableOption) =>
    shape.imageVariable === option.variableId && (shape.itemPath ?? '') === (option.itemPath ?? '')

  return (
    <Modal open title="Choose image" width={640} footer={null} onCancel={onClose}>
      <Tabs
        activeKey={tab}
        onChange={key => {
          const next = PICKER_TABS.find(name => name === key)
          if (next) setTab(next)
        }}
        items={[
          {
            key: 'presentation',
            label: 'Presentation',
            children: imageIds.length === 0 ? (
              <Empty
                className="image-picker-empty"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No image in this presentation yet"
              />
            ) : (
              <div className="image-picker-grid">
                {imageIds.map(imageId => (
                  <button
                    key={imageId}
                    type="button"
                    className={
                      !shape.imageVariable && shape.imageId === imageId
                        ? 'image-picker-thumbnail selected'
                        : 'image-picker-thumbnail'
                    }
                    onClick={() => chooseImage(imageId)}
                  >
                    <ImageThumbnail imageId={imageId} />
                  </button>
                ))}
              </div>
            ),
          },
          {
            key: 'upload',
            label: 'Upload',
            children: (
              <Upload.Dragger
                accept="image/*"
                multiple={false}
                showUploadList={false}
                disabled={uploading}
                // Uploaded by the store, not by antd: false stops antd's own request.
                beforeUpload={(file) => {
                  void uploadFile(file)
                  return false
                }}
              >
                <p className="ant-upload-drag-icon">{uploading ? <Spin /> : <InboxOutlined />}</p>
                <p className="ant-upload-text">Click or drag an image here</p>
                <p className="ant-upload-hint">PNG and JPEG are kept as they are; other formats become PNG.</p>
              </Upload.Dragger>
            ),
          },
          {
            key: 'variable',
            label: 'Variable',
            children: variableOptions.length === 0 ? (
              <Empty
                className="image-picker-empty"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="No image variable: create one, of type Image, from the Variables button"
              />
            ) : (
              <div className="image-picker-variables">
                {variableOptions.map(option => (
                  <button
                    key={`${option.variableId}:${option.itemPath ?? ''}`}
                    type="button"
                    className={isBoundTo(option) ? 'image-picker-variable selected' : 'image-picker-variable'}
                    onClick={() => chooseVariable(option)}
                  >
                    <ThunderboltFilled className="image-picker-variable-icon" />
                    {option.label}
                  </button>
                ))}
              </div>
            ),
          },
        ]}
      />
    </Modal>
  )
}
