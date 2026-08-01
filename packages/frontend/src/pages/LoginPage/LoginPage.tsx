import { useEffect, useMemo, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
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
  const [params] = useSearchParams()

  // Where to land after a successful login:
  // - explicit `redirect` param takes priority (used to resume OAuth flows)
  // - `consent_code` means Better Auth's MCP plugin bounced the user here mid-flow
  // - otherwise the home page
  const postLoginTarget = useMemo(() => {
    const redirect = params.get('redirect')
    if (redirect) return redirect
    const consentCode = params.get('consent_code')
    if (consentCode) return `/oauth/consent?consent_code=${encodeURIComponent(consentCode)}`
    return '/'
  }, [params])

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
      await signIn.social({ provider, callbackURL: postLoginTarget })
    } catch {
      message.error(`Sign-in with ${provider} failed`)
      setSocialLoading(null)
    }
  }

  async function handleEmailSignIn(values: SignInValues) {
    setEmailLoading(true)
    const { error } = await signIn.email({
      email: values.email,
      password: values.password,
      callbackURL: postLoginTarget,
    })
    if (error) {
      message.error(error.message || 'Invalid credentials')
      setEmailLoading(false)
    }
  }

  async function handleEmailSignUp(values: SignUpValues) {
    setEmailLoading(true)
    const { error } = await signUp.email({
      email: values.email,
      password: values.password,
      name: values.name,
      callbackURL: postLoginTarget,
    })
    if (error) {
      message.error(error.message || 'Sign-up failed')
      setEmailLoading(false)
    }
  }

  if (isPending || !providers) return <SpinnerFullScreen />
  if (data) return <Navigate to={postLoginTarget} replace />

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
                label: 'Sign in',
                children: (
                  <Form<SignInValues>
                    layout="vertical"
                    onFinish={handleEmailSignIn}
                    requiredMark={false}
                  >
                    <Form.Item
                      name="email"
                      label="Email"
                      rules={[{ required: true, type: 'email', message: 'Invalid email' }]}
                    >
                      <Input size="large" autoComplete="email" />
                    </Form.Item>
                    <Form.Item
                      name="password"
                      label="Password"
                      rules={[{ required: true, min: 8, message: 'At least 8 characters' }]}
                    >
                      <Input.Password size="large" autoComplete="current-password" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block size="large" loading={emailLoading}>
                      Sign in
                    </Button>
                  </Form>
                ),
              },
              {
                key: 'signup',
                label: 'Sign up',
                children: (
                  <Form<SignUpValues>
                    layout="vertical"
                    onFinish={handleEmailSignUp}
                    requiredMark={false}
                  >
                    <Form.Item
                      name="name"
                      label="Name"
                      rules={[{ required: true, message: 'Name required' }]}
                    >
                      <Input size="large" autoComplete="name" />
                    </Form.Item>
                    <Form.Item
                      name="email"
                      label="Email"
                      rules={[{ required: true, type: 'email', message: 'Invalid email' }]}
                    >
                      <Input size="large" autoComplete="email" />
                    </Form.Item>
                    <Form.Item
                      name="password"
                      label="Password"
                      rules={[{ required: true, min: 8, message: 'At least 8 characters' }]}
                    >
                      <Input.Password size="large" autoComplete="new-password" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" block size="large" loading={emailLoading}>
                      Create account
                    </Button>
                  </Form>
                ),
              },
            ]}
          />
        )}

        {providers.emailPassword && hasSocial && <Divider plain>or</Divider>}

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
                Continue with Google
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
                Continue with Microsoft
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
                Continue with GitHub
              </Button>
            )}
          </Space>
        )}
      </Card>
    </FullScreen>
  )
}
