import { Input, Button, List, Popconfirm, Tooltip } from 'antd'
import { PlusOutlined, SearchOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons'
import { useState, useMemo } from 'react'
import { useEditorStore } from '../../../../../../../store/editor/EditorStore'
import type { VariableData, VariableType } from '@imprime/sdk'
import './DropdownVariablesContent.css'

const TYPE_BADGE_LABEL: Record<VariableType, string> = {
  'string': 'string',
  'boolean': 'boolean',
  'object-list': 'list',
}

// A list's default is a row of objects — summarise it rather than stringify it,
// which would print '[object Object]'.
function formatDefault(variable: VariableData): string {
  const value = variable.default
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`
  return String(value)
}

// Presentation-wide variable management: browse and delete, plus the entry
// points into the edit form, which opens as a modal outside this popup — see
// VariableFormModal. Inserting a variable into a text lives with the text
// controls instead (InsertVariableButton), so this list shows every type, not
// just strings.
export function DropdownVariablesContent() {
  const [searchText, setSearchText] = useState('')

  const variables = useEditorStore(state => state.presentation?.variableData)
  const deleteVariable = useEditorStore(state => state.deleteVariable)
  const openVariableForm = useEditorStore(state => state.openVariableForm)

  const filteredVariables = useMemo(() => {
    const all = variables ?? []
    const search = searchText.trim().toLowerCase()
    if (!search) return all
    return all.filter(variable => variable.name.toLowerCase().includes(search))
  }, [variables, searchText])

  const handleDeleteVariable = async (variableId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await deleteVariable(variableId)
    } catch (error) {
      console.error('Failed to delete variable:', error)
    }
  }

  return (
    <div className="dropdown-variables-content">
      <Input
        placeholder="Search variables..."
        prefix={<SearchOutlined />}
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        allowClear
      />

      <div className="variables-list-container">
        {filteredVariables.length > 0 ? (
          <List
            size="small"
            dataSource={filteredVariables}
            renderItem={(variable) => (
              <List.Item className="variable-list-item is-static">
                <div className="variable-item-content">
                  <div className="variable-main">
                    <div className="variable-name-row">
                      <span className="variable-name">{variable.name}</span>
                      <span className="variable-type-badge">{TYPE_BADGE_LABEL[variable.type]}</span>
                    </div>
                    <div className="variable-sub">
                      {variable.default !== undefined && variable.default !== null && variable.default !== '' && (
                        <>Default: <span className="default-value">{formatDefault(variable)}</span></>
                      )}
                      {variable.required && (
                        <>Required</>
                      )}
                    </div>
                  </div>
                  <div className="variable-actions">
                    <Tooltip title="Edit variable">
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={(e) => {
                          e.stopPropagation()
                          openVariableForm({ mode: 'edit', variableId: variable._id })
                        }}
                        className="action-button"
                      />
                    </Tooltip>
                    <Popconfirm
                      title="Delete variable"
                      description="Are you sure you want to delete this variable?"
                      onConfirm={(e) => handleDeleteVariable(variable._id, e!)}
                      onCancel={(e) => e?.stopPropagation()}
                      okText="Delete"
                      cancelText="Cancel"
                      placement="left"
                    >
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={(e) => e.stopPropagation()}
                        className="action-button"
                      />
                    </Popconfirm>
                  </div>
                </div>
              </List.Item>
            )}
          />
        ) : (
          <div className="no-variables">
            <span>{searchText ? 'No variables found' : 'No variables yet'}</span>
          </div>
        )}
      </div>

      <Button
        type="dashed"
        icon={<PlusOutlined />}
        onClick={() => openVariableForm({ mode: 'create' })}
        block>
        Add Variable
      </Button>
    </div>
  )
}
