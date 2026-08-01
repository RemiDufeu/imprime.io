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

  // Where to land after a successful login. Better Auth's MCP plugin bounces
  // unauthenticated users here with the full set of OAuth query params
  // (client_id, redirect_uri, response_type, code_challenge, state, ...). To
  // resume the flow we send them back to /api/auth/mcp/authorize with the same
  // query. Otherwise honour an explicit `redirect` param, else home page.
  const postLoginTarget = useMemo(() => {
    if (params.get('client_id') && params.get('response_type')) {
      return `/api/auth/mcp/authorize?${params.toString()}`
    }
    return params.get('redirect') ?? '/'
  }, [params])

  // OAuth resume URLs point at the backend, so a full navigation is required
  // to let the server process the flow. Same for consent redirects returned by
  // Better Auth. Internal targets can use SPA navigation.
  const isExternalTarget = postLoginTarget.startsWith('/api/')

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

  function goToPostLogin() {
    if (isExternalTarget) window.location.href = postLoginTarget
    else window.location.assign(postLoginTarget)
  }

  async function handleEmailSignIn(values: SignInValues) {
    setEmailLoading(true)
    const { error } = await signIn.email({
      email: values.email,
      password: values.password,
    })
    if (error) {
      message.error(error.message || 'Invalid credentials')
      setEmailLoading(false)
      return
    }
    goToPostLogin()
  }

  async function handleEmailSignUp(values: SignUpValues) {
    setEmailLoading(true)
    const { error } = await signUp.email({
      email: values.email,
      password: values.password,
      name: values.name,
    })
    if (error) {
      message.error(error.message || 'Sign-up failed')
      setEmailLoading(false)
      return
    }
    goToPostLogin()
  }

  if (isPending || !providers) return <SpinnerFullScreen />
  if (data) {
    if (isExternalTarget) {
      window.location.replace(postLoginTarget)
      return <SpinnerFullScreen />
    }
    return <Navigate to={postLoginTarget} replace />
  }

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
