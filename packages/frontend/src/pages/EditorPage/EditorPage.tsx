import { useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Alert, Button } from 'antd'
import FullScreen from '../../components/Layout/FullScreen/FullScreen'
import SpinnerFullScreen from '../../components/Feedback/SpinnerFullScreen'
import './EditorPage.css'
import { useEditorStore } from '../../store/editor/EditorStore'
import PageEditor from './components/PageEditor/PageEditor'

export default function EditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const template = useEditorStore(state => state.template)
  const isLoading = useEditorStore(state => state.isLoading)
  const error = useEditorStore(state => state.error)
  const loadTemplate = useEditorStore(state => state.loadTemplate)
  const loadFonts = useEditorStore(state => state.loadFonts)
  // The id loaded last: the route can change template without remounting
  // the page (history navigation between two editors).
  const loadedId = useRef<string | null>(null)

  useEffect(() => {
    if (id && loadedId.current !== id) {
      loadedId.current = id
      // Fonts after the template: only the ones its text uses are loaded.
      void loadTemplate(id).then(loadFonts)
    }
  }, [id, loadTemplate, loadFonts])

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

  if (!template) {
    return (
      <FullScreen>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#6b7280', marginBottom: '16px' }}>
            Template not found
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

  return (
    <div className='page-container'>
      <PageEditor />
    </div>
  )
}
