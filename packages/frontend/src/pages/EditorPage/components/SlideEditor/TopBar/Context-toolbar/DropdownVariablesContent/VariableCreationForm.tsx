import { Input, Button, Form, Switch, Select } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { useEditorStore } from '../../../../../../../store/editor/EditorStore'
import type { VariableData, VariableType, VariableValueType } from '@imprime/sdk'

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

interface VariableCreationFormProps {
  // Called with the freshly created variable, so the caller can decide what to
  // do next (the picker inserts it, the manager just returns to the list).
  onCreated: (variable: VariableData) => void
  onCancel: () => void
  // Restricts the type picker — the text picker can only insert strings.
  lockedType?: VariableType
}

export function VariableCreationForm({ onCreated, onCancel, lockedType }: VariableCreationFormProps) {
  const [form] = Form.useForm<VariableFormData>()
  const [isRequired, setIsRequired] = useState(false)
  const [selectedType, setSelectedType] = useState<VariableType>(lockedType ?? 'string')
  const [isFormValid, setIsFormValid] = useState(false)

  const createVariable = useEditorStore(state => state.createVariable)
  const isLoadingVariables = useEditorStore(state => state.isLoadingVariables)

  const validateForm = async () => {
    try {
      await form.validateFields()
      setIsFormValid(true)
    } catch {
      setIsFormValid(false)
    }
  }

  const handleCreateVariable = async () => {
    try {
      const values = await form.validateFields()

      const newVariables = await createVariable({
        name: values.name,
        default: values.defaultValue,
        required: values.required || false,
        type: values.type,
      })

      const newVariable = newVariables[newVariables.length - 1]
      if (newVariable) onCreated(newVariable)
    } catch (error) {
      console.error('Failed to create variable:', error)
    }
  }

  const renderDefaultInput = () => {
    if (selectedType === 'boolean') {
      return (
        <Form.Item
          label="Default Value"
          name="defaultValue"
          valuePropName="checked"
          tooltip={isRequired ? 'Disabled when variable is required' : undefined}
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
          tooltip={isRequired ? 'Disabled when variable is required' : 'Press enter to add an item'}
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
        tooltip={isRequired ? 'Disabled when variable is required' : undefined}
      >
        <Input placeholder="Optional" disabled={isRequired} />
      </Form.Item>
    )
  }

  return (
    <div className="variable-creation-form">
      <div className="creation-header">
        <Button icon={<ArrowLeftOutlined />} type="text" onClick={onCancel} />
        <h3>Create Variable</h3>
      </div>

      <Form
        form={form}
        layout="vertical"
        className="variable-form"
        initialValues={{ type: lockedType ?? 'string' }}
      >
        <Form.Item
          label="Name"
          name="name"
          rules={[
            { required: true, message: 'Required' },
            { pattern: /^[a-zA-Z_][a-zA-Z0-9_]*$/, message: 'Must start with letter/underscore' },
          ]}
        >
          <Input placeholder="e.g., userName" onChange={validateForm} />
        </Form.Item>

        <Form.Item label="Type" name="type">
          <Select
            options={TYPE_OPTIONS}
            disabled={lockedType !== undefined}
            onChange={(value: VariableType) => {
              setSelectedType(value)
              form.setFieldValue('defaultValue', undefined)
            }}
          />
        </Form.Item>

        <Form.Item label="Required" name="required" valuePropName="checked" initialValue={false}>
          <Switch
            onChange={(checked) => {
              setIsRequired(checked)
              if (checked) form.setFieldValue('defaultValue', undefined)
            }}
          />
        </Form.Item>

        {renderDefaultInput()}

        <div className="fill-space" />

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
  )
}
