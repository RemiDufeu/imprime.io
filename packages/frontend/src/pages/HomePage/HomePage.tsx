import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Empty, App, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { presentationsAPI } from '../../api/api'
import type { PresentationSummary } from '@imprime/sdk'
import SpinnerFullScreen from '../../components/Feedback/SpinnerFullScreen'
import RegularPageContainer from '../../components/Layout/RegularPageContainer/RegularPageContainer'
import PresentationCard from './PresentationCard'
import './HomePage.css'

export default function HomePage() {
  const navigate = useNavigate()
  const { message, modal } = App.useApp()
  const [presentations, setPresentations] = useState<PresentationSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)

  const loadPresentations = async () => {
    setIsLoading(true)
    try {
      const data = await presentationsAPI.getAll()
      setPresentations(data)
    } catch (error) {
      message.error('Failed to load presentations')
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadPresentations()
  }, [])

  const handleCreatePresentation = async () => {
    setIsCreating(true)
    try {
      const newPresentation = await presentationsAPI.create('New Presentation')
      message.success('Presentation created successfully')
      navigate(`/editor/${newPresentation._id}`)
    } catch (error) {
      message.error('Failed to create presentation')
      console.error(error)
    } finally {
      setIsCreating(false)
    }
  }

  const handleDeletePresentation = async (id: string, title: string) => {
    modal.confirm({
      title: 'Delete presentation',
      content: `Are you sure you want to delete "${title}"?`,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      async onOk() {
        try {
          await presentationsAPI.delete(id)
          message.success('Presentation deleted')
          loadPresentations()
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
            My Presentations
          </Typography.Title>
          <Typography.Text type="secondary">
            Manage your presentations and create new ones
          </Typography.Text>
        </div>
        <Button
          type="primary"
          size="large"
          icon={<PlusOutlined />}
          onClick={handleCreatePresentation}
          loading={isCreating}
        >
          New Presentation
        </Button>
      </div>

      {presentations.length === 0 ? (
        <Empty
          className='empty-presentation'
          description="No presentations yet"
        >
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleCreatePresentation}
            loading={isCreating}
          >
            Create my first presentation
          </Button>
        </Empty>
      ) : (
        <div className='presentation-grid'>
          {presentations.map((presentation) => (
            <PresentationCard
              key={presentation._id}
              presentation={presentation}
              onDeleteClicked={() => {handleDeletePresentation(presentation._id, presentation.title)}}
              onDetailClick={() => {navigate(`/editor/${presentation._id}`)}}/>
          ))}
        </div>
      )}
    </RegularPageContainer>
  )
}
