import { Button, Checkbox, Popover, Switch, Tooltip, Typography } from 'antd'
import { NumberOutlined } from '@ant-design/icons'
import type { Page } from '@imprime/sdk'
import { createPageNumberBox } from '@imprime/sdk'
import { useEditorStore } from '../../../../../../../store/editor/EditorStore'
import { selectPageSize } from '../../../../../../../store/editor/selectors'
import { isPageNumberBox } from '../../../../../../../utils/pageNumbering'
import './PageNumberingControl.css'

// The template's page numbering, from any page: on or off, off the first
// page, off this one. The box itself is edited on the page, as a text box.
export function PageNumberingControl({ page }: { page: Page }) {
  const numbering = useEditorStore(state => state.template?.pageNumbering)
  const pageSize = useEditorStore(selectPageSize)
  const setPageNumbering = useEditorStore(state => state.setPageNumbering)
  const setPageNumberShown = useEditorStore(state => state.setPageNumberShown)
  const isShownHere = page.shapes.some(isPageNumberBox)

  const content = (
    <div className="page-numbering-control">
      <label className="page-numbering-switch">
        <Switch
          size="small"
          checked={numbering !== undefined}
          onChange={on => setPageNumbering(on ? { box: createPageNumberBox(pageSize) } : null)}
        />
        Number the pages
      </label>
      <Checkbox
        disabled={!numbering}
        checked={numbering?.skipFirstPage === true}
        onChange={e => numbering && setPageNumbering({ ...numbering, skipFirstPage: e.target.checked || undefined })}
      >
        Skip the first page
      </Checkbox>
      <Checkbox
        disabled={!numbering}
        checked={numbering !== undefined && isShownHere}
        onChange={e => setPageNumberShown(page._id, e.target.checked)}
      >
        Show on this page
      </Checkbox>
      <Typography.Text type="secondary" className="page-numbering-hint">
        Select the number on any page to move it, or to change its text: every page follows.
      </Typography.Text>
    </div>
  )

  return (
    <Popover content={content} trigger="click" placement="bottomLeft">
      <Tooltip title={numbering ? undefined : 'Number every page, as slide numbers'}>
        <Button
          color="primary"
          variant="filled"
          size="small"
          icon={<NumberOutlined />}
          aria-label={numbering ? undefined : 'Page numbers'}
        >
          {numbering && 'Page numbers'}
        </Button>
      </Tooltip>
    </Popover>
  )
}
