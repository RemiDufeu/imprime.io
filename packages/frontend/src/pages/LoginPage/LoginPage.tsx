import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Button, Card, Divider, Form, Input, Space, Tabs, Typography, message } from 'antd'
import { GithubOutlined, GoogleOutlined, WindowsOutlined } from '@ant-design/icons'
import type { EnabledAuthProviders } from '@imprime/sdk'
import { signIn, signUp, useSession } from '../../auth/authClient'
import { imprimeClient } from '../../api/api'
import FullScreen from '../../components/Layout/FullScreen/FullScreen'
import SpinnerFullScreen from '../../components/Feedback/SpinnerFullScreen'

type SocialProvider = 'google' | 'microsoft' | 'github'

type SignInValues = { email: string; password: string }
type SignUpValues = { name: string; email: string; password: string }

export default function LoginPage() {
  const { data, isPending } = useSession()
  const [socialLoading, setSocialLoading] = useState<SocialProvider | null>(null)
  const [emailLoading, setEmailLoading] = useState(false)
  const [providers, setProviders] = useState<EnabledAuthProviders | null>(null)

  useEffect(() => {
    imprimeClient
      .getAuthProviders()
      .then(setProviders)
      .catch(() =>
        setProviders({ emailPassword: true, google: false, github: false, microsoft: false }),
      )
  }, [])

  async function handleSocialSignIn(provider: SocialProvider) {
    setSocialLoading(provider)
    try {
      await signIn.social({ provider, callbackURL: '/' })
    } catch {
      message.error(`Connexion via ${provider} impossible`)
      setSocialLoading(null)
    }
  }

  async function handleEmailSignIn(values: SignInValues) {
    setEmailLoading(true)
    const { error } = await signIn.email({
      email: values.email,
      password: values.password,
      callbackURL: '/',
    })
    if (error) {
      message.error(error.message || 'Identifiants invalides')
      setEmailLoading(false)
    }
  }

  async function handleEmailSignUp(values: SignUpValues) {
    setEmailLoading(true)
    const { error } = await signUp.email({
      email: values.email,
      password: values.password,
      name: values.name,
      callbackURL: '/',
    })
    if (error) {
      message.error(error.message || 'Inscription impossible')
      setEmailLoading(false)
    }
  }

  if (isPending || !providers) return <SpinnerFullScreen />
  if (data) return <Navigate to="/" replace />

  const hasSocial = providers.google || providers.microsoft || providers.github

  return (
    <FullScreen>
      <Card style={{ width: 380, textAlign: 'center' }}>
        <Typography.Title level={3} style={{ marginBottom: 24 }}>
          Imprime.io
        </Typography.Title>

        {providers.emailPassword && (
          <Tabs
            defaultActiveKey="signin"
            centered
            items={[
              {
                key: 'signin',
                label: 'Connexion',
                children: (
                  <Form<SignInValues>
                    layout="vertical"
                    onFinish={handleEmailSignIn}
                    requiredMark={false}
                  >
                    <Form.Item
                      name="email"
                      label="Email"
                      rules={[{ required: true, type: 'email', message: 'Email invalide' }]}
                    >
                      <Input size="large" autoComplete="email" />
                    </Form.Item>
                    <Form.Item
                      name="password"
                      label="Mot de passe"
                      rules={[{ required: true, min: 8, message: '8 caractères minimum' }]}
                    >
                      <Input.Password size="large" autoComplete="current-password" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block size="large" loading={emailLoading}>
                      Se connecter
                    </Button>
                  </Form>
                ),
              },
              {
                key: 'signup',
                label: 'Inscription',
                children: (
                  <Form<SignUpValues>
                    layout="vertical"
                    onFinish={handleEmailSignUp}
                    requiredMark={false}
                  >
                    <Form.Item
                      name="name"
                      label="Nom"
                      rules={[{ required: true, message: 'Nom requis' }]}
                    >
                      <Input size="large" autoComplete="name" />
                    </Form.Item>
                    <Form.Item
                      name="email"
                      label="Email"
                      rules={[{ required: true, type: 'email', message: 'Email invalide' }]}
                    >
                      <Input size="large" autoComplete="email" />
                    </Form.Item>
                    <Form.Item
                      name="password"
                      label="Mot de passe"
                      rules={[{ required: true, min: 8, message: '8 caractères minimum' }]}
                    >
                      <Input.Password size="large" autoComplete="new-password" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block size="large" loading={emailLoading}>
                      Créer un compte
                    </Button>
                  </Form>
                ),
              },
            ]}
          />
        )}

        {providers.emailPassword && hasSocial && <Divider plain>ou</Divider>}

        {hasSocial && (
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            {providers.google && (
              <Button
                block
                size="large"
                icon={<GoogleOutlined />}
                loading={socialLoading === 'google'}
                onClick={() => handleSocialSignIn('google')}
              >
                Continuer avec Google
              </Button>
            )}
            {providers.microsoft && (
              <Button
                block
                size="large"
                icon={<WindowsOutlined />}
                loading={socialLoading === 'microsoft'}
                onClick={() => handleSocialSignIn('microsoft')}
              >
                Continuer avec Microsoft
              </Button>
            )}
            {providers.github && (
              <Button
                block
                size="large"
                icon={<GithubOutlined />}
                loading={socialLoading === 'github'}
                onClick={() => handleSocialSignIn('github')}
              >
                Continuer avec GitHub
              </Button>
            )}
          </Space>
        )}
      </Card>
    </FullScreen>
  )
}
