import { Input, Button, List, Form, Switch, Popconfirm, Select } from 'antd'
import { ArrowLeftOutlined, PlusOutlined, SearchOutlined, DeleteOutlined } from '@ant-design/icons'
import { useState, useMemo } from 'react'
import { useEditorStore } from '../../../../../../../store/editor/EditorStore'
import type { VariableData, VariableType, VariableValueType } from '@imprime/sdk'
import './DropdownVariablesContent.css'

interface VariableFormData {
  name: string
  type: VariableType
  defaultValue?: VariableValueType
  required?: boolean
}

const TYPE_OPTIONS: { value: VariableType; label: string }[] = [
  { value: 'string', label: 'String' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'string-list', label: 'List of strings' },
]

const TYPE_BADGE_LABEL: Record<VariableType, string> = {
  'string': 'string',
  'boolean': 'boolean',
  'string-list': 'list',
}

// The text-editor variable dropdown only inserts inline text variables, so
// only string-typed variables can be picked from that list.
interface DropdownVariablesContentProps {
  onClose?: () => void
}

export function DropdownVariablesContent({ onClose }: DropdownVariablesContentProps) {
  const [searchText, setSearchText] = useState('')
  const [isCreation, setCreation] = useState(false)
  const [form] = Form.useForm<VariableFormData>()
  const [isRequired, setIsRequired] = useState(false)
  const [selectedType, setSelectedType] = useState<VariableType>('string')
  const [isFormValid, setIsFormValid] = useState(false)
  const presentation = useEditorStore(state => state.presentation)

  const variables = presentation?.variableData || []

  const filteredVariables = useMemo(() => {
    const stringOnly = variables.filter(v => v.type === 'string')
    if (!searchText.trim()) return stringOnly

    const searchLower = searchText.toLowerCase()
    return stringOnly.filter(variable =>
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
    setSelectedType('string');
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
        type: values.type,
      });

      const newVariable = newVariables[newVariables.length - 1];

      if (newVariable && newVariable.type === 'string') {
        insertVariable(newVariable._id);
        onClose?.();
      }

      exitCreation();
    } catch (error) {
      console.error('Failed to create variable:', error);
    }
  }

  const renderDefaultInput = () => {
    if (selectedType === 'boolean') {
      return (
        <Form.Item
          label="Default Value"
          name="defaultValue"
          valuePropName="checked"
          tooltip={isRequired ? "Disabled when variable is required" : undefined}
        >
          <Switch disabled={isRequired} />
        </Form.Item>
      )
    }
    if (selectedType === 'string-list') {
      return (
        <Form.Item
          label="Default Value"
          name="defaultValue"
          tooltip={isRequired ? "Disabled when variable is required" : 'Press enter to add an item'}
        >
          <Select
            mode="tags"
            disabled={isRequired}
            placeholder="Add items..."
            tokenSeparators={[',']}
          />
        </Form.Item>
      )
    }
    return (
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
    )
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
          initialValues={{ type: 'string' }}
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
            label="Type"
            name="type"
          >
            <Select
              options={TYPE_OPTIONS}
              onChange={(value: VariableType) => {
                setSelectedType(value)
                form.setFieldValue('defaultValue', undefined)
              }}
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

          {renderDefaultInput()}

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
            <span>{searchText ? 'No variables found' : 'No string variables yet'}</span>
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
