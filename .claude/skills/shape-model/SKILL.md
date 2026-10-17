---
name: shape-model
description: The Imprime shape model — the Shape discriminated union, the group container (layout, box, repeat) and visibleWhen conditions, coordinate spaces, id lifecycle, and how resolveShapes flattens an authored tree into renderable leaves. Use when adding or changing a shape type, working on containers or layout, or reasoning about shape coordinates and ids.
metadata:
  origin: adapted from ECC (github.com/affaan-m/ECC)
---

# Shape Model

Defined in `packages/common/src/types.ts`. Everything downstream — editor,
store, SDK, PDF — is a projection of this union.

```
Shape = RectangleShape | EllipseShape | TextBoxShape | ImageShape | GroupShape
```

All extend `BaseShape`: `id`, `x`, `y`, `width`, `height`, optional `stroke`,
`strokeWidth`, `strokeStyle`, `hidden`, `name`, `visibleWhen`, `grow`,
`rotation`.

`rotation` is degrees, clockwise, about the centre of the box; `x`/`y`/`width`/
`height` stay the **unrotated** box's. A group turns its children with it.
Rotation is drawn only, like CSS `transform`: layout and hug read the
unrotated boxes. All of its geometry is in `common/rendering/rotation.ts`.

`RectangleShape` and `GroupShape` also take `BoxStyle`: `strokeWidths` (one
border width per side, overriding `strokeWidth`) and `cornerRadius` (a number,
or `CornerRadii` per corner). Both are drawn through `getBoxPaths`
(`common/rendering/boxGeometry.ts`): the outline and the per-side border as SVG
path data, corners as cubic Béziers, which the editor puts in `<path>` and the
export in react-pdf's `Path`.

## Ids

`BaseShape.id` is a **client-generated UUID, not a Mongo `_id`**. The editor
assigns it at creation so it can apply optimistic updates and track selection
without a round-trip. Pages and templates use Mongo `_id`; shapes do not.
Do not "fix" this by moving shape ids server-side — the whole shape tree is
persisted as one embedded document on the page.

Ids are unique **within their source tree**, which is why `resolveShapes`
re-forges them when a repeated group is copied: `reidShape` appends
`::rep-<groupId>-<i>` recursively, so the renderer never sees a duplicate key.
A group's box leaves are `<groupId>::fill` and `<groupId>::border`.

## Coordinate spaces

This is the most common source of off-by-a-parent bugs.

- A shape's `x`/`y` are **relative to its parent container**, or to the page
  when it sits at the root.
- `SVGSelectionWrapper` turns a shape with `rotate(r cx cy)` about its box
  centre, and `SVGGroup` renders `<g transform="translate(x y)">` inside it,
  so the browser applies the parent's offset and turn. Nothing in the editor
  stores absolute positions.
- Because a group can be turned, a parent's coordinate space is a `Frame`
  (`{ x, y, rotation }`: SVG's `translate(x y) rotate(rotation)`), not an
  offset. `findShapeById` (`packages/frontend/src/utils/shapeTree.ts`) returns
  `{ shape, parentGroupId, parentFrame }`, accumulated on the way down with
  `getContentFrame`. `shapeToPage(shape, parentFrame)` is the shape as it lies
  on the page; `pointToPage` / `pointFromPage` convert points; a pointer's move
  is turned by `-parentFrame.rotation` before it is applied to `x`/`y`.
- Moving a shape between parents means re-expressing it so it stays where it
  is on the page, turned as it is: `relocateShape(shape, fromFrame, toFrame)`
  (target frame from `findContentFrame`). `moveShape`, `ungroupShape`, the
  drop re-parent, drawing into a group, duplicate and paste all go through it
  or its halves; copy that pattern rather than inventing another.
- `resolveShapes` brings everything to page space, once, at export time:
  `flatten` composes each group's rotation into its leaves (`shapeToPage`).

## Groups, conditions, repeats

`group` is the only container. `isContainerShape(shape)` — defined in
`common/src/types.ts`, re-exported by `packages/frontend/src/utils/shapeTree.ts`
— is still the guard every recursion site uses, so a second container type
would be one change.

| Field | Meaning |
|---|---|
| `layout` | `'none'` (default: children keep their own `x`/`y`), `'horizontal'`, `'vertical'`, or `'stack'` (children over each other; main axis horizontal, so `justify` places across and `align` down) |
| `justify`, `align`, `gap` | the flexbox subset of `groupLayout.ts`; `justify` is along the main axis, `align` across it |
| `padding` | `Sides`, inset of the laid-out children; ignored by `'none'` |
| `hug` | along a row's or column's main axis only, the group's size is its children's + gaps + padding (`hugGroup`); ignored by `'none'`/`'stack'`. A size the parent imposes (`grow`, `stretch`: `getImposedAxes`) wins, and a hugging group ignores its children's `grow`. Resizing it by hand along that axis turns it off |
| child's `grow` | on any shape (`BaseShape`), read by a `'horizontal'`/`'vertical'` parent only: CSS flex-grow with basis 0 — the free main-axis space (inner size − fixed children − gaps) is shared by `grow`, the child's own size on that axis ignored (`growMainSizes`) |
| `fill`, border, `cornerRadius` | the group's own box: background under its children, border over them (as a Figma frame's) |
| `repeat` | `{ variableId?, itemPath? }`: the group is drawn once per item, each copy a **sibling** placed by the parent's layout, or stacked downwards in a free-form parent |

`visibleWhen` (`{ variableId?, itemPath?, negate? }`) is on **every** shape,
not just groups: shown only when the value is exactly `true` (`false` with
`negate`). A shape whose condition fails takes no room in a layout.

A repeat's or condition's `variableId` is unset only when a paste dropped a
reference it could not rebind (`rebindVariables`): the repeat then draws
nothing and the shape never shows — never silently unconditional.

A repeat has no drawing tool: a group becomes one from the group bar's Repeat
control. `shapeKind` reads a repeated group as `'repeat'` for its layers-panel
icon and fallback name.

A **page** carries the same two bindings: `Page.visibleWhen` and
`Page.repeat` (`PageRepeat`: a list variable only, no `itemPath` — a page sits
in no repeat). `resolvePages` copies a repeated page once per item, in place,
checks the page's condition per copy, and resolves each copy's shapes in that
item's scope, so they read `itemPath`s exactly as a repeated group's children
do. Copies get `<pageId>::rep-<i>` ids.

## `resolveShapes`

`packages/common/src/rendering/shapeResolver.ts`. Flattens an authored tree into
absolute-positioned leaves. Called **only** by `ExportService` (see skill
`render-parity` for why).

Three passes — data, layout, page space:

```
instantiate(siblings):            ← per list of siblings, before any layout
  hidden                → drop
  group with repeat     → one copy per item (reid, scope frame pushed);
                          each copy kept only if its visibleWhen holds in its
                          own scope; free-form parent: copy i shifted down by i × height
  visibleWhen fails     → drop
  (free-form parent: the copies go in a hugging column at the group's place)
  text / image          → bake every variable run into text, and an image
                          box's value into `resolvedImage` (item scope still live)
layoutTree(tree)          ← measure bottom-up (hugGroup), then place top-down
                            (layoutGroupChildren); the editor's write path
                            runs the same function on the authored tree
flatten(tree)             ← page space: background? · children · border?
```

`resolvePages` runs this per page copy — the template's page-number box
(`Template.pageNumbering.box`, id `PAGE_NUMBER_SHAPE_ID`) appended at the root
where `showsPageNumber` puts it — then writes the page numbers
(`PageNumberElement`) once the PDF's pages are counted: what leaves it is
literal text only.

In the editor the box is a shape of every page that shows it, last at the
root (`utils/pageNumbering.ts`): `_writePageShapes` takes it back out before
saving — a box changed becomes the template's, on every page; a box missing
from a page is that page's `hidePageNumber`. It cannot be copied, duplicated
or moved into a group, and no stored page shape may take its id
(`RESERVED_SHAPE_ID`).

Subtleties worth preserving:

- **A group with an active layout recomputes child positions** instead of
  trusting the persisted `x`/`y`, and it lays out the *instances* — copies
  in, failed conditions out — so dynamic data reflows its siblings.
- **A copy's condition is checked against its own item**, which is how a
  repeated row filters itself (`visibleWhen: { itemPath: 'inStock' }`).
- **Measure-then-place is exact in one pass** only because nothing the
  placement does changes a size a hug counted: a hugging group ignores its
  children's `grow`, `stretch` acts across its axis, and no text is measured.
  A rule that breaks that (text measurement, cross-axis hug) needs real
  iteration.
- **Only the main axis hugs.** A row cannot take the height of its tallest
  child; a column of copies inside a fixed-height row overflows it.
- The editor persists what `layoutTree` computes, so a growing child's main
  size is overwritten on every write — resizing it by hand along that axis
  does not stick.

## Adding a shape type

Use `/new-shape`, which walks this list. Every site is reachable by following
compile errors after you extend the union — which is the point of the union.

1. `packages/common/src/types.ts` — the interface, and add it to `Shape`. If it
   is a container, extend `ContainerShape` **and** `isContainerShape`.
2. `packages/common/src/rendering/` — any geometry both renderers need; a new
   `expand*` branch in `resolveShapes` for a container.
3. `packages/backend/src/services/ExportService.ts` — a `render*` method and a
   `renderShape` case. Containers need no case (they never arrive).
4. `packages/frontend/src/components/page/svg/` — the component, plus the
   `SVGShape` switch.
5. `packages/frontend/src/store/editor/` — `ToolSlice` (the tool, and
   `drawnShape`: drawing → shape), `selectors.ts` (`contextBarFor`).
6. `packages/frontend/src/components/page/PageCanvas.tsx` — the drawing-tool
   list in `handleMouseDown`, if it is drawn by dragging.
7. Context toolbar under `.../TopBar/Context-toolbar/` + its `index.tsx` switch.
8. `packages/frontend/src/utils/shapeTree.ts` — `shapeDisplayName`,
   `nextShapeName`; the shape-tree panel icon in `ShapeRow/shapeIcon.tsx`.
9. `packages/sdk/src/ImprimeClient.ts` — an `addX` helper if it makes sense for
   API users.
10. `packages/backend/src/mcp/schemas.ts` — the shape's zod mirror in
    `shapeSchemas` (the compiler flags the missing key) and in the
    `discriminatedUnion` list (it does not), so agents can draw it.
11. No schema migration: `packages/backend/src/models/Page.ts` stores `shapes`
    as `Schema.Types.Mixed`, because Mongoose cannot validate the discriminated
    union. The flip side is that **nothing validates shape payloads at the
    database boundary** — over REST, a malformed shape is persisted happily and
    only blows up at render time. The MCP tools parse every shape against
    `mcp/schemas.ts` first.

## Related

- Skills: `render-parity`, `variable-system`, `editor-store`
- Commands: `/new-shape`, `/parity`
- Agents: `imprime-architect`, `render-parity-auditor`
