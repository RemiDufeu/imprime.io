import { Input, Button, Form, Switch, Select } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { useEditorStore } from '../../../../../../../store/editor/EditorStore'
import type { VariableData, VariableItemField, VariableType, VariableValueType } from '@imprime/sdk'
import { ItemListInput } from '../../../../../../../components/common'
import { ItemFieldsEditor, ITEM_FIELD_NAME_PATTERN } from './ItemFieldsEditor'

interface VariableFormData {
  name: string
  type: VariableType
  defaultValue?: VariableValueType
  required?: boolean
  itemFields?: VariableItemField[]
}

// A Record rather than an array of options, so the next VariableType member
// fails to compile here instead of quietly missing from the picker.
const TYPE_LABEL: Record<VariableType, string> = {
  'string': 'String',
  'boolean': 'Boolean',
  'object-list': 'List',
}

const TYPE_OPTIONS = (Object.keys(TYPE_LABEL) as VariableType[]).map(value => ({
  value,
  label: TYPE_LABEL[value],
}))

// Every declared field needs a usable name before the variable can be created:
// the name is half of the path a text run stores.
function areItemFieldsValid(fields: VariableItemField[] | undefined): boolean {
  if (!fields || fields.length === 0) return false
  return fields.every(
    field =>
      ITEM_FIELD_NAME_PATTERN.test(field.name) &&
      (field.type !== 'object-list' || areItemFieldsValid(field.itemFields))
  )
}

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

  // The declared schema drives the default-value hint, so the form has to read
  // its own field back.
  const itemFields = Form.useWatch('itemFields', form)

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
        itemFields: values.type === 'object-list' ? values.itemFields : undefined,
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
    if (selectedType === 'object-list') {
      return (
        <Form.Item
          label="Default Value"
          name="defaultValue"
          tooltip={isRequired ? 'Disabled when variable is required' : 'A JSON array of objects'}
        >
          <ItemListInput disabled={isRequired} itemFields={itemFields} />
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
        onValuesChange={validateForm}
      >
        <Form.Item
          label="Name"
          name="name"
          rules={[
            { required: true, message: 'Required' },
            { pattern: /^[a-zA-Z_][a-zA-Z0-9_]*$/, message: 'Must start with letter/underscore' },
          ]}
        >
          <Input placeholder="e.g., userName" />
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

        {selectedType === 'object-list' && (
          <Form.Item
            label="Item Fields"
            name="itemFields"
            tooltip="Declared once, then offered by the pickers inside a for group"
            rules={[
              {
                validator: (_, value) =>
                  areItemFieldsValid(value)
                    ? Promise.resolve()
                    : Promise.reject(new Error('Every field needs a name of letters, digits or underscore')),
              },
            ]}
          >
            <ItemFieldsEditor />
          </Form.Item>
        )}

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
