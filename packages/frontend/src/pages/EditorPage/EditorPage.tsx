import { useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Alert, Button } from 'antd'
import SlideEditor from './components/SlideEditor/SlideEditor'
import FullScreen from '../../components/Layout/FullScreen/FullScreen'
import SpinnerFullScreen from '../../components/Feedback/SpinnerFullScreen'
import SlideList from './components/SlideList'
import './EditorPage.css'
import { useEditorStore } from '../../store/editor/EditorStore'

export default function EditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const presentation = useEditorStore(state => state.presentation)
  const isLoading = useEditorStore(state => state.isLoading)
  const error = useEditorStore(state => state.error)
  const loadPresentation = useEditorStore(state => state.loadPresentation)
  const hasAttemptedLoad = useRef(false)

  useEffect(() => {
    if (id && !hasAttemptedLoad.current) {
      hasAttemptedLoad.current = true
      loadPresentation(id)
    }
  }, [id, loadPresentation])

  if (isLoading) {
    return (<SpinnerFullScreen />)
  }

  if (error) {
    return (
      <FullScreen>
        <div style={{ maxWidth: '500px', width: '100%' }}>
          <Alert
            message="Error"
            description={error}
            type="error"
            showIcon
          />
        </div>
      </FullScreen>
    )
  }

  if (!presentation) {
    return (
      <FullScreen>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#6b7280', marginBottom: '16px' }}>
            Presentation not found
          </p>
          <Button
            type="primary"
            onClick={() => navigate('/')}
          >
            Back to home
          </Button>
        </div>
      </FullScreen>
    )
  }

  return (<>
    <div className='page-container'>
      <SlideList />
      <SlideEditor />
    </div>
  </>)
}
