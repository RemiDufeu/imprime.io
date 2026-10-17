import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Empty, App, Space, Typography, Upload } from 'antd'
import { ImportOutlined, PlusOutlined } from '@ant-design/icons'
import { templatesAPI } from '../../api/api'
import { parseApiError } from '../../utils/apiError'
import type { TemplateSummary } from '@imprime/sdk'
import SpinnerFullScreen from '../../components/Feedback/SpinnerFullScreen'
import RegularPageContainer from '../../components/Layout/RegularPageContainer/RegularPageContainer'
import TemplateCard from './TemplateCard'
import CreateTemplateModal from './CreateTemplateModal/CreateTemplateModal'
import ImportCodeModal from './ImportCodeModal/ImportCodeModal'
import './HomePage.css'

// The code a template file says, if it is one that says one: the server
// checks the rest.
function fileCode(content: unknown): string | undefined {
  return typeof content === 'object' && content !== null && 'code' in content && typeof content.code === 'string'
    ? content.code
    : undefined
}

// The file with its code replaced, or taken out for null.
function withCode(content: object, code: string | null): Record<string, unknown> {
  const fields = Object.fromEntries(Object.entries(content).filter(([key]) => key !== 'code'))
  return code === null ? fields : { ...fields, code }
}

// A file refused for a code another template has, waiting for another.
interface CodeConflict {
  content: object
  code: string
}

export default function HomePage() {
  const navigate = useNavigate()
  const { message, modal } = App.useApp()
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [codeConflict, setCodeConflict] = useState<CodeConflict | null>(null)
  const takenCodes = new Set(templates.flatMap(template => (template.code ? [template.code] : [])))

  const loadTemplates = async () => {
    setIsLoading(true)
    try {
      const data = await templatesAPI.getAll()
      setTemplates(data)
    } catch (error) {
      message.error('Failed to load templates')
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadTemplates()
  }, [])

  const handleDeleteTemplate = async (id: string, title: string) => {
    modal.confirm({
      title: 'Delete template',
      content: `Are you sure you want to delete "${title}"?`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      async onOk() {
        try {
          await templatesAPI.delete(id)
          message.success('Template deleted')
          loadTemplates()
        } catch (error) {
          message.error('Failed to delete')
          console.error(error)
        }
      },
    })
  }

  const handleExportTemplate = async (id: string) => {
    try {
      await templatesAPI.downloadFile(id)
    } catch (error) {
      message.error('Failed to export the template')
      console.error(error)
    }
  }

  // A code another template has asks for another one, and the file is sent
  // again with it — as many times as it takes.
  const importContent = async (content: unknown) => {
    setIsImporting(true)
    try {
      const template = await templatesAPI.importFile(content)
      setCodeConflict(null)
      message.success(`"${template.title}" imported`)
      navigate(`/editor/${template._id}`)
    } catch (error) {
      console.error(error)
      const apiError = parseApiError(error)
      const code = fileCode(content)
      if (apiError.code === 'TEMPLATE_CODE_TAKEN' && code !== undefined && typeof content === 'object' && content !== null) {
        setCodeConflict({ content, code })
        return
      }
      setCodeConflict(null)
      // A coded error says what is wrong with the file — not one, a variable
      // or a shape refused, storage full; the rest is not the user's to read.
      message.error(apiError.code ? apiError.message : 'Failed to import the template')
    } finally {
      setIsImporting(false)
    }
  }

  // The server checks the file whole: here it only has to be JSON.
  const handleImportTemplate = async (file: File) => {
    let content: unknown
    try {
      content = JSON.parse(await file.text())
    } catch {
      message.error('This is not an Imprime template file')
      return
    }
    await importContent(content)
  }

  if (isLoading) {
    return ( <SpinnerFullScreen /> )
  }

  return (
    <RegularPageContainer>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <Typography.Title level={1}>
            My Templates
          </Typography.Title>
          <Typography.Text type="secondary">
            Manage your templates and create new ones
          </Typography.Text>
        </div>
        <Space>
          <Upload
            accept=".json,application/json"
            showUploadList={false}
            beforeUpload={(file) => {
              void handleImportTemplate(file)
              // Read here, never uploaded by the component itself.
              return false
            }}
          >
            <Button size="large" icon={<ImportOutlined />} loading={isImporting}>
              Import
            </Button>
          </Upload>
          <Button
            type="primary"
            size="large"
            icon={<PlusOutlined />}
            onClick={() => setIsCreateOpen(true)}
          >
            New Template
          </Button>
        </Space>
      </div>

      {templates.length === 0 ? (
        <Empty
          className='empty-template'
          description="No templates yet"
        >
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setIsCreateOpen(true)}
          >
            Create my first template
          </Button>
        </Empty>
      ) : (
        <div className='template-grid'>
          {templates.map((template) => (
            <TemplateCard
              key={template._id}
              template={template}
              onDeleteClicked={() => {handleDeleteTemplate(template._id, template.title)}}
              onExportClicked={() => {void handleExportTemplate(template._id)}}
              onDetailClick={() => {navigate(`/editor/${template._id}`)}}/>
          ))}
        </div>
      )}

      {codeConflict && (
        <ImportCodeModal
          key={codeConflict.code}
          takenCode={codeConflict.code}
          takenCodes={takenCodes}
          isImporting={isImporting}
          onCancel={() => setCodeConflict(null)}
          onSubmit={(code) => void importContent(withCode(codeConflict.content, code))}
        />
      )}

      <CreateTemplateModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={(template) => navigate(`/editor/${template._id}`)}
      />
    </RegularPageContainer>
  )
}
