import { Input, Button, List, Form, Switch, Popconfirm } from 'antd'
import { ArrowLeftOutlined, PlusOutlined, SearchOutlined, DeleteOutlined } from '@ant-design/icons'
import { useState, useMemo } from 'react'
import { useEditorStore } from '../../../../../../store/editor/EditorStore'
import type { VariableData } from '@imprime/sdk'
import './DropdownVariablesContent.css'

interface VariableFormData {
  name: string
  defaultValue?: string
  required?: boolean
}

interface DropdownVariablesContentProps {
  onClose?: () => void
}

export function DropdownVariablesContent({ onClose }: DropdownVariablesContentProps) {
  const [searchText, setSearchText] = useState('')
  const [isCreation, setCreation] = useState(false)
  const [form] = Form.useForm<VariableFormData>()
  const [isRequired, setIsRequired] = useState(false)
  const [isFormValid, setIsFormValid] = useState(false)
  const presentation = useEditorStore(state => state.presentation)

  const variables = presentation?.variableData || []

  const filteredVariables = useMemo(() => {
    if (!searchText.trim()) return variables

    const searchLower = searchText.toLowerCase()
    return variables.filter(variable =>
      variable.name.toLowerCase().includes(searchLower)
    )
  }, [variables, searchText])

  const deleteVariable = useEditorStore(state => state.deleteVariable)
  const insertVariable = useEditorStore(state => state.insertVariable)

  const handleVariableClick = (variable: VariableData) => {
    insertVariable(variable._id)
    onClose?.()
  }

  const handleDeleteVariable = async (variableId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await deleteVariable(variableId)
    } catch (error) {
      console.error('Failed to delete variable:', error)
    }
  }

  const handleAddVariable = () => {
    setCreation(true);
  }

  const exitCreation = () => {
    setCreation(false);
    form.resetFields();
    setIsRequired(false);
    setIsFormValid(false);
  }

  const validateForm = async () => {
    try {
      await form.validateFields();
      setIsFormValid(true);
    } catch {
      setIsFormValid(false);
    }
  }

  const createVariable = useEditorStore(state => state.createVariable)
  const isLoadingVariables = useEditorStore(state => state.isLoadingVariables)

  const handleCreateVariable = async () => {
    try {
      const values = await form.validateFields();

      const newVariables = await createVariable({
        name: values.name,
        default: values.defaultValue,
        required: values.required || false,
        type: 'string'
      });

      const newVariable = newVariables[newVariables.length - 1];

      if (newVariable) {
        insertVariable(newVariable._id);

        onClose?.();
      }

      exitCreation();
    } catch (error) {
      console.error('Failed to create variable:', error);
    }
  }

  return (
    <div className="dropdown-variables-content">
      {isCreation ?
      <div className="variable-creation-form">
        <div className="creation-header">
          <Button icon={<ArrowLeftOutlined/>} type='text' onClick={exitCreation}/>
          <h3>Create Variable</h3>
        </div>

        <Form
          form={form}
          layout="vertical"
          className="variable-form"
        >
          <Form.Item
            label="Name"
            name="name"
            rules={[
              { required: true, message: 'Required' },
              { pattern: /^[a-zA-Z_][a-zA-Z0-9_]*$/, message: 'Must start with letter/underscore' }
            ]}
          >
            <Input
              placeholder="e.g., userName"
              onChange={validateForm}
            />
          </Form.Item>

          <Form.Item
            label="Required"
            name="required"
            valuePropName="checked"
            initialValue={false}
          >
            <Switch onChange={(checked) => {
              setIsRequired(checked);
              if (checked) {
                form.setFieldValue('defaultValue', undefined);
              }
            }} />
          </Form.Item>

          <Form.Item
            label="Default Value"
            name="defaultValue"
            tooltip={isRequired ? "Disabled when variable is required" : undefined}
          >
            <Input
              placeholder="Optional"
              disabled={isRequired}
            />
          </Form.Item>

          <div className='fill-space'/>

          <Form.Item>
            <Button
              type="primary"
              onClick={handleCreateVariable}
              disabled={!isFormValid || isLoadingVariables}
              loading={isLoadingVariables}
              block
            >
              Create
            </Button>
          </Form.Item>
        </Form>
      </div>
      : <>
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
              <List.Item
                className="variable-list-item"
                onClick={() => handleVariableClick(variable)}
              >
                <div className="variable-item-content">
                  <div className="variable-main">
                    <div className="variable-name-row">
                      <span className="variable-name">{variable.name}</span>
                    </div>
                    <div className="variable-sub">
                      {variable.default && (
                        <>Default: <span className="default-value">{variable.default}</span></>)
                      }
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
        onClick={handleAddVariable}
        block>
        Add Variable
      </Button>
      </>}
    </div>
  )
}
