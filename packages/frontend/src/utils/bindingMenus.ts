import type { MenuProps } from 'antd'
import type { RepeatBinding, VariableData, VisibilityCondition } from '@imprime/sdk'
import {
  decodeItemFieldValue,
  encodeItemFieldValue,
  variableReferenceLabel,
  type ItemFieldOption,
} from './variableScope'

type MenuItems = NonNullable<MenuProps['items']>

// The menu a binding is picked from — a condition, a repeat — whatever it
// binds: a shape, a group, a page.
export interface BindingMenu<T> {
  items: MenuItems
  selectedKeys: string[]
  // What the binding reads as, after its control's label. Unset while unbound.
  binding: string | undefined
  // What picking `key` makes the binding: `{ value }`, undefined removing it;
  // null for a key that changes nothing, or that is not this menu's.
  pick: (key: string) => { value: T | undefined } | null
}

// Menu keys besides the variables'. An encoded variable always holds '::', so
// none of these can be one.
const ALWAYS = '__always__'
const WHEN_TRUE = '__when-true__'
const WHEN_FALSE = '__when-false__'
const NO_CONDITION_VARIABLES = '__none__'
const NO_REPEAT = '__no-repeat__'
const NO_LISTS = '__no-lists__'

// `prefix` keys a menu apart from another one in the same dropdown.
function keyed(prefix: string) {
  return {
    key: (key: string) => `${prefix}${key}`,
    unkey: (key: string) => (key.startsWith(prefix) ? key.slice(prefix.length) : null),
    options: (options: ItemFieldOption[]) =>
      options.map(option => ({ key: `${prefix}${encodeItemFieldValue(option.variableId, option.itemPath)}`, label: option.label })),
  }
}

/**
 * Show always, or only while a boolean variable — or a boolean field of the
 * item a repeat around it iterates, `itemFields` — is true, or false.
 */
export function conditionMenu(
  condition: VisibilityCondition | undefined,
  variables: VariableData[],
  itemFields: ItemFieldOption[],
  prefix = '',
): BindingMenu<VisibilityCondition> {
  const { key, unkey, options } = keyed(prefix)
  const templateVariables = variables
    .filter(v => v.type === 'boolean')
    .map(v => ({ key: key(encodeItemFieldValue(v._id, '')), label: v.name }))
  const fields = options(itemFields)

  const items: MenuItems = [
    { key: key(ALWAYS), label: 'Always' },
    { type: 'divider' },
    ...(templateVariables.length === 0 && fields.length === 0
      ? [{ key: key(NO_CONDITION_VARIABLES), label: 'No boolean variables or item fields', disabled: true }]
      : []),
    ...(templateVariables.length > 0 ? [{ type: 'group' as const, label: 'Variables', children: templateVariables }] : []),
    ...(fields.length > 0 ? [{ type: 'group' as const, label: 'Item fields', children: fields }] : []),
    ...(condition
      ? [
          { type: 'divider' as const },
          { key: key(WHEN_TRUE), label: 'When true' },
          { key: key(WHEN_FALSE), label: 'When false' },
        ]
      : []),
  ]

  // '' encodes "the variable itself", which is `itemPath` left unset.
  const selectedKeys = condition
    ? [
        ...(condition.variableId ? [key(encodeItemFieldValue(condition.variableId, condition.itemPath ?? ''))] : []),
        key(condition.negate ? WHEN_FALSE : WHEN_TRUE),
      ]
    : [key(ALWAYS)]

  // A condition without a variable is one a paste could not rebind: what it
  // binds never shows until one is picked or the condition cleared.
  let binding: string | undefined
  if (condition) {
    const name = condition.variableId
      ? variableReferenceLabel(variables, condition.variableId, condition.itemPath) ?? 'unknown variable'
      : 'missing variable'
    binding = condition.negate ? `not ${name}` : name
  }

  const pick = (picked: string): { value: VisibilityCondition | undefined } | null => {
    const own = unkey(picked)
    if (own === null || own === NO_CONDITION_VARIABLES) return null
    if (own === ALWAYS) return { value: undefined }
    if (own === WHEN_TRUE || own === WHEN_FALSE) {
      return condition ? { value: { ...condition, negate: own === WHEN_FALSE || undefined } } : null
    }
    const decoded = decodeItemFieldValue(own)
    if (!decoded) return null
    return {
      value: {
        variableId: decoded.variableId,
        itemPath: decoded.itemPath === '' ? undefined : decoded.itemPath,
        negate: condition?.negate,
      },
    }
  }

  return { items, selectedKeys, binding, pick }
}

/**
 * Not repeated, or repeated for a list variable — or a list field of the item
 * a repeat around it iterates, `itemLists`: what makes nesting possible.
 */
export function repeatMenu(
  repeat: RepeatBinding | undefined,
  variables: VariableData[],
  itemLists: ItemFieldOption[],
  prefix = '',
): BindingMenu<RepeatBinding> {
  const { key, unkey, options } = keyed(prefix)
  const lists = variables
    .filter(v => v.type === 'object-list')
    .map(v => ({ key: key(encodeItemFieldValue(v._id, '')), label: v.name }))
  const fields = options(itemLists)

  const items: MenuItems = [
    { key: key(NO_REPEAT), label: 'No repeat' },
    { type: 'divider' },
    ...(lists.length === 0 && fields.length === 0
      ? [{ key: key(NO_LISTS), label: 'No list variables', disabled: true }]
      : []),
    ...(lists.length > 0 ? [{ type: 'group' as const, label: 'Lists', children: lists }] : []),
    ...(fields.length > 0 ? [{ type: 'group' as const, label: 'Item lists', children: fields }] : []),
  ]

  // '' encodes "the variable itself", which is `itemPath` left unset.
  let selectedKeys = [key(NO_REPEAT)]
  if (repeat) {
    selectedKeys = repeat.variableId ? [key(encodeItemFieldValue(repeat.variableId, repeat.itemPath ?? ''))] : []
  }

  // A repeat a paste could not rebind has no list: it draws no copy until one
  // is picked.
  let binding: string | undefined
  if (repeat) {
    binding = repeat.variableId
      ? variableReferenceLabel(variables, repeat.variableId, repeat.itemPath) ?? 'unknown list'
      : 'pick a list'
  }

  const pick = (picked: string): { value: RepeatBinding | undefined } | null => {
    const own = unkey(picked)
    if (own === null || own === NO_LISTS) return null
    if (own === NO_REPEAT) return { value: undefined }
    const decoded = decodeItemFieldValue(own)
    if (!decoded) return null
    return {
      value: {
        variableId: decoded.variableId,
        itemPath: decoded.itemPath === '' ? undefined : decoded.itemPath,
      },
    }
  }

  return { items, selectedKeys, binding, pick }
}
