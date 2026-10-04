import { useEffect, useState } from 'react'
import { App, Card, Typography } from 'antd'
import { SSO_PROVIDERS } from '@imprime/sdk'
import type { PasswordPolicy, SsoProvider, SsoSettingsDTO } from '@imprime/sdk'
import { settingsAPI } from '../../../api/api'
import { parseApiError } from '../../../utils/apiError'
import SsoProviderCard from './SsoProviderCard'
import './SsoPage.css'

/** The instance's single sign-on providers, each offered on the sign-in page once configured. */
export default function SsoPage() {
  const { message } = App.useApp()
  const [settings, setSettings] = useState<SsoSettingsDTO.Response | null>(null)
  const [passwordPolicy, setPasswordPolicy] = useState<PasswordPolicy | null>(null)

  useEffect(() => {
    Promise.all([settingsAPI.getSso(), settingsAPI.getAccess()])
      .then(([sso, access]) => {
        setSettings(sso)
        setPasswordPolicy(access.passwordPolicy)
      })
      .catch((error: unknown) => message.error(parseApiError(error).message ?? 'Failed to load the sign-in settings'))
  }, [message])

  function replaceStatus(provider: SsoProvider, status: SsoSettingsDTO.ProviderStatus) {
    setSettings(current => current && { ...current, [provider]: status })
  }

  if (!settings || !passwordPolicy) return <Card title="Single sign-on" loading />

  const configured = SSO_PROVIDERS.filter(provider => settings[provider].config)
  // While single sign-on is the only way in, removing the last provider leaves
  // only the administrator able to sign in.
  const lastWayIn = passwordPolicy === 'admins' && configured.length === 1 ? configured[0] : null

  return (
    <div className="sso-page">
      <Typography.Paragraph type="secondary">
        Let users sign in with an account they already have. Each provider
        appears on the sign-in page as soon as it is saved. Who else may sign
        in, and from which domains, is set in Access.
      </Typography.Paragraph>
      {SSO_PROVIDERS.map(provider => (
        <SsoProviderCard
          key={provider}
          provider={provider}
          status={settings[provider]}
          lastWayIn={provider === lastWayIn}
          onChange={status => replaceStatus(provider, status)}
        />
      ))}
    </div>
  )
}
