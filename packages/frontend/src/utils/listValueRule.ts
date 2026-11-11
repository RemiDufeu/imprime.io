import type { FormRule } from 'antd'
import type { ItemFieldIssue, VariableData } from '@imprime/sdk'
import { exceedsMaxItems, findItemFieldIssue, getVariableMaxItems, getVariableMaxLength } from '@imprime/sdk'

function describeIssue(issue: ItemFieldIssue): string {
  switch (issue.problem) {
    case 'missing':
      return `${issue.path} is required`
    case 'too-long':
      return `${issue.path} has more than ${getVariableMaxLength(issue.field)} characters`
    case 'too-many':
      return `${issue.path} has more than ${getVariableMaxItems(issue.field)} items`
  }
}

// The rule of a list value's input, checking what the server will: no more
// items than the list's limit, every item gives each required field a value,
// and no field's value is over its own limit. `label` names the list, and
// heads the path a message names: `products[2].name`.
export function listValueRule(list: Pick<VariableData, 'maxItems' | 'itemFields'>, label: string): FormRule {
  return {
    validator: (_, value: unknown) => {
      if (exceedsMaxItems({ type: 'object-list', maxItems: list.maxItems }, value)) {
        return Promise.reject(new Error(`${label} has more than ${list.maxItems} items`))
      }
      const issue = findItemFieldIssue(value, list.itemFields, label)
      return issue ? Promise.reject(new Error(describeIssue(issue))) : Promise.resolve()
    },
  }
}
