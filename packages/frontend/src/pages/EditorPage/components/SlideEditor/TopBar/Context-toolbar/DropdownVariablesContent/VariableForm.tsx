import { Alert, Input, Button, Form, Switch, Select } from 'antd'
import { useState } from 'react'
import { useEditorStore } from '../../../../../../../store/editor/EditorStore'
import type { VariableData, VariableItemField, VariableType, VariableValueType } from '@imprime/sdk'
import { ItemListInput } from '../../../../../../../components/common'
import { itemFieldAtPath } from '../../../../../../../utils/variableScope'
import {
  describeReference,
  findVariableReferences,
  referenceRequiredType,
  type VariableReference,
} from '../../../../../../../utils/variableUsage'
import { parseApiError } from '../../../../../../../utils/apiError'
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

const NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/

// Every declared field needs a usable name before the variable can be saved:
// the name is half of the path a text run stores.
function areItemFieldsValid(fields: VariableItemField[] | undefined): boolean {
  if (!fields || fields.length === 0) return false
  return fields.every(
    field =>
      ITEM_FIELD_NAME_PATTERN.test(field.name) &&
      (field.type !== 'object-list' || areItemFieldsValid(field.itemFields))
  )
}

// What a reference resolves to under a candidate definition, or undefined when
// its path no longer names anything — the silent failure an edit introduces.
function referenceTargetType(
  reference: VariableReference,
  type: VariableType,
  itemFields: VariableItemField[] | undefined,
): VariableType | undefined {
  if (reference.itemPath === '') return type
  if (type !== 'object-list') return undefined
  return itemFieldAtPath(itemFields, reference.itemPath)?.type
}

function isReferenceBroken(
  reference: VariableReference,
  type: VariableType,
  itemFields: VariableItemField[] | undefined,
): boolean {
  const target = referenceTargetType(reference, type, itemFields)
  if (target === undefined) return true
  const required = referenceRequiredType(reference.kind)
  return required !== undefined && target !== required
}

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
  // submittable; a new one has an empty name and does not.
  const [isFormValid, setIsFormValid] = useState(isEdit)

  // The declared schema drives the default-value hint and the impact warning,
  // so the form has to read its own field back. `useWatch` has not settled on
  // the first render, and ItemFieldsEditor never emits `undefined` once
  // touched, so the fallback only covers that first frame.
  const watchedItemFields = Form.useWatch('itemFields', form)
  const itemFields = watchedItemFields ?? variable?.itemFields

  const createVariable = useEditorStore(state => state.createVariable)
  const updateVariable = useEditorStore(state => state.updateVariable)
  const isLoadingVariables = useEditorStore(state => state.isLoadingVariables)
  const slides = useEditorStore(state => state.presentation?.slides)

  // References the edit is about to break — the ones that resolve today and
  // would not under the pending definition. Pre-existing breakage is left
  // alone: this warns about what this change does, not about the template's
  // state in general.
  const existingReferences = isEdit ? findVariableReferences(slides ?? [], variable._id) : []
  const newlyBroken = isEdit
    ? existingReferences.filter(
        reference =>
          isReferenceBroken(reference, selectedType, itemFields) &&
          !isReferenceBroken(reference, variable.type, variable.itemFields)
      )
    : []

  const validateForm = async () => {
    try {
      await form.validateFields()
      setIsFormValid(true)
    } catch {
      setIsFormValid(false)
    }
  }

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

    try {
      const variables = isEdit
        // The form always states the default, so an emptied field has to clear
        // the stored one rather than read as "leave it alone".
        ? await updateVariable(variable._id, { ...definition, default: values.defaultValue ?? null })
        : await createVariable({ ...definition, default: values.defaultValue })

      const saved = isEdit
        ? variables.find(v => v._id === variable._id)
        : variables[variables.length - 1]
      if (saved) onSaved(saved)
    } catch (error) {
      // The only failure the author can act on is the name clash, and it
      // belongs on the name field rather than in a toast.
      if (parseApiError(error).code === 'VARIABLE_NAME_EXISTS') {
        form.setFields([{ name: 'name', errors: ['A variable with this name already exists'] }])
        setIsFormValid(false)
        return
      }
      console.error(`Failed to ${isEdit ? 'update' : 'create'} variable:`, error)
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
          itemFields: variable?.itemFields,
        }}
        onValuesChange={validateForm}
      >
        <Form.Item
          label="Name"
          name="name"
          rules={[
            { required: true, message: 'Required' },
            { pattern: NAME_PATTERN, message: 'Must start with letter/underscore' },
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

        {variable !== undefined && newlyBroken.length > 0 && (
          <Alert
            type="warning"
            showIcon
            className="variable-impact-warning"
            message={`${newlyBroken.length} reference${newlyBroken.length === 1 ? '' : 's'} will stop resolving`}
            description={
              <ul className="variable-impact-list">
                {newlyBroken.slice(0, 5).map((reference, index) => (
                  <li key={index}>{describeReference(reference, variable.name)}</li>
                ))}
                {newlyBroken.length > 5 && <li>and {newlyBroken.length - 5} more</li>}
              </ul>
            }
          />
        )}

        <div className="variable-form-actions">
          <Button onClick={onCancel}>Cancel</Button>
          <Button
            type="primary"
            onClick={handleSubmit}
            disabled={!isFormValid || isLoadingVariables}
            loading={isLoadingVariables}
          >
            {isEdit ? 'Save' : 'Create'}
          </Button>
        </div>
      </Form>
    </div>
  )
}
