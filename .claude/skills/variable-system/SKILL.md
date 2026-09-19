---
name: variable-system
description: How Imprime variables work — the three variable types, the id-versus-name indirection, resolution and default-fallback rules, required-variable validation at export, and the lifecycle constraints (unique names, in-use deletion guard). Use when touching variables, if-group conditions, for-group iteration, text variable runs, or the export payload contract.
metadata:
  origin: adapted from ECC (github.com/affaan-m/ECC)
---

# Variable System

A variable is what turns a document into a template. Definitions live on the
presentation; values arrive at export time.

```ts
VariableData  { _id, type, name, value?, default?, required? }
VariableType  'string' | 'boolean' | 'string-list'
VariableValueType  string | boolean | string[]
```

## The id/name indirection

**Shapes reference variables by `_id`; runtime values are keyed by `name`.**

- `VariableElement.variableId`, `IfGroupShape.conditionVariable`,
  `ForGroupShape.itemsVariable` all hold a Mongo `_id`.
- The export payload, the MCP tool argument and the UI all speak names:
  `{ "customerName": "Acme" }`.

`resolveVariable` (`packages/common/src/rendering/variables.ts`) is the bridge:
it looks the definition up by `_id` in `presentation.variableData`, then reads
`ctx.variableValues[variable.name]`. This is why renaming a variable does not
break a template, and why `ResolveContext` carries the whole presentation and
not just the value map.

Never resolve a variable any other way. One definition means the condition of an
`if-group`, the items of a `for-group` and the text of a variable run agree on
what "this variable is empty" means.

## Resolution rules

```
resolveVariable(id, ctx)
  → definition not found            → undefined
  → runtime value is "empty"        → definition.default
  → otherwise                       → runtime value
```

`isEmptyVariableValue` defines *empty*, and the definition matters:

| Value | Empty? |
|---|---|
| `undefined`, `null` | yes |
| `""`, `"   "` (whitespace only) | yes |
| `[]` | yes |
| **`false`** | **no — `false` is a real value** |
| `0`-like anything | n/a, numbers are not a variable type |

The `false` case is the one people get wrong. A boolean variable explicitly set
to `false` must not fall back to its `default`.

## Consumption sites

| Site | Rule |
|---|---|
| `if-group` | `resolveVariable(...) !== true` → children dropped. **Strict identity**, no coercion: `"true"` renders nothing, a non-empty list renders nothing. The editor's picker filters to boolean variables for the same reason. |
| `for-group` | value must be `Array.isArray` and non-empty, otherwise children are dropped. One iteration per item. |
| text run | `stringifyVariableValue`: string as-is, boolean → `"true"`/`"false"`, array → `join(', ')`, absent → `""`. |

Note what a `for-group` does *not* do today: the iteration's item value is not
bound to anything the children can read. Children are duplicated verbatim. If
you add per-item binding, it goes in `expandForGroup` and `ResolveContext`, and
both renderers must learn it together.

## Export-time validation

`ExportService.validateVariables` runs before any rendering: every variable with
`required: true` whose value is empty (by `isEmptyVariableValue`, so `default`
is **not** consulted) throws `ValidationError`. A required variable with only a
`default` still fails — that is intentional.

## Editor display

A variable run inside a text box renders as a bordered chip showing the variable
**name** with a lightning icon (`VariableBlock.tsx`), not its value. The Slate
element is `{ type: 'variable', variableId, children: [{ text: '' }] }` — the
empty child is required by Slate for inline void elements; do not remove it.
`withVariables.ts` marks the element inline and void.

## Lifecycle constraints

Enforced in `packages/backend/src/services/VariableService.ts`:

- **Names are unique per presentation** — `create` and `update` both throw
  `ConflictError('VARIABLE_NAME_EXISTS')`. The uniqueness is what makes the
  name-keyed payload unambiguous.
- **A variable in use cannot be deleted** — `ValidationError('VARIABLE_IN_USE')`.
  The frontend special-cases this code in `VariableSlice.deleteVariable` to show
  "Variable used in the template".
- Every mutation `touchPresentation()`s so `updatedAt` reflects variable edits,
  and returns the **full refreshed list**, which the store swaps into
  `presentation.variableData` wholesale.

### Two known gaps

Both are live traps, not style opinions — check whether they still hold before
relying on them:

1. **`isVariableInUse` only scans top-level text shapes.** It filters
   `shape.type !== 'text'` on `slide.shapes` without recursing into containers,
   and never inspects `conditionVariable` or `itemsVariable`. So a variable used
   only as an `if-group` condition, as a `for-group` source, or inside a text box
   nested in any group, can be deleted with the guard passing.
2. **A dangling reference degrades silently.** `resolveVariable` returns
   `undefined` for an unknown `_id`, so the `if-group` disappears, the
   `for-group` disappears and the text run renders empty — no error anywhere.

## Related

- Skills: `shape-model`, `render-parity`, `api-surfaces`
- Commands: `/export-debug`, `/feature`
- Agents: `export-debugger`, `imprime-reviewer`
