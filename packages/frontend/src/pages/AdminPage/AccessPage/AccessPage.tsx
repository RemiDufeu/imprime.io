import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, App, Button, Card, Form, Radio, Select, Space, Typography } from 'antd'
import { SSO_PROVIDERS } from '@imprime/sdk'
import type { AccessSettingsDTO, PasswordPolicy } from '@imprime/sdk'
import { settingsAPI } from '../../../api/api'
import { parseApiError } from '../../../utils/apiError'
import './AccessPage.css'

const POLICIES: { value: PasswordPolicy; label: string; description: string }[] = [
  {
    value: 'open',
    label: 'Anyone can sign up with an email and a password',
    description: 'Beside the single sign-on providers, if any.',
  },
  {
    value: 'existing',
    label: 'No new password accounts',
    description: 'New users join through single sign-on. Accounts that already have a password keep signing in with it.',
  },
  {
    value: 'admins',
    label: 'Single sign-on only',
    description: 'Everyone signs in through single sign-on. The administrator may also use a password: the way back in if single sign-on fails.',
  },
]

interface AccessState {
  access: AccessSettingsDTO.Response
  anyProviderActive: boolean
  requireEmailVerification: boolean
}

// As the server stores them, to tell whether the list really changed.
function normalisedDomains(domains: readonly string[]): string {
  return [...new Set(domains.map(domain => domain.trim().toLowerCase().replace(/^@/, '')))].sort().join()
}

function errorMessage(error: unknown, fallback: string): string {
  return parseApiError(error).message ?? fallback
}

/** Who may get into the instance: the password policy, and the domains whose addresses may have an account. */
export default function AccessPage() {
  const { message, modal } = App.useApp()
  const [form] = Form.useForm<AccessSettingsDTO.Update>()
  const [state, setState] = useState<AccessState | null>(null)
  const [saving, setSaving] = useState(false)
  const policy = Form.useWatch('passwordPolicy', form)
  const domains = Form.useWatch('allowedDomains', form)

  useEffect(() => {
    Promise.all([settingsAPI.getAccess(), settingsAPI.getSso(), settingsAPI.getEmail()])
      .then(([access, sso, email]) => setState({
        access,
        anyProviderActive: SSO_PROVIDERS.some(provider => sso[provider].active),
        requireEmailVerification: email.requireEmailVerification,
      }))
      .catch((error: unknown) => message.error(errorMessage(error, 'Failed to load the access settings')))
  }, [message])

  async function save(values: AccessSettingsDTO.Update) {
    setSaving(true)
    try {
      const access = await settingsAPI.updateAccess(values)
      setState(current => current && { ...current, access })
      form.setFieldsValue(access)
      message.success('Access settings saved')
    } catch (error) {
      message.error(errorMessage(error, 'Failed to save the access settings'), 8)
    }
    setSaving(false)
  }

  function handleSave(values: AccessSettingsDTO.Update) {
    if (!state) return
    const before = state.access
    const ssoOnlyNow = values.passwordPolicy === 'admins' && before.passwordPolicy !== 'admins'
    const domainsChanged = values.allowedDomains.length > 0 &&
      normalisedDomains(values.allowedDomains) !== normalisedDomains(before.allowedDomains)
    if (!ssoOnlyNow && !domainsChanged) {
      void save(values)
      return
    }
    modal.confirm({
      title: 'Sign out the users this shuts out?',
      content: ssoOnlyNow
        ? 'Everyone but the administrators is signed out now, and signs in again through single sign-on.'
        : 'Users whose address is outside these domains, or not verified, are signed out now, and their API keys and MCP tokens stop working. Administrators are exempt.',
      okText: 'Save and sign them out',
      cancelText: 'Cancel',
      onOk: () => save(values),
    })
  }

  if (!state) return <Card title="Access" loading />

  return (
    <Card title="Access">
      <Form<AccessSettingsDTO.Update>
        form={form}
        layout="vertical"
        initialValues={state.access}
        onFinish={handleSave}
        requiredMark={false}
      >
        <Form.Item name="passwordPolicy" label="Email and password">
          <Radio.Group className="access-page-policies">
            {POLICIES.map(option => (
              <Radio key={option.value} value={option.value}>
                <div>{option.label}</div>
                <Typography.Text type="secondary">{option.description}</Typography.Text>
              </Radio>
            ))}
          </Radio.Group>
        </Form.Item>

        {policy === 'open' && !state.requireEmailVerification && (
          <Alert
            className="access-page-alert"
            type="warning"
            showIcon
            message={<>Anyone can sign up with any address, a colleague&apos;s included, and use it unchecked: turn on email verification in <Link to="/admin/email">Email</Link>.</>}
          />
        )}
        {policy === 'admins' && !state.anyProviderActive && (
          <Alert
            className="access-page-alert"
            type="warning"
            showIcon
            message={<>No provider is active in <Link to="/admin/sso">Single sign-on</Link>: only the administrator can sign in.</>}
          />
        )}
        {policy === 'admins' && (
          <Typography.Paragraph type="secondary">
            The administrator signs in through single sign-on, or with a
            password behind "Administrator sign-in" on the sign-in page. If
            they cannot get in any more, whoever runs the server can reset the
            password of ADMIN_EMAIL with
            <Typography.Text code>npm run admin:reset-password</Typography.Text>.
          </Typography.Paragraph>
        )}

        <Form.Item
          name="allowedDomains"
          label="Allowed domains"
          extra="Only addresses in these domains may have an account, and only once verified, by their provider or by email. Exact domains: example.com does not admit eu.example.com. Leave empty to allow any. The administrator is exempt."
        >
          <Select
            mode="tags"
            tokenSeparators={[',', ' ', ';']}
            open={false}
            suffixIcon={null}
            placeholder="example.com"
          />
        </Form.Item>

        {domains && domains.length > 0 && policy !== 'admins' && !state.requireEmailVerification && (
          <Alert
            className="access-page-alert"
            type="warning"
            showIcon
            message={<>Password accounts are refused until their address is verified: turn on email verification in <Link to="/admin/email">Email</Link>.</>}
          />
        )}
        {domains && domains.length > 0 && (
          <Typography.Paragraph type="secondary">
            Google and GitHub say whether an address is verified. Microsoft
            says so only through the optional claim xms_edov, which its app
            registration must add to the ID token: see <Link to="/admin/sso">Single sign-on</Link>.
          </Typography.Paragraph>
        )}

        <Space>
          <Button type="primary" htmlType="submit" loading={saving}>Save</Button>
        </Space>
      </Form>
    </Card>
  )
}
