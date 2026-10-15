import { Input, Button, Form, Switch, Select, Tooltip } from 'antd'
import { useState } from 'react'
import { useEditorStore } from '../../../../../../../../store/editor/EditorStore'
import type { VariableData, VariableItemField, VariableType, VariableValueType } from '@imprime/sdk'
import { getVariableMaxItems, getVariableMaxLength } from '@imprime/sdk'
import { parseApiError } from '../../../../../../../../utils/apiError'
import { TypeSpecificFields } from './TypeSpecificFields'
import { DefaultValueInput } from './DefaultValueInput'
import { ReferenceImpactWarning } from './ReferenceImpactWarning'
import { useSaveBlocker } from './useSaveBlocker'
import './VariableForm.css'

interface VariableFormData {
  name: string
  type: VariableType
  defaultValue?: VariableValueType
  required?: boolean
  // antd's InputNumber gives null once cleared.
  maxLength?: number | null
  maxItems?: number | null
  itemFields?: VariableItemField[]
}

// A Record rather than an array of options, so the next VariableType member
// fails to compile here instead of quietly missing from the picker.
const TYPE_LABEL: Record<VariableType, string> = {
  'string': 'String',
  'boolean': 'Boolean',
  'image': 'Image',
  'object-list': 'List',
}

const TYPE_OPTIONS = (Object.keys(TYPE_LABEL) as VariableType[]).map(value => ({
  value,
  label: TYPE_LABEL[value],
}))

const NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/

interface VariableFormProps {
  // Absent creates, present edits that definition.
  variable?: VariableData
  // Called with the saved definition, so the caller can decide what to do next
  // (the picker inserts it, the manager just returns to the list).
  onSaved: (variable: VariableData) => void
  onCancel: () => void
  // Restricts the type picker — the text picker can only insert strings.
  lockedType?: VariableType
}

export function VariableForm({ variable, onSaved, onCancel, lockedType }: VariableFormProps) {
  const isEdit = variable !== undefined

  const [form] = Form.useForm<VariableFormData>()
  const [isRequired, setIsRequired] = useState(variable?.required ?? false)
  const [selectedType, setSelectedType] = useState<VariableType>(lockedType ?? variable?.type ?? 'string')
  // A stored definition was valid when it was written, so an edit starts
  // savable; a new one has no name yet.
  const [blocker, setBlocker] = useSaveBlocker(form, isEdit ? null : 'A name is required')

  // The declared schema drives the default-value hint and the impact warning,
  // so the form has to read its own field back. `useWatch` has not settled on
  // the first render, and ItemFieldsEditor never emits `undefined` once
  // touched, so the fallback only covers that first frame.
  const watchedItemFields = Form.useWatch('itemFields', form)
  const itemFields = watchedItemFields ?? variable?.itemFields
  // The limits bound the default's input, so they are read back the same way.
  const watchedMaxLength = Form.useWatch('maxLength', form)
  const maxLength = getVariableMaxLength({
    type: selectedType,
    maxLength: (watchedMaxLength === undefined ? variable?.maxLength : watchedMaxLength) ?? undefined,
  })
  const watchedMaxItems = Form.useWatch('maxItems', form)
  const maxItems = getVariableMaxItems({
    type: selectedType,
    maxItems: (watchedMaxItems === undefined ? variable?.maxItems : watchedMaxItems) ?? undefined,
  })

  const createVariable = useEditorStore(state => state.createVariable)
  const updateVariable = useEditorStore(state => state.updateVariable)
  const isLoadingVariables = useEditorStore(state => state.isLoadingVariables)

  const handleSubmit = async () => {
    let values: VariableFormData
    try {
      values = await form.validateFields()
    } catch {
      return
    }

    const definition = {
      name: values.name,
      required: values.required || false,
      type: values.type,
      itemFields: values.type === 'object-list' ? values.itemFields : undefined,
    }
    const limit = values.type === 'string' ? values.maxLength ?? undefined : undefined
    const itemLimit = values.type === 'object-list' ? values.maxItems ?? undefined : undefined

    try {
      const variables = isEdit
        // The form always states the default, so an emptied field has to clear
        // the stored one rather than read as "leave it alone".
        ? await updateVariable(variable._id, {
            ...definition,
            default: values.defaultValue ?? null,
            maxLength: limit ?? null,
            maxItems: itemLimit ?? null,
          })
        : await createVariable({ ...definition, default: values.defaultValue, maxLength: limit, maxItems: itemLimit })

      const saved = isEdit
        ? variables.find(v => v._id === variable._id)
        : variables[variables.length - 1]
      if (saved) onSaved(saved)
    } catch (error) {
      // The only failure the author can act on is the name clash, and it
      // belongs on the name field rather than in a toast.
      if (parseApiError(error).code === 'VARIABLE_NAME_EXISTS') {
        form.setFields([{ name: 'name', errors: ['A variable with this name already exists'] }])
        setBlocker('A variable with this name already exists')
        return
      }
      console.error(`Failed to ${isEdit ? 'update' : 'create'} variable:`, error)
    }
  }

  return (
    <div className="variable-form-panel">
      <Form
        form={form}
        layout="vertical"
        className="variable-form"
        initialValues={{
          name: variable?.name,
          type: lockedType ?? variable?.type ?? 'string',
          defaultValue: variable?.default,
          required: variable?.required ?? false,
          maxLength: variable?.maxLength,
          maxItems: variable?.maxItems,
          itemFields: variable?.itemFields,
        }}
      >
        <Form.Item
          label="Name"
          name="name"
          rules={[
            { required: true, message: 'A name is required' },
            { pattern: NAME_PATTERN, message: 'The name must start with a letter or underscore' },
          ]}
          // Renaming is safe by design: shapes reference a variable by id, and
          // only the export payload is keyed by name.
          extra={isEdit ? 'The export payload is keyed by this name.' : undefined}
        >
          <Input placeholder="e.g., userName" autoFocus />
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

        <Form.Item label="Required" name="required" valuePropName="checked">
          <Switch
            onChange={(checked) => {
              setIsRequired(checked)
              if (checked) form.setFieldValue('defaultValue', undefined)
            }}
          />
        </Form.Item>

        <TypeSpecificFields type={selectedType} />

        <DefaultValueInput
          type={selectedType}
          isRequired={isRequired}
          maxLength={maxLength}
          maxItems={maxItems}
          itemFields={itemFields}
        />

        {variable !== undefined && (
          <ReferenceImpactWarning variable={variable} type={selectedType} itemFields={itemFields} />
        )}

        <div className="variable-form-actions">
          <Button onClick={onCancel}>Cancel</Button>
          <Tooltip title={blocker}>
            <Button
              type="primary"
              onClick={handleSubmit}
              disabled={blocker !== null || isLoadingVariables}
              loading={isLoadingVariables}
            >
              {isEdit ? 'Save' : 'Create'}
            </Button>
          </Tooltip>
        </div>
      </Form>
    </div>
  )
}
