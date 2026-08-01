import { useEffect, useMemo, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { Button, Card, Divider, Form, Input, Space, Tabs, Typography, message } from 'antd'
import { GithubOutlined, GoogleOutlined, WindowsOutlined } from '@ant-design/icons'
import type { EnabledAuthProviders } from '@imprime/sdk'
import { signIn, useSession } from '../../auth/authClient'
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

  // Race the auth request against a polling fallback. Some OAuth-flow browser
  // contexts freeze pending fetch promises (observed with Claude connectors) —
  // in that case we detect the session cookie via /get-session and navigate
  // without waiting for the original fetch to resolve.
  async function signInAndNavigate(
    path: 'sign-in/email' | 'sign-up/email',
    body: Record<string, unknown>,
    onError: (msg: string) => void,
  ): Promise<void> {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      goToPostLogin()
    }

    const request = fetch(`/api/auth/${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

    // Poll session while the request is in flight. Cookie shows up as soon as
    // the server processes the login, even if the response is stalled client-
    // side.
    const pollInterval = 300
    const maxAttempts = 30
    for (let i = 0; i < maxAttempts && !done; i++) {
      await new Promise((r) => setTimeout(r, pollInterval))
      if (done) return
      try {
        const res = await fetch('/api/auth/get-session', {
          credentials: 'include',
          cache: 'no-store',
        })
        if (res.ok) {
          const data = (await res.json()) as { user?: unknown } | null
          if (data?.user) {
            finish()
            return
          }
        }
      } catch {
        // keep polling
      }
    }

    // Poll timed out — inspect the original request as a last resort.
    if (done) return
    try {
      const res = await request
      if (res.ok) {
        finish()
        return
      }
      let msg = `Request failed (${res.status})`
      try {
        const data = (await res.json()) as { message?: string; error?: { message?: string } }
        msg = data.message ?? data.error?.message ?? msg
      } catch {
        // ignore
      }
      onError(msg)
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Network error')
    }
  }

  async function handleEmailSignIn(values: SignInValues) {
    setEmailLoading(true)
    await signInAndNavigate(
      'sign-in/email',
      { email: values.email, password: values.password },
      (msg) => {
        message.error(msg || 'Invalid credentials')
        setEmailLoading(false)
      },
    )
  }

  async function handleEmailSignUp(values: SignUpValues) {
    setEmailLoading(true)
    await signInAndNavigate(
      'sign-up/email',
      { email: values.email, password: values.password, name: values.name },
      (msg) => {
        message.error(msg || 'Sign-up failed')
        setEmailLoading(false)
      },
    )
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
