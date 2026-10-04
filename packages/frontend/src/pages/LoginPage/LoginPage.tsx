import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, Card, Divider, Form, Input, Space, Tabs, Tooltip, Typography, message } from 'antd'
import { GithubOutlined, GoogleOutlined, WindowsOutlined } from '@ant-design/icons'
import type { EnabledAuthProviders, SsoProvider } from '@imprime/sdk'
import { signIn, signUp, useSession } from '../../auth/authClient'
import { imprimeClient } from '../../api/api'
import FullScreen from '../../components/Layout/FullScreen/FullScreen'
import SpinnerFullScreen from '../../components/Feedback/SpinnerFullScreen'
import './LoginPage.css'

// Why the server refused a sign-in, by error code: from a failed request, or
// from the `error` parameter a refused single sign-on comes back with. Only
// known codes are shown: the parameter is anyone's to write.
const SIGN_IN_ERRORS: Record<string, string> = {
  EMAIL_DOMAIN_NOT_ALLOWED: "This address is not allowed on this instance. Sign in with your organisation's account.",
  ADDRESS_NOT_VERIFIED: 'Your address must be verified before you can sign in. Ask your administrator.',
  PASSWORD_SIGN_IN_DISABLED: "Sign in with your organisation's account: passwords are for administrators.",
  ADMIN_ADDRESS_RESERVED: "This address is the administrator's: its account is created on the server, or through single sign-on.",
  // better-auth's own: the provider did not vouch for an address an existing
  // account already uses, or that account's address is not verified.
  ACCOUNT_NOT_LINKED: 'An account already uses this address: sign in the way you created it.',
}

// A single sign-on refused by our own rules comes back with the code; one
// refused while creating the account, with its message, spaces replaced.
function signInError(code: string | null | undefined): string | undefined {
  if (!code) return undefined
  return SIGN_IN_ERRORS[code.toUpperCase().replace(/[^A-Z]+/g, '_')]
}

// Where `redirect` may send a user once signed in: a page of this site, never
// another one or a `javascript:` URL — the parameter is anyone's to write.
// Resolved rather than matched, since the browser drops tabs and newlines
// from a URL: "/\t/evil.example" would become "//evil.example".
function sameOriginPath(target: string | null): string {
  if (!target) return '/'
  try {
    const url = new URL(target, window.location.origin)
    return url.origin === window.location.origin ? `${url.pathname}${url.search}${url.hash}` : '/'
  } catch {
    return '/'
  }
}

type SignInValues = { email: string; password: string }
type SignUpValues = { name: string; email: string; password: string }

export default function LoginPage() {
  const { data, isPending } = useSession()
  const [socialLoading, setSocialLoading] = useState<SsoProvider | null>(null)
  const [emailLoading, setEmailLoading] = useState(false)
  const [providers, setProviders] = useState<EnabledAuthProviders | null>(null)
  const [showAdminSignIn, setShowAdminSignIn] = useState(false)
  const [params] = useSearchParams()
  const returnedError = params.get('error')

  // Where to land after a successful login. Better Auth's MCP plugin bounces
  // unauthenticated users here with the full set of OAuth query params
  // (client_id, redirect_uri, response_type, code_challenge, state, ...). To
  // resume the flow we send them back to /api/auth/mcp/authorize with the same
  // query. Otherwise honour an explicit `redirect` param, else home page.
  const postLoginTarget = useMemo(() => {
    if (params.get('client_id') && params.get('response_type')) {
      return `/api/auth/mcp/authorize?${params.toString()}`
    }
    return sameOriginPath(params.get('redirect'))
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
        setProviders({ emailPassword: true, passwordPolicy: 'open', google: false, github: false, microsoft: false, requireEmailVerification: false, passwordReset: false }),
      )
  }, [])

  async function handleSocialSignIn(provider: SsoProvider) {
    setSocialLoading(provider)
    try {
      await signIn.social({ provider, callbackURL: postLoginTarget, errorCallbackURL: '/login' })
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
    const { error } = await signIn.email({ email: values.email, password: values.password })
    // Refused while the address is unverified, and sent a fresh link.
    if (error?.code === 'EMAIL_NOT_VERIFIED') {
      window.location.assign(`/verify-email?email=${encodeURIComponent(values.email)}`)
      return
    }
    if (error) {
      message.error(signInError(error.code) ?? (error.message || 'Invalid credentials'))
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
      message.error(signInError(error.code) ?? (error.message || 'Sign-up failed'))
      setEmailLoading(false)
      return
    }
    if (providers?.requireEmailVerification) {
      window.location.assign(`/verify-email?email=${encodeURIComponent(values.email)}`)
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
  const { passwordPolicy } = providers
  // Single sign-on only: the password form is for administrators, behind a
  // link — shown outright if no provider is there to sign in with.
  const showPasswordForm = providers.emailPassword &&
    (passwordPolicy !== 'admins' || showAdminSignIn || !hasSocial)

  const signInForm = (
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
      <Typography.Paragraph style={{ marginTop: 16, marginBottom: 0 }}>
        {providers.passwordReset ? (
          <Link to="/forgot-password">Forgot password?</Link>
        ) : (
          <Tooltip title="Password reset by email is disabled — please contact your administrator.">
            <Typography.Text type="secondary" style={{ cursor: 'not-allowed' }}>
              Forgot password?
            </Typography.Text>
          </Tooltip>
        )}
      </Typography.Paragraph>
    </Form>
  )

  const signUpForm = (
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
  )

  return (
    <FullScreen>
      <Card style={{ width: 380, textAlign: 'center' }}>
        <Typography.Title level={3} style={{ marginBottom: 24 }}>
          Imprime.io
        </Typography.Title>

        {returnedError && (
          <Alert
            className="login-page-error"
            type="error"
            showIcon
            message={signInError(returnedError) ?? 'Sign-in failed. Try again, or ask your administrator.'}
          />
        )}

        {showPasswordForm && (passwordPolicy === 'open' ? (
          <Tabs
            defaultActiveKey="signin"
            centered
            items={[
              { key: 'signin', label: 'Sign in', children: signInForm },
              { key: 'signup', label: 'Sign up', children: signUpForm },
            ]}
          />
        ) : (
          // New accounts come through single sign-on only.
          signInForm
        ))}

        {showPasswordForm && hasSocial && <Divider plain>or</Divider>}

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

        {passwordPolicy === 'admins' && hasSocial && !showAdminSignIn && (
          <Typography.Paragraph className="login-page-admin-link">
            <Typography.Link onClick={() => setShowAdminSignIn(true)}>Administrator sign-in</Typography.Link>
          </Typography.Paragraph>
        )}
      </Card>
    </FullScreen>
  )
}
