import { Outlet, useMatch } from 'react-router-dom'
import { Layout as AntLayout } from 'antd'
import DefaultHeader from './BaseHeader'
import UserMenu from './UserMenu'
import './Layout.css'

const { Header, Content } = AntLayout

export default function Layout() {
  const isEditorPage = useMatch('/editor/:id')

  return (
    <AntLayout className='layout'>
      {!isEditorPage && (
        <Header>
          <div className='inner-header'>
            <DefaultHeader />
            <UserMenu />
          </div>
        </Header>
      )}
      <Content style={{
        flex: 1,
        overflow: 'auto',
      }}>
        <Outlet />
      </Content>
    </AntLayout>
  )
}
