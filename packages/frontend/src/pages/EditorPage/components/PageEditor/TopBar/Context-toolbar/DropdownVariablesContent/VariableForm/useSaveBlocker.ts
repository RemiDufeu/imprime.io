import { useEffect, useState } from 'react'
import { Form, type FormInstance } from 'antd'

// What a silent `validateFields` rejects with: the failing fields, or the
// sign that a later validation has replaced it.
interface ValidationFailure {
  errorFields?: { errors: string[] }[]
  outOfDate?: boolean
}

// Why the form cannot be saved yet — the first error of its rules — or null
// when it can. Rechecked after every render a value changed in, so it sees the
// fields as they are drawn — a list's fields appear only once its type is
// picked — with the rules of that render. Silent: each field shows its own
// errors once edited, and the save button says why it is off. A check that a
// later one replaced (a field validating its own change) decides nothing.
//
// The setter is for what only a save can find out (a name clash); the next
// edit rechecks over it.
export function useSaveBlocker<Values>(form: FormInstance<Values>, initial: string | null) {
  const [blocker, setBlocker] = useState<string | null>(initial)

  const values = Form.useWatch([], form)
  useEffect(() => {
    let current = true
    form.validateFields({ validateOnly: true }).then(
      () => {
        if (current) setBlocker(null)
      },
      (failure: ValidationFailure) => {
        if (current && !failure.outOfDate) setBlocker(failure.errorFields?.[0]?.errors[0] ?? 'Some fields are invalid')
      },
    )
    return () => {
      current = false
    }
  }, [form, values])

  return [blocker, setBlocker] as const
}
