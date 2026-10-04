import type { ReactNode } from 'react'
import { Alert, App, Button, Card, Form, Input, Popconfirm, Space, Tag, Typography } from 'antd'
import { GithubOutlined, GoogleOutlined, WindowsOutlined } from '@ant-design/icons'
import type { SsoProvider, SsoSettingsDTO } from '@imprime/sdk'
import { settingsAPI } from '../../../api/api'
import { parseApiError } from '../../../utils/apiError'

interface ProviderInfo {
  label: string
  icon: ReactNode
  consoleUrl: string
  // Where the admin registers the application, and what to copy from it.
  setup: string
}

const PROVIDERS: Record<SsoProvider, ProviderInfo> = {
  google: {
    label: 'Google',
    icon: <GoogleOutlined />,
    consoleUrl: 'https://console.cloud.google.com/apis/credentials',
    setup: 'In Google Cloud Console, under Credentials, create an OAuth client ID of type "Web application" and add the callback URL as an authorized redirect URI.',
  },
  github: {
    label: 'GitHub',
    icon: <GithubOutlined />,
    consoleUrl: 'https://github.com/settings/developers',
    setup: 'In GitHub Developer settings, under OAuth Apps, register an application with the callback URL as its authorization callback URL, then generate a client secret.',
  },
  microsoft: {
    label: 'Microsoft',
    icon: <WindowsOutlined />,
    consoleUrl: 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
    setup: 'In Microsoft Entra, under App registrations, register an application with the callback URL as a Web redirect URI, then add a client secret under Certificates & secrets. The client ID is its Application (client) ID.',
  },
}

interface ProviderValues {
  clientId: string
  clientSecret: string
  tenantId: string
}

// Every field, so that setting them also clears what was typed before.
function formValues(config: SsoSettingsDTO.Provider | null): ProviderValues {
  return {
    clientId: config?.clientId ?? '',
    clientSecret: '',
    tenantId: config?.tenantId ?? '',
  }
}

interface SsoProviderCardProps {
  provider: SsoProvider
  status: SsoSettingsDTO.ProviderStatus
  // The last provider while single sign-on is the only way in for users.
  lastWayIn: boolean
  onChange: (status: SsoSettingsDTO.ProviderStatus) => void
}

/** One provider's OAuth application: where to register it, and its credentials. */
export default function SsoProviderCard({ provider, status, lastWayIn, onChange }: SsoProviderCardProps) {
  const { message } = App.useApp()
  const [form] = Form.useForm<ProviderValues>()
  const { label, icon, consoleUrl, setup } = PROVIDERS[provider]
  const { config, callbackUrl, active } = status

  // The server keeps the stored secret when none is sent, for the same client ID.
  function keepsStoredSecret(clientId: unknown): boolean {
    return typeof clientId === 'string' && config?.clientId === clientId.trim()
  }

  async function handleSave(values: ProviderValues) {
    try {
      const saved = await settingsAPI.updateSsoProvider(provider, {
        clientId: values.clientId,
        clientSecret: values.clientSecret || undefined,
        tenantId: provider === 'microsoft' ? values.tenantId || undefined : undefined,
      })
      onChange(saved)
      // The server trims what it stores.
      form.setFieldsValue(formValues(saved.config))
      message.success(`${label} sign-in saved`)
    } catch (error) {
      message.error(parseApiError(error).message ?? `Failed to save ${label}`)
    }
  }

  async function handleRemove() {
    try {
      const removed = await settingsAPI.removeSsoProvider(provider)
      onChange(removed)
      form.setFieldsValue(formValues(null))
      message.success(`${label} sign-in removed`)
    } catch (error) {
      message.error(parseApiError(error).message ?? `Failed to remove ${label}`)
    }
  }

  const tag = !config
    ? <Tag>Not configured</Tag>
    : active ? <Tag color="success">Active</Tag> : <Tag color="warning">Secret unreadable</Tag>

  return (
    <Card title={<Space>{icon}{label}</Space>} extra={tag}>
      <Typography.Paragraph type="secondary">
        {setup}{' '}
        <Typography.Link href={consoleUrl} target="_blank" rel="noreferrer">Open the console</Typography.Link>
      </Typography.Paragraph>

      <div className="sso-page-callback">
        <Typography.Text strong>Callback URL</Typography.Text>
        {callbackUrl ? (
          <Typography.Paragraph copyable={{ text: callbackUrl }}>
            <Typography.Text code>{callbackUrl}</Typography.Text>
          </Typography.Paragraph>
        ) : (
          <Alert
            type="warning"
            showIcon
            message="Set PUBLIC_APP_URL on the server: the callback URL is built from it."
          />
        )}
      </div>

      {config && !active && (
        <Alert
          className="sso-page-alert"
          type="warning"
          showIcon
          message="The stored client secret can no longer be read"
          description={`The server's BETTER_AUTH_SECRET changed since it was saved. ${label} is not offered on the sign-in page until the secret is entered again.`}
        />
      )}

      <Form<ProviderValues>
        form={form}
        // Prefixes the field ids, unique across the page's three forms.
        name={`sso-${provider}`}
        layout="vertical"
        initialValues={formValues(config)}
        onFinish={handleSave}
        requiredMark={false}
      >
        <div className="sso-page-row">
          <Form.Item
            name="clientId"
            label="Client ID"
            className="sso-page-grow"
            rules={[{ required: true, whitespace: true, message: 'Client ID required' }]}
          >
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="clientSecret"
            label="Client secret"
            className="sso-page-grow"
            dependencies={['clientId']}
            rules={[{
              validator: async (_, value: unknown) => {
                if (typeof value === 'string' && value.trim()) return
                if (keepsStoredSecret(form.getFieldValue('clientId'))) return
                throw new Error('Client secret required')
              },
            }]}
            extra={config ? 'Leave empty to keep the stored secret, unless the client ID changes.' : undefined}
          >
            <Input.Password autoComplete="new-password" placeholder={config ? '••••••••' : undefined} />
          </Form.Item>
        </div>
        {provider === 'microsoft' && (
          <Form.Item
            name="tenantId"
            label="Tenant"
            extra='Whose accounts may sign in: "common" (any, the default), "organizations", "consumers", or your tenant ID. It must match the supported account types of the app registration.'
          >
            <Input placeholder="common" autoComplete="off" />
          </Form.Item>
        )}

        <Space wrap>
          <Button type="primary" htmlType="submit">Save</Button>
          {config && (
            <Popconfirm
              title={`Remove ${label} sign-in?`}
              description={lastWayIn
                ? 'Single sign-on is the only way in: nobody but the administrator will be able to sign in until a provider is back.'
                : `Accounts that only sign in with ${label} will need a password, through "Forgot password", which requires the instance to send email.`}
              onConfirm={handleRemove}
              okText="Remove"
              okButtonProps={{ danger: true }}
              cancelText="Cancel"
            >
              <Button danger>Remove</Button>
            </Popconfirm>
          )}
        </Space>
      </Form>
    </Card>
  )
}
