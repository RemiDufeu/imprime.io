---
name: editor-store
description: Conventions of the Imprime editor's Zustand store — slice composition and cross-slice typing, selectors, the single shape-write path with optimistic update and retry, persistence scope, and the immutable shape-tree helpers. Use when adding or changing editor state, wiring a component to the store, or touching packages/frontend/src/utils/shapeTree.ts.
metadata:
  origin: adapted from ECC (github.com/affaan-m/ECC)
---

# Editor Store

One Zustand store, assembled from eleven slices in
`packages/frontend/src/store/editor/EditorStore.tsx`, wrapped in
`subscribeWithSelector(persist(...))`. **`partialize` persists only
`zoom`, `slidesPanelOpen`, `layersPanelOpen`** — document data is never written
to localStorage. Adding a field to `partialize` means that field survives a
reload on a different presentation; almost always wrong.

## Slice decomposition

The store is cut by **concern, not by data shape**. There is one `presentation`
object in state, but eleven slices act on it, each owning a distinct *kind of
operation*. That is the organising idea worth preserving.

| Slice | Owns | Deliberately does not own |
|---|---|---|
| `PresentationSlice` | the loaded presentation, load/title/slide-reorder, `isLoading`, `error` | anything about a single slide's shapes |
| `SlideSlice` | current slide index, add/delete slide, **the shape write path** (`updateSlideShapes`, `_saveSlide`) | what a shape mutation actually computes |
| `ShapeSlice` | selection and structural edits: update, nudge, delete, duplicate, move, copy/cut/paste, ungroup | persistence — it calls `updateSlideShapes` |
| `HistorySlice` | the undo/redo stacks and their replay: shape trees, slide existence and order, title, variables; routing undo to the text being edited first | performing the change — each kind replays through its owner's `_` action |
| `ShapeCreationSlice` | the drag-to-draw gesture → a new shape | editing an existing shape, content from outside |
| `ImportSlice` | shapes made from outside content: an image file (picked or pasted), pasted text | drawing |
| `TransformationSlice` | the drag and resize gestures, including re-parenting on drop | z-order, creation |
| `LayeringSlice` | z-order within one sibling list | anything cross-parent |
| `ToolSlice` | which tool is active, and the resulting `contextBarType` | the attribute values the toolbar shows |
| `ToolAttributesSlice` | the attribute panel's values, and mapping a selected shape into them | applying them to a shape |
| `RichTextEditorSlice` | the *active* Slate editor, its last selection, and the two-way mark sync | the text content itself (that is shape data) |
| `VariableSlice` | variable CRUD against the API | how variables render |
| `PreferencesSlice` | zoom and panel open/closed — the only persisted state | anything document-related |

Three splits are worth noticing because they are not obvious:

- **`ShapeSlice` vs `SlideSlice`.** Every shape mutation computes a new tree,
  then hands it to `SlideSlice.updateSlideShapes`. Reflow, optimistic update and
  retry live in *one* place instead of being repeated in eleven actions. This is
  the funnel that makes the rest of the decomposition safe.
- **`ToolSlice` vs `ToolAttributesSlice`.** "Which tool" and "what settings does
  it carry" change for different reasons and are read by different components.
  Keeping them apart is why selecting a shape can refresh the attribute panel
  without touching the tool.
- **`ShapeCreationSlice` vs `TransformationSlice`.** Both are pointer gestures,
  but creation produces a shape and transformation mutates one. Merging them
  would put `DrawingData` and `DragState` in the same slice, and the drag state
  is already a discriminated union (`resize` | `translate`) for the same reason
  — so re-parenting fields cannot leak onto the resize path.

### When to add a slice

Add one when the state has **its own lifecycle** and would otherwise sit in a
slice that never reads it. Extend an existing slice when the new action operates
on state it already owns.

A slice past roughly 250 lines, or whose name needs "and" to describe it, is two
slices — `ShapeCreationSlice` at 283 lines is the current outlier, and it is
watchable rather than exemplary.

## Slice conventions

A slice is a `StateCreator` whose **first type parameter lists every slice it
reads**, and whose fourth is what it contributes:

```ts
export const createShapeSlice: StateCreator<
  ShapeSlice & SlideSlice & PresentationSlice & ToolSlice
    & ToolAttributesSlice & RichTextEditorSlice,   // what it may get()
  [], [],
  ShapeSlice                                        // what it provides
> = (set, get) => ({ ... })
```

Keep that list honest: it is the only record of the coupling between slices, and
the only thing that makes a cross-slice call typecheck. The references are
mutual by design (`SlideSlice` clears `selectedShape`, `ShapeSlice` writes
through `SlideSlice`) — what keeps that manageable is the single write funnel,
not an acyclic graph.

### Two slice shapes

**Object literal** when actions are independent:

```ts
export const createPreferencesSlice: StateCreator<...> = (set, get) => ({ ... })
```

**Closure body returning an object** when the slice needs private state or a
shared helper — this is the pattern to reach for rather than exporting a helper
nobody else uses:

```ts
export const createLayeringSlice: StateCreator<...> = (_, get) => {
    const reorderShape = (id, canReorder, reorder) => { /* shared by all four */ }
    return { bringToFront: ..., sendToBack: ..., bringForward: ..., sendBackward: ... }
}
```

`ShapeCreationSlice` uses the same shape to hold a `rafId` across calls — state
that belongs to the slice but not to the store.

### Other conventions

- **Constants and pure helpers live with their slice** and are exported from it:
  `MIN_ZOOM`/`MAX_ZOOM`/`ZOOM_LEVELS` (`PreferencesSlice`), `DEFAULT_STYLE` and
  `shapeToAttributesHelper` (`ToolAttributeSlice`), `contextBarForShapeType`
  (`ToolSlice`). A consumer importing the constant does not also subscribe.
- **Setters accept a value or an updater** where a caller may need the previous
  value: `setZoom(z => z + 0.25)`, `setLayersPanelOpen(o => !o)`. Resolve it
  inside the slice with `get()`, and clamp there too — `setZoom` applies
  `MIN_ZOOM`/`MAX_ZOOM` so no caller has to.
- **Actions guard and return early** on `presentation` / `currentSlide` rather
  than throwing — components may render before load.
- **Async actions set `error` (a string)** rather than propagating, so a render
  never sees a rejected promise. `VariableSlice` is the deliberate exception: it
  rethrows on create so a form can react, and surfaces an antd `message` for the
  `VARIABLE_IN_USE` code.
- **Private members are prefixed `_`** and still live on the store, because
  retries need `get()` — `_saveSlide`.
- **Slices are `.tsx`** even without JSX. Consistent, if odd; match it.

## Components read the store directly

Sub-components subscribe with `useEditorStore(state => state.thing)`, one
selector per value. **Do not bundle handlers into props and drill them down** —
a component that needs `updateShape` reads `updateShape`. This keeps prop
signatures about *data identity* (`shape`, `readonly`) and lets subscriptions
stay narrow. `SVGText.tsx` is the reference: eight separate subscriptions, three
props.

Derived reads go through `selectors.ts`. `selectCurrentSlide` is typed against a
minimal `CurrentSlideState` precisely so it works in both positions:

```ts
useEditorStore(selectCurrentSlide)   // React subscription
selectCurrentSlide(get())            // inside a slice action
```

Slice actions cannot call hooks, so without that shape each action would
re-derive `presentation.slides[currentSlideIndex]` on its own.

## The single shape write path

Every shape mutation ends in `SlideSlice.updateSlideShapes(slideId, shapes, hint?)`,
which does four things in order:

1. **reflow** — `reflowGroups(shapes)` re-applies `layoutGroupChildren` to every
   auto-layout group in the tree, so downstream consumers (rendering,
   hit-testing, selection) read final positions, not pre-layout ones;
2. **record** — `_recordHistory` pushes the previous tree onto the undo stack
   and clears redo. `hint.mergeKey` folds writes closer than 500 ms into one
   step (`updateShape` keys on shape id + updated fields, so a dragged colour
   or a held arrow key undoes at once); `hint.selection` is the shape undo
   selects again;
3. **set** — optimistic local update of the presentation;
4. **save** — fire-and-forget `_saveSlide`, which retries twice with exponential
   backoff (1s, 2s) and then sets `error`.

Steps 3–4 are `_writeSlideShapes`, the path undo and redo replay through so a
replay records nothing.

The other document changes follow the same split: the public action does the
change through a `_` half and then records what it replaced — `addSlide` /
`deleteSlide` through `_insertSlide` / `_removeSlide`, `reorderSlides` through
`_applySlideOrder`, the title through `_saveTitle`, variables through
`_restoreVariable`. A history entry stores the state to restore (a slide
snapshot or null, an id order, a title, a variable or null); replaying it
returns the entry for the state it replaced. A deleted slide or variable comes
back **under its id** (the API accepts `_id` on create), so steps above it and
text runs still point to it. Steps that reach the API run one at a time, and a
failed one goes back on its stack.

None of these write the server's copy of the presentation back into the store:
it would overwrite shape edits whose save is still in flight. Write the one
field that changed, read from `get()` after the `await`.

Consequences: the UI never awaits a save, and a shape action must not call the
API directly. If you find yourself reaching for `presentationsAPI.updateSlide`
inside a shape action, route it through `updateSlideShapes` instead — a write
that bypasses it is also a write undo cannot see.

Text is the one edit that is not a shape write while it happens: a text box
commits its paragraphs once, when its editor is let go (`SVGText`), and only if
they changed. Until then Ctrl+Z walks the box's own Slate history; `undo()` falls
through to the canvas stack once that is empty. When an undo replaces the text
of a box from outside, `SVGText` reloads it into Slate, which reads its value on
mount only.

## Shape-tree helpers

`packages/frontend/src/utils/shapeTree.ts` — every helper is **pure and
immutable**, rebuilding only the branches it touches:

```
findShapeById → { shape, parentGroupId, absX, absY }
updateShapeById / deleteShapeById / extractShapeById
insertShape / insertShapeAt
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
