import type { FormRule } from 'antd'
import type { VariableItemField } from '@imprime/sdk'
import { findItemFieldIssue, getVariableMaxLength } from '@imprime/sdk'

// The rule of a list value's input, checking what the server will: every item
// gives each required field a value, and no string field more characters than
// its limit. `label` heads the path the message names: `products[2].name`.
export function itemFieldsRule(itemFields: VariableItemField[] | undefined, label: string): FormRule {
  return {
    validator: (_, value: unknown) => {
      const issue = findItemFieldIssue(value, itemFields, label)
      if (!issue) return Promise.resolve()
      return Promise.reject(new Error(
        issue.problem === 'missing'
          ? `${issue.path} is required`
          : `${issue.path} has more than ${getVariableMaxLength(issue.field)} characters`
      ))
    },
  }
}
