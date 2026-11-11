import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, Form, Input, Typography, message } from 'antd'
import { authClient } from '../../auth/authClient'
import FullScreen from '../../components/Layout/FullScreen/FullScreen'

type Values = { email: string }

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)

  async function handleSubmit(values: Values) {
    setLoading(true)
    const { error } = await authClient.requestPasswordReset({
      email: values.email,
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (error) {
      message.error(error.message || 'Could not send reset email')
      return
    }
    setSentTo(values.email)
  }

  if (sentTo) {
    return (
      <FullScreen>
        <Card style={{ width: 420, textAlign: 'center' }}>
          <Typography.Title level={3}>Check your inbox</Typography.Title>
          <Typography.Paragraph>
            If an account exists for <strong>{sentTo}</strong>, we've sent a link to reset the
            password.
          </Typography.Paragraph>
          <Link to="/login">Back to sign in</Link>
        </Card>
      </FullScreen>
    )
  }

  return (
    <FullScreen>
      <Card style={{ width: 380, textAlign: 'center' }}>
        <Typography.Title level={3} style={{ marginBottom: 24 }}>
          Reset password
        </Typography.Title>
        <Form<Values> layout="vertical" onFinish={handleSubmit} requiredMark={false}>
          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true, type: 'email', message: 'Invalid email' }]}
          >
            <Input size="large" autoComplete="email" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={loading}>
            Send reset link
          </Button>
        </Form>
        <Typography.Paragraph style={{ marginTop: 16 }}>
          <Link to="/login">Back to sign in</Link>
        </Typography.Paragraph>
      </Card>
    </FullScreen>
  )
}
