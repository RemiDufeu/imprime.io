import type { Page } from '@imprime/sdk'
import { useEditorStore } from '../../../../store/editor/EditorStore'
import { conditionMenu, repeatMenu } from '../../../../utils/bindingMenus'
import { itemFieldsInScope } from '../../../../utils/variableScope'

/**
 * The menus of a page's condition and repeat, and what picking an entry of
 * either does — for the page's context bar and its thumbnail's menu. Keyed
 * apart, so that one dropdown can hold both.
 *
 * The condition reads a boolean variable, or a boolean field of the page's
 * own item when it is repeated: it is checked copy by copy. The repeat reads a
 * list variable only — a page sits inside no repeat.
 */
export function usePageBindingMenus(page: Page) {
  const updatePageBindings = useEditorStore(state => state.updatePageBindings)
  const variables = useEditorStore(state => state.template?.variableData) ?? []

  const itemFields = itemFieldsInScope(page, null, variables, 'boolean', true)
  const condition = conditionMenu(page.visibleWhen, variables, itemFields, 'show:')
  const repeat = repeatMenu(page.repeat, variables, [], 'repeat:')

  const select = (key: string) => {
    const shown = condition.pick(key)
    if (shown) {
      updatePageBindings(page._id, { visibleWhen: shown.value })
      return
    }
    // Narrowed to a `PageRepeat` by hand: the menu builds a group's binding,
    // whose `itemPath` a page has no use for — and it is offered no item list.
    const repeated = repeat.pick(key)
    if (repeated) {
      updatePageBindings(page._id, { repeat: repeated.value && { variableId: repeated.value.variableId } })
    }
  }

  return { condition, repeat, select }
}
