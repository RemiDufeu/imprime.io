import { useNavigate } from 'react-router-dom'
import { Dropdown, Avatar, Typography } from 'antd'
import { KeyOutlined, LogoutOutlined } from '@ant-design/icons'
import { useSession, signOut } from '../../auth/authClient'

/** Stable, readable color derived from the email hash (variable hue, fixed sat/lightness). */
function colorFromEmail(email: string): string {
  let hash = 0
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 60%, 45%)`
}

/** Avatar (first-name initial, auto color) + dropdown menu (API keys, log out). */
export default function UserMenu() {
  const navigate = useNavigate()
  const { data } = useSession()

  if (!data) return null

  async function handleLogout() {
    await signOut()
    navigate('/login', { replace: true })
  }

  const { email, name } = data.user
  const initial = (name?.trim() || email)[0]?.toUpperCase() ?? '?'

  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items: [
          {
            key: 'email',
            type: 'group',
            label: (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {email}
              </Typography.Text>
            ),
          },
          {
            key: 'api-keys',
            icon: <KeyOutlined />,
            label: "API Keys",
            onClick: () => navigate('/settings/api-keys'),
          },
          { type: 'divider' },
          {
            key: 'logout',
            icon: <LogoutOutlined />,
            label: 'Log out',
            onClick: handleLogout,
          },
        ],
      }}
    >
      <Avatar style={{ backgroundColor: colorFromEmail(email), cursor: 'pointer' }}>
        {initial}
      </Avatar>
    </Dropdown>
  )
}
