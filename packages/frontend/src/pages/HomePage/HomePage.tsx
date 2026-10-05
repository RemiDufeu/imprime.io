import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Empty, App, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { templatesAPI } from '../../api/api'
import type { TemplateSummary } from '@imprime/sdk'
import SpinnerFullScreen from '../../components/Feedback/SpinnerFullScreen'
import RegularPageContainer from '../../components/Layout/RegularPageContainer/RegularPageContainer'
import TemplateCard from './TemplateCard'
import CreateTemplateModal from './CreateTemplateModal/CreateTemplateModal'
import './HomePage.css'

export default function HomePage() {
  const navigate = useNavigate()
  const { message, modal } = App.useApp()
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateOpen, setIsCreateOpen] = useState(false)

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
        <Button
          type="primary"
          size="large"
          icon={<PlusOutlined />}
          onClick={() => setIsCreateOpen(true)}
        >
          New Template
        </Button>
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
              onDetailClick={() => {navigate(`/editor/${template._id}`)}}/>
          ))}
        </div>
      )}

      <CreateTemplateModal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={(template) => navigate(`/editor/${template._id}`)}
      />
    </RegularPageContainer>
  )
}
