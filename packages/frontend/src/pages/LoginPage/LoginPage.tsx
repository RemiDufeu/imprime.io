import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Button, Card, Space, Typography, message } from 'antd'
import { GithubOutlined, GoogleOutlined, WindowsOutlined } from '@ant-design/icons'
import { signIn, useSession } from '../../auth/authClient'
import FullScreen from '../../components/Layout/FullScreen/FullScreen'
import SpinnerFullScreen from '../../components/Feedback/SpinnerFullScreen'

type Provider = 'google' | 'microsoft' | 'github'

export default function LoginPage() {
  const { data, isPending } = useSession()
  const [loading, setLoading] = useState<Provider | null>(null)

  async function handleSignIn(provider: Provider) {
    setLoading(provider)
    try {
      // Redirige vers le provider, puis revient sur '/'.
      await signIn.social({ provider, callbackURL: '/' })
    } catch {
      message.error(`Connexion via ${provider} impossible`)
      setLoading(null)
    }
  }

  if (isPending) return <SpinnerFullScreen />
  if (data) return <Navigate to="/" replace />

  return (
    <FullScreen>
      <Card style={{ width: 360, textAlign: 'center' }}>
        <Typography.Title level={3} style={{ marginBottom: 24 }}>
          Imprime.io
        </Typography.Title>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Button
            block
            size="large"
            icon={<GoogleOutlined />}
            loading={loading === 'google'}
            onClick={() => handleSignIn('google')}
          >
            Continuer avec Google
          </Button>
          <Button
            block
            size="large"
            icon={<WindowsOutlined />}
            loading={loading === 'microsoft'}
            onClick={() => handleSignIn('microsoft')}
          >
            Continuer avec Microsoft
          </Button>
          <Button
            block
            size="large"
            icon={<GithubOutlined />}
            loading={loading === 'github'}
            onClick={() => handleSignIn('github')}
          >
            Continuer avec GitHub
          </Button>
        </Space>
      </Card>
    </FullScreen>
  )
}
