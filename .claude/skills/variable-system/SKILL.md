---
name: variable-system
description: How Imprime variables work — the three variable types, the id-versus-name indirection, resolution and default-fallback rules, required-variable validation at export, and the lifecycle constraints (unique names, in-use deletion guard). Use when touching variables, visibleWhen conditions, group repeats, text variable runs, or the export payload contract.
metadata:
  origin: adapted from ECC (github.com/affaan-m/ECC)
---

# Variable System

A variable is what turns a document into a template. Definitions live on the
template; values arrive at export time.

```ts
VariableData  { _id, type, name, default?, required?, maxLength?, maxItems?, itemFields? }
VariableType  'string' | 'boolean' | 'image' | 'object-list'
VariableValueType  string | boolean | VariableItem[]
```

An `image` value is a PNG or JPEG **data URL** — a string. Its `default` is one
too, stored on the definition and checked when saved (`INVALID_VARIABLE_DEFAULT`).
Every image value an export receives, list items included, is checked before
rendering (`ExportService.validateVariables` → `INVALID_IMAGE_VALUE`, naming
`albums[0].photos[1].file`). An image box binds through `imageVariable` +
`itemPath`; `resolveShapes` writes what it resolves to into `resolvedImage`.

## The id/name indirection

**Shapes reference variables by `_id`; runtime values are keyed by `name`.**

- `VariableElement.variableId`, `visibleWhen.variableId` (any shape),
  `GroupShape.repeat.variableId` and `ImageShape.imageVariable` all hold a
  Mongo `_id`.
- The export payload, the MCP tool argument and the UI all speak names:
  `{ "customerName": "Acme" }`.

`resolveVariable` (`packages/common/src/rendering/variables.ts`) is the bridge:
it looks the definition up by `_id` in `template.variableData`, then reads
`ctx.variableValues[variable.name]`. This is why renaming a variable does not
break a template, and why `ResolveContext` carries the whole template and
not just the value map.

Never resolve a variable any other way. One definition means a shape's
condition, a group's repeat and the text of a variable run agree on what "this
variable is empty" means.

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
| `visibleWhen` | `isConditionMet`: shown only when the value is exactly `true`, or exactly `false` with `negate`. **Strict identity**, no coercion: `"true"` shows nothing, a non-empty list shows nothing, and a missing value hides the shape *both ways* — a boolean that may be absent needs a `default`. The editor's picker filters to boolean variables for the same reason. |
| `repeat` | value must be `Array.isArray`; one copy of the group per item, none for an empty list. Each copy pushes a `VariableScopeFrame` its subtree (and its own `visibleWhen`) reads `itemPath`s from. |
| page `visibleWhen` / `repeat` | the same rules, one level up (`resolvePages`): a repeated page is exported once per item of a list variable (never an item field — a page sits in no repeat), its shapes resolved in that item's frame; its condition is checked copy by copy. No page left fails the export with `NO_PAGE_TO_EXPORT`. |
| text run | `stringifyVariableValue`: string as-is, boolean → `"true"`/`"false"`, array → `join(', ')`, absent → `""`. |


## Export-time validation

`ExportService.validateVariables` runs before any rendering: every variable with
`required: true` whose value is empty (by `isEmptyVariableValue`, so `default`
is **not** consulted) throws `ValidationError('REQUIRED_VARIABLE_MISSING')`. A required variable with only a
`default` still fails — that is intentional.

A `string` variable's `maxLength` is checked in the same pass: a value with
more characters fails with `VARIABLE_TOO_LONG`. `exceedsMaxLength` is the one
definition — it counts code points (`countCharacters`: an emoji is one, not
two UTF-16 units), skips an empty value (the default stands in for it) and
reads the limit through `getVariableMaxLength`, which ignores it on any other
type. `VariableService` refuses a limit that is not a positive integer
(`INVALID_VARIABLE_MAX_LENGTH`) and a default longer than it
(`INVALID_VARIABLE_DEFAULT`). The editor's inputs count the same way
(`utils/maxLengthCount.ts`, antd's `count.strategy`) — not antd's `maxLength`,
which counts UTF-16 units.

An `object-list` variable's `maxItems` is the same thing for a list's length:
`exceedsMaxItems` (through `getVariableMaxItems`, which ignores it on any other
type) fails the export with `VARIABLE_TOO_MANY_ITEMS`; `VariableService`
refuses a limit that is not a positive integer (`INVALID_VARIABLE_MAX_ITEMS`)
and a default with more items (`INVALID_VARIABLE_DEFAULT`). The editor's list
input stops adding and duplicating items at the limit.

A list's item fields take `required`, (string ones) `maxLength` and (list ones)
`maxItems` too. `findItemFieldIssue` (common `variables.ts`) is the one walk
over a list's items that checks them, nested lists included, and names the
first value that breaks its field as the caller wrote it
(`albums[0].tracks[2].title`, `albums[0].tracks`). Three callers: the export
(`REQUIRED_VARIABLE_MISSING` / `VARIABLE_TOO_LONG` / `VARIABLE_TOO_MANY_ITEMS`),
`VariableService` on a list's default (`INVALID_VARIABLE_DEFAULT` — an item
field has no default of its own, so the list's must already comply), and the
editor's list inputs (`utils/listValueRule.ts`, which checks the list's own
`maxItems` first).

## Editor display

A variable run inside a text box renders as a bordered chip showing the variable
**name** with a lightning icon (`VariableBlock.tsx`), not its value. The Slate
element is `{ type: 'variable', variableId, children: [{ text: '' }] }` — the
empty child is required by Slate for inline void elements; do not remove it.
`withVariables.ts` marks the element inline and void.

## Lifecycle constraints

Enforced in `packages/backend/src/services/VariableService.ts`:

- **Names are unique per template**, enforced twice: `create` and `update`
  check first and throw `ConflictError('VARIABLE_NAME_EXISTS')`, and a unique
  index on `{ templateId, name }` catches the race between two concurrent
  writers, mapped back to the same error. The uniqueness is what makes the
  name-keyed payload unambiguous.
- **A variable has no stored value.** `default` is the only value on the
  definition; runtime values arrive per export and never persist.
- **A variable in use cannot be deleted** — `ValidationError('VARIABLE_IN_USE')`.
  "In use" is any reference, anywhere in any page's tree (see References).
  The frontend special-cases this code in `VariableSlice.deleteVariable` to show
  "Variable used in the template".
- Every mutation calls `touchTemplate()` so `updatedAt` reflects variable edits,
  and returns the **full refreshed list**, which the store swaps into
  `template.variableData` wholesale.

### References

A tree points at a variable in four places: a text run, an image box's
`imageVariable`, any shape's `visibleWhen`, a group's `repeat`.
`collectVariableIds` and
`rebindVariables` (common `variableReferences.ts`) are the only walks over them —
the in-use guard reads the first, the editor's paste the second. A fifth kind
of reference is added there, once.

A page points at variables too, through its own `visibleWhen` and `repeat`
(`collectPageVariableIds`, which the in-use guard reads). Pages are not pasted,
so `rebindVariables` does not cover them.

### Known gap

Check it still holds before relying on it:

**A dangling reference degrades silently at export.** `resolveVariable`
returns `undefined` for an unknown `_id`, so a conditional shape disappears, a
repeat draws nothing and a text run renders empty — no error anywhere. The
server rejects unknown ids whenever a page is created or its shapes saved
(`PageService.assertVariableReferences`: text runs, `imageVariable`,
`visibleWhen`, `repeat`), and the in-use guard stops a referenced variable
being deleted — so the remaining way in is data written around the API.

## Related

- Skills: `shape-model`, `render-parity`, `api-surfaces`
- Commands: `/export-debug`, `/feature`
- Agents: `export-debugger`, `imprime-reviewer`
