import { Modal } from 'antd'
import { useEditorStore } from '../../../../../../../store/editor/EditorStore'
import { VariableForm } from './VariableForm'

/**
 * Hosts the variable create/edit form.
 *
 * A Modal rather than the variables dropdown on purpose: rc-dropdown installs a
 * window-level keydown handler that treats Tab as "leave the menu" — it either
 * swallows the keystroke and throws focus at the popup root, or closes the
 * popup outright, discarding whatever was typed. rc-dialog does the opposite
 * and keeps Tab cycling inside the dialog.
 *
 * Mounted next to the header, outside the dropdown, so closing the panel does
 * not unmount the form.
 */
export function VariableFormModal() {
  const target = useEditorStore(state => state.variableForm)
  const closeVariableForm = useEditorStore(state => state.closeVariableForm)
  const variables = useEditorStore(state => state.presentation?.variableData)

  const editing =
    target?.mode === 'edit'
      ? (variables ?? []).find(variable => variable._id === target.variableId)
      : undefined

  // A concurrent delete leaves the target pointing at nothing — there is no
  // definition left to edit, so treat it as closed.
  const isOpen = target !== null && (target.mode === 'create' || editing !== undefined)

  return (
    <Modal
      title={target?.mode === 'edit' ? 'Edit Variable' : 'Create Variable'}
      open={isOpen}
      onCancel={closeVariableForm}
      // The form carries its own actions, and the schema editor makes this tall
      // enough that a stray click outside must not discard it. Esc still closes
      // — that one is deliberate.
      footer={null}
      maskClosable={false}
      destroyOnHidden
      width={480}
    >
      <VariableForm
        variable={editing}
        onCancel={closeVariableForm}
        onSaved={closeVariableForm}
      />
    </Modal>
  )
}
