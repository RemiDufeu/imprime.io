import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Menu, Typography } from 'antd'
import { FontSizeOutlined, LockOutlined, LoginOutlined, MailOutlined } from '@ant-design/icons'
import RegularPageContainer from '../../components/Layout/RegularPageContainer/RegularPageContainer'
import './AdminPage.css'

// One entry per administration page, keyed by its path under /admin.
const SECTIONS = [
  { key: 'fonts', icon: <FontSizeOutlined />, label: <NavLink to="fonts">Fonts</NavLink> },
  { key: 'email', icon: <MailOutlined />, label: <NavLink to="email">Email</NavLink> },
  { key: 'sso', icon: <LoginOutlined />, label: <NavLink to="sso">Single sign-on</NavLink> },
  { key: 'access', icon: <LockOutlined />, label: <NavLink to="access">Access</NavLink> },
]

/** Shell of the administration pages: section navigation beside the page. */
export default function AdminPage() {
  const { pathname } = useLocation()
  const current = SECTIONS.find(section => pathname.startsWith(`/admin/${section.key}`))?.key

  return (
    <RegularPageContainer>
      <Typography.Title level={3}>Administration</Typography.Title>
      <div className="admin-page">
        <Menu
          className="admin-page-nav"
          mode="inline"
          selectedKeys={current ? [current] : []}
          items={SECTIONS}
        />
        <div className="admin-page-content">
          <Outlet />
        </div>
      </div>
    </RegularPageContainer>
  )
}
