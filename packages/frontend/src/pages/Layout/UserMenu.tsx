import { useNavigate } from 'react-router-dom'
import { Dropdown, Avatar, Space, Typography } from 'antd'
import { UserOutlined, KeyOutlined, LogoutOutlined } from '@ant-design/icons'
import { useSession, signOut } from '../../auth/authClient'

/** Email courant + menu (clés d'API, déconnexion). Affiché à droite du header. */
export default function UserMenu() {
  const navigate = useNavigate()
  const { data } = useSession()

  if (!data) return null

  async function handleLogout() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <Dropdown
      trigger={['click']}
      menu={{
        items: [
          {
            key: 'api-keys',
            icon: <KeyOutlined />,
            label: "Clés d'API",
            onClick: () => navigate('/settings/api-keys'),
          },
          { type: 'divider' },
          {
            key: 'logout',
            icon: <LogoutOutlined />,
            label: 'Déconnexion',
            onClick: handleLogout,
          },
        ],
      }}
    >
      <Space style={{ cursor: 'pointer', userSelect: 'none' }}>
        <Avatar size="small" icon={<UserOutlined />} />
        <Typography.Text>{data.user.email}</Typography.Text>
      </Space>
    </Dropdown>
  )
}
