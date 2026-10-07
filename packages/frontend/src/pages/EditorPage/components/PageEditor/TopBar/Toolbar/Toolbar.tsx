import { Button, Tooltip, theme } from 'antd'
import {
  DragOutlined,
  PlusSquareOutlined,
  FontSizeOutlined,
  PictureOutlined,
  PlusCircleOutlined,
  GroupOutlined,
  BranchesOutlined,
  RetweetOutlined,
} from '@ant-design/icons'
import type { ToolType } from '../../../../../../store/editor/ToolSlice'
import { useEditorStore } from '../../../../../../store/editor/EditorStore'

const TOOLS: Array<{
  type: ToolType
  label: string
  icon: React.ReactNode
}> = [
  { type: 'move', label: 'Move item', icon: <DragOutlined /> },
  { type: 'rectangle', label: 'Add rectangle', icon: <PlusSquareOutlined /> },
  { type: 'ellipse', label: 'Add ellipse', icon: <PlusCircleOutlined /> },
  { type: 'text', label: 'Add text box', icon: <FontSizeOutlined /> },
  { type: 'image', label: 'Add image box', icon: <PictureOutlined /> },
  { type: 'group', label: 'Add layout group', icon: <GroupOutlined /> },
  { type: 'if-group', label: 'Add if group', icon: <BranchesOutlined /> },
  { type: 'for-group', label: 'Add for group', icon: <RetweetOutlined /> },
]

export default function Toolbar() {
  const selectedTool = useEditorStore(state => state.selectedTool)
  const setTool = useEditorStore(state => state.setTool)
  const selectShape = useEditorStore(state => state.selectShape)
  const { token } = theme.useToken()

  const handleToolClick = (toolType: ToolType) => {
    selectShape(null)
    setTool(toolType)
  }

  return (
    <div className="toolbar-container">
      {TOOLS.map((tool) => (
        <Tooltip key={tool.type} title={tool.label}>
          <Button
            className="btn"
            style={{
              color: selectedTool === tool.type ? token.colorPrimary : token.colorTextSecondary
            }}
            type="text"
            icon={tool.icon}
            onClick={() => handleToolClick(tool.type)}
          />
        </Tooltip>
      ))}
    </div>
  )
}
