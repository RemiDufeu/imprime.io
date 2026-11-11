import { useState } from 'react'
import { Alert, Input, Modal, Typography } from 'antd'
import { ApiOutlined } from '@ant-design/icons'
import { isValidTemplateCode, TEMPLATE_CODE_MAX_LENGTH } from '@imprime/sdk'
import './ImportCodeModal.css'

// `code` with a number after it that no template has yet: INVOICE_2, then
// INVOICE_3. A number it already ends with is replaced, not added to.
function freeCode(code: string, taken: ReadonlySet<string>): string {
  const base = code.replace(/_\d+$/, '')
  for (let n = 2; ; n++) {
    const suffix = `_${n}`
    const candidate = `${base.slice(0, TEMPLATE_CODE_MAX_LENGTH - suffix.length)}${suffix}`
    if (!taken.has(candidate)) return candidate
  }
}

interface ImportCodeModalProps {
  // The file's code, which another of the user's templates has.
  takenCode: string
  // The codes of the user's templates as last listed. The server decides:
  // these only steer the suggestion and the field's check.
  takenCodes: ReadonlySet<string>
  isImporting: boolean
  onCancel: () => void
  // The code to import the file under; null for none.
  onSubmit: (code: string | null) => void
}

// Asks for another code when the file's is taken, starting from a free one.
// Mounted while it is open, and keyed by the code it asks about, so that the
// field starts over for each.
export default function ImportCodeModal({ takenCode, takenCodes, isImporting, onCancel, onSubmit }: ImportCodeModalProps) {
  const [value, setValue] = useState(() => freeCode(takenCode, takenCodes))

  const code = value.trim()
  const isInvalid = code !== '' && !isValidTemplateCode(code)
  const isTaken = takenCodes.has(code)
  const canSubmit = !isInvalid && !isTaken

  const submit = () => {
    if (canSubmit) onSubmit(code === '' ? null : code)
  }

  let problem: string | null = null
  if (isInvalid) problem = `Letters, digits, "-" and "_" only, ${TEMPLATE_CODE_MAX_LENGTH} at most`
  else if (isTaken) problem = 'Another of your templates has this code too'

  return (
    <Modal
      open
      title="Code already in use"
      okText="Import"
      onOk={submit}
      okButtonProps={{ disabled: !canSubmit }}
      confirmLoading={isImporting}
      onCancel={onCancel}
    >
      <div className="import-code">
        <Alert
          type="warning"
          showIcon
          message={`Another of your templates has the code "${takenCode}".`}
          description="Give the imported template another code, or leave the field empty for none."
        />
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onPressEnter={submit}
          placeholder="No code"
          maxLength={TEMPLATE_CODE_MAX_LENGTH}
          status={problem ? 'error' : undefined}
          prefix={<ApiOutlined />}
          aria-label="Code of the imported template"
          autoFocus
        />
        {problem && <Typography.Text type="danger">{problem}</Typography.Text>}
      </div>
    </Modal>
  )
}
