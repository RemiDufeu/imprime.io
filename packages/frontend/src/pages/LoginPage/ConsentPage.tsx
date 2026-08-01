import { useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { Button, Card, Space, Typography, message } from 'antd'
import { useSession } from '../../auth/authClient'
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

export default function ConsentPage() {
  const { data, isPending } = useSession()
  const [params] = useSearchParams()
  const consentCode = params.get('consent_code') ?? ''
  const clientName = params.get('client_name') ?? 'This application'
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null)

  useEffect(() => {
    if (!consentCode) message.error('Missing consent code — please restart the flow.')
  }, [consentCode])

  if (isPending) return <SpinnerFullScreen />
  if (!data)
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(`/oauth/consent?consent_code=${consentCode}`)}`}
        replace
      />
    )

  async function handle(accept: boolean) {
    if (!consentCode) return
    setBusy(accept ? 'accept' : 'reject')
    try {
      const redirectURI = await submitConsent(accept, consentCode)
      window.location.href = redirectURI
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Consent failed')
      setBusy(null)
    }
  }

  return (
    <FullScreen>
      <Card style={{ width: 420, textAlign: 'center' }}>
        <Typography.Title level={3}>Authorize access</Typography.Title>
        <Typography.Paragraph>
          <strong>{clientName}</strong> is requesting access to your Imprime.io account and
          resources.
        </Typography.Paragraph>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Button
            type="primary"
            block
            size="large"
            loading={busy === 'accept'}
            disabled={!consentCode || busy !== null}
            onClick={() => handle(true)}
          >
            Allow
          </Button>
          <Button
            block
            size="large"
            danger
            loading={busy === 'reject'}
            disabled={!consentCode || busy !== null}
            onClick={() => handle(false)}
          >
            Deny
          </Button>
        </Space>
      </Card>
    </FullScreen>
  )
}
