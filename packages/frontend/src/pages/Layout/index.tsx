import { Outlet, useMatch } from 'react-router-dom'
import { Layout as AntLayout } from 'antd'
import EditorHeader from './EditorHeader'
import DefaultHeader from './BaseHeader'
import UserMenu from './UserMenu'
import './Layout.css'

const { Header, Content } = AntLayout

export default function Layout() {
  const isEditorPage = useMatch('/editor/:id')
  const CurrentHeader = isEditorPage ? <EditorHeader /> : <DefaultHeader />

  return (
    <AntLayout className='layout'>
      <Header>
        <div className='inner-header'>
          {CurrentHeader}
          <UserMenu />
        </div>
      </Header>
      <Content style={{
        flex: 1,
        overflow: 'auto',
      }}>
        <Outlet />
      </Content>
    </AntLayout>
  )
}
