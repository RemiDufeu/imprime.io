import { Divider } from 'antd'
import { EyeOutlined, RetweetOutlined } from '@ant-design/icons'
import type { Page } from '@imprime/sdk'
import { useCurrentPage, useEditorStore } from '../../../../../../../store/editor/EditorStore'
import { usePageBindingMenus } from '../../../usePageBindingMenus'
import { BindingButton } from '../BindingButton/BindingButton'
import { PageNumberingControl } from './PageNumberingControl'

// The page on screen, while no shape is selected: the list it is exported
// once per item of, when it is exported at all, and the template's page
// numbers.
export function PageContextBar() {
  const page = useCurrentPage()
  const index = useEditorStore(state => state.currentPageIndex)

  if (!page) return null
  return <PageContextBarContent page={page} pageNumber={index + 1} />
}

// Split off so the menus are built for a page that exists.
function PageContextBarContent({ page, pageNumber }: { page: Page; pageNumber: number }) {
  const { condition, repeat, select } = usePageBindingMenus(page)

  return (
    <div className="toolbar-container context-toolbar">
      <span className="toolbar-label">Page {pageNumber}</span>
      <Divider type="vertical" style={{ height: '24px' }} />
      <div className="toolbar-item">
        <BindingButton
          icon={<RetweetOutlined />}
          label="Repeat"
          binding={repeat.binding}
          title={repeat.binding === undefined
            ? 'Exported once — choose a list to export one page per item'
            : `Exported once per item of ${repeat.binding}; the editor shows one copy`}
          items={repeat.items}
          selectedKeys={repeat.selectedKeys}
          onSelect={select}
        />
      </div>
      <div className="toolbar-item">
        <BindingButton
          icon={<EyeOutlined />}
          label="Show"
          binding={condition.binding}
          title={condition.binding === undefined
            ? 'Always exported — choose a condition'
            : `Exported only when ${condition.binding}`}
          items={condition.items}
          selectedKeys={condition.selectedKeys}
          onSelect={select}
          broken={page.visibleWhen !== undefined && !page.visibleWhen.variableId}
        />
      </div>
      <Divider type="vertical" style={{ height: '24px' }} />
      <div className="toolbar-item">
        <PageNumberingControl page={page} />
      </div>
    </div>
  )
}
