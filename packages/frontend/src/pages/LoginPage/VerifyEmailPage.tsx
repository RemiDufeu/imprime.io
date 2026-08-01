import { Navigate, useSearchParams } from 'react-router-dom'
import { Card, Typography } from 'antd'
import { MailOutlined } from '@ant-design/icons'
import FullScreen from '../../components/Layout/FullScreen/FullScreen'

export default function VerifyEmailPage() {
  const [params] = useSearchParams()
  const email = params.get('email')

  if (!email) return <Navigate to="/login" replace />

  return (
    <FullScreen>
      <Card style={{ width: 420, textAlign: 'center' }}>
        <MailOutlined style={{ fontSize: 48, marginBottom: 16 }} />
        <Typography.Title level={3}>Check your inbox</Typography.Title>
        <Typography.Paragraph>
          We've sent a verification link to <strong>{email}</strong>.
        </Typography.Paragraph>
        <Typography.Paragraph type="secondary">
          Click the link in the email to activate your account and sign in.
        </Typography.Paragraph>
      </Card>
    </FullScreen>
  )
}
