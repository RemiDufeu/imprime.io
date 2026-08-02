import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Card, Form, Input, Typography, message } from 'antd'
import { authClient } from '../../auth/authClient'
import FullScreen from '../../components/Layout/FullScreen/FullScreen'

type Values = { password: string; confirm: string }

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token')
  const [loading, setLoading] = useState(false)

  if (!token) return <Navigate to="/login" replace />

  async function handleSubmit(values: Values) {
    setLoading(true)
    const { error } = await authClient.resetPassword({
      newPassword: values.password,
      token: token!,
    })
    setLoading(false)
    if (error) {
      message.error(error.message || 'Could not reset password')
      return
    }
    message.success('Password updated — please sign in')
    navigate('/login', { replace: true })
  }

  return (
    <FullScreen>
      <Card style={{ width: 380, textAlign: 'center' }}>
        <Typography.Title level={3} style={{ marginBottom: 24 }}>
          Set a new password
        </Typography.Title>
        <Form<Values> layout="vertical" onFinish={handleSubmit} requiredMark={false}>
          <Form.Item
            name="password"
            label="New password"
            rules={[{ required: true, min: 8, message: 'At least 8 characters' }]}
          >
            <Input.Password size="large" autoComplete="new-password" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="Confirm password"
            dependencies={['password']}
            rules={[
              { required: true, message: 'Please confirm' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) return Promise.resolve()
                  return Promise.reject(new Error('Passwords do not match'))
                },
              }),
            ]}
          >
            <Input.Password size="large" autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={loading}>
            Update password
          </Button>
        </Form>
        <Typography.Paragraph style={{ marginTop: 16 }}>
          <Link to="/login">Back to sign in</Link>
        </Typography.Paragraph>
      </Card>
    </FullScreen>
  )
}
