import { Input, Button, List, Popconfirm } from 'antd'
import { PlusOutlined, SearchOutlined, DeleteOutlined } from '@ant-design/icons'
import { useState, useMemo } from 'react'
import { useEditorStore } from '../../../../../../../store/editor/EditorStore'
import type { VariableType } from '@imprime/sdk'
import { VariableCreationForm } from './VariableCreationForm'
import './DropdownVariablesContent.css'

const TYPE_BADGE_LABEL: Record<VariableType, string> = {
  'string': 'string',
  'boolean': 'boolean',
  'string-list': 'list',
}

// Presentation-wide variable management: create, review and delete. Inserting a
// variable into a text lives with the text controls instead — see
// InsertVariableButton — so this list shows every type, not just strings.
export function DropdownVariablesContent() {
  const [searchText, setSearchText] = useState('')
  const [isCreation, setCreation] = useState(false)

  const variables = useEditorStore(state => state.presentation?.variableData)
  const deleteVariable = useEditorStore(state => state.deleteVariable)

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

  if (isCreation) {
    return (
      <div className="dropdown-variables-content">
        <VariableCreationForm
          onCancel={() => setCreation(false)}
          onCreated={() => setCreation(false)}
        />
      </div>
    )
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
                        <>Default: <span className="default-value">{String(variable.default)}</span></>
                      )}
                      {variable.required && (
                        <>Required</>
                      )}
                    </div>
                  </div>
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
        onClick={() => setCreation(true)}
        block>
        Add Variable
      </Button>
    </div>
  )
}
