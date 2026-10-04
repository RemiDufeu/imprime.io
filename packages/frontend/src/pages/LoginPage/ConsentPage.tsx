import { useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, Card, Space, Typography, message } from 'antd'
import type { OAuthConsentRequest } from '@imprime/sdk'
import { useSession } from '../../auth/authClient'
import { imprimeClient } from '../../api/api'
import FullScreen from '../../components/Layout/FullScreen/FullScreen'
import SpinnerFullScreen from '../../components/Feedback/SpinnerFullScreen'

async function submitConsent(accept: boolean, consentCode: string): Promise<string> {
  const res = await fetch('/api/auth/oauth2/consent', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accept, consent_code: consentCode }),
  })
  if (!res.ok) throw new Error(`Consent request failed (${res.status})`)
  const data = (await res.json()) as { redirectURI?: string }
  if (!data.redirectURI) throw new Error('Missing redirect URI in consent response')
  return data.redirectURI
}

// The pending authorization, from the server: null while it loads, 'failed'
// when it is unknown, expired, or someone else's.
type ConsentState = OAuthConsentRequest | 'failed' | null

/**
 * Where an MCP client — the Claude connector, an editor — asks for access to
 * the signed-in user's presentations. Every request comes here (the server
 * forces `prompt=consent`): any site can register a client, so it is the
 * user who must recognise where the access goes.
 */
export default function ConsentPage() {
  const { data, isPending } = useSession()
  const [params] = useSearchParams()
  const consentCode = params.get('consent_code') ?? ''
  const signedIn = Boolean(data)
  const [request, setRequest] = useState<ConsentState>(null)
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null)

  useEffect(() => {
    if (!signedIn) return
    if (!consentCode) {
      setRequest('failed')
      return
    }
    imprimeClient.getOAuthConsent(consentCode)
      .then(setRequest)
      .catch(() => setRequest('failed'))
  }, [signedIn, consentCode])

  if (isPending) return <SpinnerFullScreen />
  if (!data)
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(`/oauth/consent?consent_code=${consentCode}`)}`}
        replace
      />
    )
  if (request === null) return <SpinnerFullScreen />

  async function handle(accept: boolean) {
    setBusy(accept ? 'accept' : 'reject')
    try {
      const redirectURI = await submitConsent(accept, consentCode)
      window.location.href = redirectURI
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Consent failed')
      setBusy(null)
    }
  }

  if (request === 'failed') {
    return (
      <FullScreen>
        <Card style={{ width: 420, textAlign: 'center' }}>
          <Typography.Title level={3}>Authorization expired</Typography.Title>
          <Typography.Paragraph>
            This request is unknown, expired, or was made for another account.
            Start the connection again from the application.
          </Typography.Paragraph>
        </Card>
      </FullScreen>
    )
  }

  return (
    <FullScreen>
      <Card style={{ width: 420, textAlign: 'center' }}>
        <Typography.Title level={3}>Authorize access</Typography.Title>
        <Typography.Paragraph>
          <strong>{request.clientName ?? 'An unnamed application'}</strong> asks to read your
          presentations and export them to PDF{request.keepsAccess ? ', for up to 7 days' : ''}.
        </Typography.Paragraph>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Alert
            type="warning"
            showIcon
            message={
              <>
                The access goes to <Typography.Text strong code>{request.redirectTo}</Typography.Text>.
                Any site can call itself by any name: allow only if you are connecting this
                application yourself, right now.
              </>
            }
          />
          <Button
            type="primary"
            block
            size="large"
            loading={busy === 'accept'}
            disabled={busy !== null}
            onClick={() => handle(true)}
          >
            Allow
          </Button>
          <Button
            block
            size="large"
            danger
            loading={busy === 'reject'}
            disabled={busy !== null}
            onClick={() => handle(false)}
          >
            Deny
          </Button>
        </Space>
      </Card>
    </FullScreen>
  )
}
