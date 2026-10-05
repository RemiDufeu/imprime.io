---
name: editor-store
description: Conventions of the Imprime editor's Zustand store — slice composition and cross-slice typing, selectors and derived state, the single shape-write path with undo recording and serialised saves, the text editing session, persistence scope, and the immutable shape-tree helpers. Use when adding or changing editor state, wiring a component to the store, or touching packages/frontend/src/utils/shapeTree.ts.
metadata:
  origin: adapted from ECC (github.com/affaan-m/ECC)
---

# Editor Store

One Zustand store, assembled from fourteen slices in
`packages/frontend/src/store/editor/EditorStore.tsx`, wrapped in
`subscribeWithSelector(persist(...))`. **`partialize` persists only
`zoom`, `pagesPanelOpen`, `layersPanelOpen`** — document data is never written
to localStorage. Adding a field to `partialize` means that field survives a
reload on a different template; almost always wrong.

## Slice decomposition

The store is cut by **concern, not by data shape**. There is one `template`
object in state, but many slices act on it, each owning a distinct *kind of
operation*. That is the organising idea worth preserving.

| Slice | Owns | Deliberately does not own |
|---|---|---|
| `TemplateSlice` | the loaded template, loading it (and resetting what pointed into the last one), its title, `isLoading`, `error` | pages, shapes |
| `PageSlice` | the page on screen, and the pages as a set: add, delete, reorder | what a page holds |
| `DocumentWriteSlice` | **the shape write path**: `updatePageShapes`, `_editPage`, `_writePageShapes`, the per-page save queue | what a mutation computes |
| `SelectionSlice` | `selectedShapeId`, `selectShape` | what the selected shape is (a selector) |
| `ShapeSlice` | edits of shapes: update, nudge, delete, duplicate, move, ungroup, z-order | selection, clipboard, persistence |
| `ClipboardSlice` | copy, cut, paste, and rebinding a paste's variables | the system clipboard (the shortcuts hook marks it) |
| `ToolSlice` | the active tool, the style new shapes are drawn with (`drawStyle`), the drag that draws one | editing an existing shape |
| `TransformationSlice` | the drag and resize gestures, including re-parenting on drop | z-order, creation |
| `TextEditorSlice` | the text editing session (begin, end, commit), the selection's `textFormat`, the formatting commands | the text content itself (that is shape data) |
| `HistorySlice` | the undo/redo stacks and their replay: shape trees, page existence and order, title, variables; routing undo to the text being edited first | performing the change — each kind replays through its owner's `_` action |
| `ImportSlice` | shapes made from outside content: an image file (picked or pasted), pasted text | drawing |
| `VariableSlice` | variable CRUD against the API, the variables panel and form | how variables render |
| `FontSlice` | the imported fonts the editor has loaded, and the catalog runs resolve against | registering built-in fonts (`fonts.ts`) |
| `PreferencesSlice` | zoom and panel open/closed — the only persisted state | anything document-related |

Splits worth noticing because they are not obvious:

- **`ShapeSlice` vs `DocumentWriteSlice`.** Every shape mutation computes a new
  tree, then hands it to the write path. Reflow, undo recording, optimistic
  update and saving live in *one* place instead of being repeated in every
  action. This is the funnel that makes the rest of the decomposition safe.
- **`SelectionSlice` stores an id.** The selected shape is
  `selectSelectedShape(state)`, read from the tree; the context bar is
  `selectContextBar(state)`, derived from the tool and that shape. Neither is
  stored, so neither can describe the document as it was before an edit. The
  selector returns the tree's own object, so a subscriber re-renders only when
  that shape changes.
- **`ToolSlice` holds the drawing style, not the selected shape's.** The shape
  bar shows the selected shape's own fields and writes them with
  `updateShape`; with a drawing tool active and nothing selected, it shows and
  writes `drawStyle`. `DrawStyle` uses the shape's field names (`fill`,
  `stroke`, …) so the same patch fits either.
- **`ToolSlice` vs `TransformationSlice`.** Both are pointer gestures, but
  drawing produces a shape and transformation mutates one. Merging them would
  put `DrawingData` and `DragState` in the same slice, and the drag state is
  already a discriminated union (`resize` | `translate`) for the same reason —
  so re-parenting fields cannot leak onto the resize path.

### When to add a slice

Add one when the state has **its own lifecycle** and would otherwise sit in a
slice that never reads it. Extend an existing slice when the new action operates
on state it already owns.

A slice past roughly 250 lines, or whose name needs "and" to describe it, is two
slices.

## Slice conventions

A slice is a `StateCreator` whose **first type parameter lists every slice it
reads**, and whose fourth is what it contributes:

```ts
export const createShapeSlice: StateCreator<
  ShapeSlice & TemplateSlice & PageSlice
    & DocumentWriteSlice & SelectionSlice,   // what it may get()
  [], [],
  ShapeSlice                                  // what it provides
> = (_, get) => { ... }
```

Keep that list honest: it is the only record of the coupling between slices, and
the only thing that makes a cross-slice call typecheck — `selectCurrentPage(get())`
does not compile in a slice that does not declare `PageSlice`. The references
are mutual by design (`PageSlice` clears the selection, `ShapeSlice` writes
through `DocumentWriteSlice`) — what keeps that manageable is the single write
funnel, not an acyclic graph.

### Two slice shapes

**Object literal** when actions are independent:

```ts
export const createPreferencesSlice: StateCreator<...> = (set, get) => ({ ... })
```

**Closure body returning an object** when the slice needs private state or a
shared helper — this is the pattern to reach for rather than exporting a helper
nobody else uses:

```ts
export const createShapeSlice: StateCreator<...> = (_, get) => {
    const reorder = (id, target) => { /* shared by the four z-order actions */ }
    return { ..., bringToFront: id => reorder(id, (_i, n) => n - 1), ... }
}
```

`ToolSlice` holds a `rafId` the same way, and `DocumentWriteSlice` its save
queue — state that belongs to the slice but not to the store.

### Other conventions

- **Constants and pure helpers live with their slice** and are exported from it:
  `MIN_ZOOM`/`MAX_ZOOM`/`ZOOM_LEVELS` (`PreferencesSlice`), `COPY_OFFSET` and
  `copyName` (`ShapeSlice`), `DrawStyle` (`ToolSlice`). A consumer importing the
  constant does not also subscribe. Pure tree helpers two slices need go to
  `utils/shapeTree.ts` (`insertNear`, shared by duplicate and paste).
- **Derived state is a selector, not a field.** If a value can be computed from
  the store, compute it in `selectors.ts`; a stored copy needs every writer to
  keep it in step, and one always forgets.
- **Setters accept a value or an updater** where a caller may need the previous
  value: `setZoom(z => z + 0.25)`, `setLayersPanelOpen(o => !o)`. Resolve it
  inside the slice with `get()`, and clamp there too — `setZoom` applies
  `MIN_ZOOM`/`MAX_ZOOM` so no caller has to.
- **Actions guard and return early** on `template` / `currentPage` rather
  than throwing — components may render before load.
- **Async actions set `error` (a string)** rather than propagating, so a render
  never sees a rejected promise. `VariableSlice` is the deliberate exception: it
  rejects on create and update so a form can react, and surfaces an antd
  `message` for the `VARIABLE_IN_USE` code.
- **Private members are prefixed `_`** and still live on the store, because
  other slices call them through `get()` — `_editPage`, `_insertPage`.
- **Slices are `.tsx`** even without JSX. Consistent, if odd; match it.

## Components read the store directly

Sub-components subscribe with `useEditorStore(state => state.thing)`, one
selector per value. **Do not bundle handlers into props and drill them down** —
a component that needs `updateShape` reads `updateShape`. This keeps prop
signatures about *data identity* (`shape`, `readonly`) and lets subscriptions
stay narrow. `SVGText.tsx` is the reference: one subscription per value, two
props.

Derived reads go through `selectors.ts`. Each selector is typed against the
minimal state it reads, so it works in both positions:

```ts
useEditorStore(selectCurrentPage)   // React subscription
selectCurrentPage(get())            // inside a slice action
```

`selectSelectedShape`, `selectContextBar`, `selectCanUndo` and `selectCanRedo`
follow the same shape.

## The single shape write path

Every shape mutation ends in `DocumentWriteSlice.updatePageShapes(pageId,
shapes, hint?)` — almost always through `_editPage(transform, options?)`,
which reads the page (the one on screen unless `options.pageId` says
otherwise), applies a pure `transform` that returns the new tree or null to do
nothing, and writes. `updatePageShapes` does four things in order:

1. **reflow** — `reflowGroups(shapes)` re-applies `layoutGroupChildren` to every
   auto-layout group in the tree, so downstream consumers (rendering,
   hit-testing, selection) read final positions, not pre-layout ones;
2. **record** — `_recordHistory` pushes the previous tree onto the undo stack
   and clears redo. `hint.mergeKey` folds writes closer than 500 ms into one
   step (`updateShape` keys on shape id + updated fields, so a dragged colour
   or a held arrow key undoes at once); `hint.selection` is the shape undo
   selects again;
3. **set** — optimistic local update of the template;
4. **save** — fire-and-forget `_savePage`. Saves of one page go out **one at
   a time**: the server reads, replaces and writes a page with no concurrency
   check, so two in flight can land in either order and keep the older tree.
   While one is out, later writes only replace the tree waiting to go next. A
   failed save retries twice (1s, 2s) unless a newer tree is waiting, then sets
   `error`.

Steps 3–4 are `_writePageShapes`, the path undo and redo replay through so a
replay records nothing.

The other document changes follow the same split: the public action does the
change through a `_` half and then records what it replaced — `addPage` /
`deletePage` through `_insertPage` / `_removePage`, `reorderPages` through
`_applyPageOrder`, the title through `_saveTitle`, variables through
`_restoreVariable`. A history entry stores the state to restore (a page
snapshot or null, an id order, a title, a variable or null); replaying it
returns the entry for the state it replaced. A deleted page or variable comes
back **under its id** (the API accepts `_id` on create), so steps above it and
text runs still point to it. Steps that reach the API run one at a time, and a
failed one goes back on its stack.

A replayed step the server refuses (4xx) is dropped, since it would be refused
again and block every step under it; a network or 5xx failure keeps it.

`updateShape` writes to the page that holds the shape, not only the one on
screen. A shape found nowhere is a no-op. `loadTemplate` resets everything
that pointed into the previous template (page index, selection, variable
form) after ending the text session; the clipboard stays, and a paste rebinds
its variable references by id, then name and type (`rebindVariables` in
common).

None of these write the server's copy of the template back into the store:
it would overwrite shape edits whose save is still in flight. Write the one
field that changed, read from `get()` after the `await`.

Consequences: the UI never awaits a save, and a shape action must not call the
API directly. If you find yourself reaching for `templatesAPI.updatePage`
inside a shape action, route it through `_editPage` instead — a write that
bypasses it is also a write undo cannot see.

## The text editing session

Text is the one edit that is not a shape write while it happens. Each `SVGText`
owns a Slate editor; the store holds the **active** one as a session
(`TextEditorSlice`):

- `beginTextSession(shapeId, editor)` — when a text box is selected, clicked or
  focused. It ends any other session first, loads the document's current text
  into the editor (an undo may have replaced it while the editor sat idle),
  clears the editor's history, and remembers the content it started from.
- `endTextSession()` — called by `selectShape`, `selectPage`, page insertion
  and removal, and `loadTemplate`, **before** they change anything. It
  commits the typing as one `updateShape`, only if the content moved away from
  where the session began. Synchronous and in the store, so the commit lands on
  the box's own page before the switch, with no effect-ordering involved.
- While a session is open, Ctrl+Z walks the box's own Slate history;
  `undo()` falls through to the canvas stack once that is empty, and `redo()`
  is held back while there is uncommitted typing.

The text bar reads `textFormat`, refreshed from the selection on every editor
change (`syncFromEditor`), and writes through `applyTextFormat(patch)` — a
command applied to the editor's selection. There is no state the editor is
made to follow: a two-way sync once wrote default marks back into text the
user had only selected, and the resulting phantom undo steps blocked redo.

`SVGText` itself only begins the session, puts the focus in the editable, keeps
an idle editor's content in step with the document (`replaceEditorContent`),
and ends the session if it unmounts while active.

## Shape-tree helpers

`packages/frontend/src/utils/shapeTree.ts` — every helper is **pure and
immutable**, rebuilding only the branches it touches:

```
findShapeById → { shape, parentGroupId, absX, absY }
updateShapeById / deleteShapeById / extractShapeById
insertShape / insertShapeAt / insertNear
getSiblingList / replaceSiblingList
cloneShapeWithNewIds   isDescendantOf
shapeDisplayName / nextShapeName   findInnermostGroupAt
```

Rules that matter:

- Never mutate a shape in place. `{ ...shape, x }`, always. Zustand compares by
  reference; an in-place mutation renders nothing and saves the wrong thing.
- `isContainerShape` is re-exported from here so tree code imports the guard
  from one place. Use it instead of `'children' in shape`.
- `moveShape` must reject a move into the shape's own subtree
  (`isDescendantOf`), and must re-express coordinates against the new parent.
- **Do not introduce a flat `id → location` index over the shape tree.** It has
  been tried and rolled back; the recursive walk is fast enough at real document
  sizes and an index adds an invalidation surface on every tree mutation.

## Related

- Skills: `frontend-stack`, `frontend-structure`, `shape-model`, `render-parity`
- Commands: `/feature`, `/new-shape`, `/review`
- Agents: `imprime-reviewer`, `imprime-explorer`
