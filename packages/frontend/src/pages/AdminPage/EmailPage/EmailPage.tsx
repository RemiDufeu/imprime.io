import { useEffect, useState } from 'react'
import { Alert, App, Button, Card, Form, Input, InputNumber, Popconfirm, Space, Switch, Tag, Tooltip, Typography } from 'antd'
import type { EmailSettingsDTO } from '@imprime/sdk'
import { settingsAPI } from '../../../api/api'
import { useSession } from '../../../auth/authClient'
import { parseApiError } from '../../../utils/apiError'
import './EmailPage.css'

interface SmtpValues {
  host: string
  port: number
  secure: boolean
  user: string
  password: string
  from: string
}

const DEFAULT_SMTP_PORT = 587

// Every field, so that setting them also clears what a previous server left.
function formValues(smtp: EmailSettingsDTO.Smtp | null): SmtpValues {
  return {
    host: smtp?.host ?? '',
    port: smtp?.port ?? DEFAULT_SMTP_PORT,
    secure: smtp?.secure ?? false,
    user: smtp?.user ?? '',
    password: '',
    from: smtp?.from ?? '',
  }
}

// An empty password field keeps the stored password.
function toSmtpUpdate(values: SmtpValues): EmailSettingsDTO.SmtpUpdate {
  return {
    host: values.host,
    port: values.port,
    secure: values.secure,
    user: values.user || undefined,
    password: values.password || undefined,
    from: values.from,
  }
}

// The stored server, sent back unchanged: without a password, it keeps its own.
function unchanged(smtp: EmailSettingsDTO.Smtp): EmailSettingsDTO.SmtpUpdate {
  return { host: smtp.host, port: smtp.port, secure: smtp.secure, user: smtp.user, from: smtp.from }
}

function errorMessage(error: unknown, fallback: string): string {
  return parseApiError(error).message ?? fallback
}

/** How the instance sends email: its SMTP server, and whether addresses must be verified. */
export default function EmailPage() {
  const { message, modal } = App.useApp()
  const { data: session } = useSession()
  const [form] = Form.useForm<SmtpValues>()
  const [settings, setSettings] = useState<EmailSettingsDTO.Response | null>(null)
  const [saving, setSaving] = useState(false)
  const [savingVerification, setSavingVerification] = useState(false)
  const [testing, setTesting] = useState(false)
  const ownEmail = session?.user.email ?? ''
  const [testRecipient, setTestRecipient] = useState(ownEmail)

  useEffect(() => {
    settingsAPI.getEmail()
      .then(setSettings)
      .catch((error: unknown) => message.error(errorMessage(error, 'Failed to load the email settings')))
  }, [message])

  // Returns the settings as saved, or null when the save failed.
  async function save(update: EmailSettingsDTO.Update, success: string): Promise<EmailSettingsDTO.Response | null> {
    try {
      const saved = await settingsAPI.updateEmail(update)
      setSettings(saved)
      message.success(success)
      return saved
    } catch (error) {
      message.error(errorMessage(error, 'Failed to save the email settings'))
      return null
    }
  }

  async function handleSave(values: SmtpValues) {
    if (!settings) return
    setSaving(true)
    const saved = await save(
      { smtp: toSmtpUpdate(values), requireEmailVerification: settings.requireEmailVerification },
      'SMTP server saved',
    )
    setSaving(false)
    // The server normalises what it stores (trimmed values, TLS on port 465).
    if (saved) form.setFieldsValue(formValues(saved.smtp))
  }

  async function handleRemove() {
    const saved = await save({ smtp: null, requireEmailVerification: false }, 'SMTP server removed')
    if (saved) form.setFieldsValue(formValues(null))
  }

  async function handleTest() {
    let values: SmtpValues
    try {
      values = await form.validateFields()
    } catch {
      // antd shows the invalid fields.
      return
    }
    const to = testRecipient.trim()
    setTesting(true)
    try {
      await settingsAPI.sendTestEmail({ to, smtp: toSmtpUpdate(values) })
      message.success(`Test email sent to ${to}`)
    } catch (error) {
      message.error(errorMessage(error, 'The test email could not be sent'), 8)
    }
    setTesting(false)
  }

  async function setVerification(required: boolean) {
    if (!settings?.smtp) return
    setSavingVerification(true)
    await save(
      { smtp: unchanged(settings.smtp), requireEmailVerification: required },
      required ? 'Email verification required' : 'Email verification turned off',
    )
    setSavingVerification(false)
  }

  function handleVerificationChange(required: boolean) {
    if (!required) {
      void setVerification(false)
      return
    }
    modal.confirm({
      title: 'Require email verification?',
      content: 'Accounts whose address is not verified yet will be sent a link at their next sign-in, and will not get in until they follow it. Send a test email first if you have not.',
      okText: 'Require verification',
      cancelText: 'Cancel',
      onOk: () => setVerification(true),
    })
  }

  if (!settings) return <Card title="Email" loading />

  const { smtp, requireEmailVerification } = settings

  return (
    <div className="email-page">
      <Card
        title="SMTP server"
        extra={smtp ? <Tag color="success">Configured</Tag> : <Tag>Not configured</Tag>}
      >
        <Typography.Paragraph type="secondary">
          The server this instance sends its emails through: address
          verification and password reset links. Neither is available without one.
        </Typography.Paragraph>

        <Form<SmtpValues>
          form={form}
          layout="vertical"
          initialValues={formValues(smtp)}
          onFinish={handleSave}
          requiredMark={false}
        >
          <div className="email-page-row">
            <Form.Item
              name="host"
              label="Host"
              className="email-page-grow"
              rules={[{ required: true, whitespace: true, message: 'Host required' }]}
            >
              <Input placeholder="smtp.example.com" autoComplete="off" />
            </Form.Item>
            <Form.Item name="port" label="Port" rules={[{ required: true, message: 'Port required' }]}>
              <InputNumber min={1} max={65535} precision={0} />
            </Form.Item>
          </div>
          <Form.Item
            name="secure"
            label="TLS from the start"
            valuePropName="checked"
            extra="Always on for port 465. Leave it off for 587 or 25: the connection then upgrades through STARTTLS when the server offers it."
          >
            <Switch />
          </Form.Item>
          <div className="email-page-row">
            <Form.Item name="user" label="User" className="email-page-grow">
              <Input autoComplete="off" />
            </Form.Item>
            <Form.Item
              name="password"
              label="Password"
              className="email-page-grow"
              extra={smtp?.hasPassword ? 'Leave empty to keep the stored password, unless the user changes.' : undefined}
            >
              <Input.Password autoComplete="new-password" placeholder={smtp?.hasPassword ? '••••••••' : undefined} />
            </Form.Item>
          </div>
          <Form.Item
            name="from"
            label="Sender"
            rules={[{ required: true, whitespace: true, message: 'Sender required' }]}
            extra='The address emails come from, optionally with a name: "Imprime <no-reply@example.com>".'
          >
            <Input placeholder="Imprime <no-reply@example.com>" />
          </Form.Item>

          <Space wrap>
            <Button type="primary" htmlType="submit" loading={saving}>Save</Button>
            {smtp && (requireEmailVerification ? (
              <Tooltip title="Turn off email verification first">
                <Button danger disabled>Remove</Button>
              </Tooltip>
            ) : (
              <Popconfirm
                title="Remove the SMTP server?"
                description="Password reset by email will be unavailable."
                onConfirm={handleRemove}
                okText="Remove"
                okButtonProps={{ danger: true }}
                cancelText="Cancel"
              >
                <Button danger>Remove</Button>
              </Popconfirm>
            ))}
          </Space>
        </Form>

        <div className="email-page-test">
          <Typography.Text strong>Send a test email</Typography.Text>
          <Typography.Paragraph type="secondary">
            Through the server above as it is filled in, saved or not.
          </Typography.Paragraph>
          <Space.Compact className="email-page-test-input">
            <Input
              type="email"
              placeholder="Recipient"
              value={testRecipient}
              onChange={(e) => setTestRecipient(e.target.value)}
            />
            <Button onClick={handleTest} loading={testing} disabled={!testRecipient.trim()}>
              Send test email
            </Button>
          </Space.Compact>
        </div>
      </Card>

      <Card title="Email verification">
        <div className="email-page-switch">
          <Switch
            checked={requireEmailVerification}
            disabled={!smtp}
            loading={savingVerification}
            onChange={handleVerificationChange}
          />
          <Typography.Text>Require users to verify their email address</Typography.Text>
        </div>
        <Typography.Paragraph type="secondary">
          A new account is sent a link and cannot sign in until it follows it.
          Accounts created before are sent one at their next sign-in.
        </Typography.Paragraph>

        {!smtp && <Alert type="info" showIcon message="Configure an SMTP server first." />}
      </Card>
    </div>
  )
}
