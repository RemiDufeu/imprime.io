---
name: shape-model
description: The Imprime shape model — the Shape discriminated union, container types (group/if-group/for-group), coordinate spaces, id lifecycle, and how resolveShapes flattens an authored tree into renderable leaves. Use when adding or changing a shape type, working on containers or layout, or reasoning about shape coordinates and ids.
metadata:
  origin: adapted from ECC (github.com/affaan-m/ECC)
---

# Shape Model

Defined in `packages/common/src/types.ts`. Everything downstream — editor,
store, SDK, PDF — is a projection of this union.

```
Shape = RectangleShape | EllipseShape | TextBoxShape | ImageShape
      | GroupShape | IfGroupShape | ForGroupShape
```

All extend `BaseShape`: `id`, `x`, `y`, `width`, `height`, optional `stroke`,
`strokeWidth`, `strokeStyle`, `hidden`, `name`.

## Ids

`BaseShape.id` is a **client-generated UUID, not a Mongo `_id`**. The editor
assigns it at creation so it can apply optimistic updates and track selection
without a round-trip. Slides and presentations use Mongo `_id`; shapes do not.
Do not "fix" this by moving shape ids server-side — the whole shape tree is
persisted as one embedded document on the slide.

Ids are unique **within their source tree**, which is why `resolveShapes`
re-forges them when a `for-group` duplicates children: `reidShape` appends
`::for-<groupId>-<i>` recursively, so the renderer never sees a duplicate key.

## Coordinate spaces

This is the most common source of off-by-a-parent bugs.

- A shape's `x`/`y` are **relative to its parent container**, or to the slide
  when it sits at the root.
- `SVGGroup` renders `<g transform="translate(x y)">`, so the browser applies
  the parent offset. Nothing in the editor stores absolute positions.
- `findShapeById` (`packages/frontend/src/utils/shapeTree.ts`) returns
  `{ shape, parentGroupId, absX, absY }` — the accumulated absolute position,
  computed on the way down. Use it whenever you need slide-space coordinates.
- Moving a shape between parents means re-expressing its position:
  `newX = sourceLoc.absX - targetParentAbs.absX`. `ShapeSlice.moveShape` and
  `ungroupShape` both do this; copy that pattern rather than inventing another.
- `resolveShapes` translates everything to slide space, once, at export time.

## Containers

`isContainerShape(shape)` — a single type guard, defined in `common/src/types.ts`,
re-exported by `packages/frontend/src/utils/shapeTree.ts` "so tree helpers and
their callers import the guard from one place". Never write
`type === 'group' || type === 'if-group' || ...` at a new site; it will be
incomplete the day a fourth container lands.

| Type | Children appear when | Extra fields |
|---|---|---|
| `group` | always | `layout`, `justify`, `align`, `gap` |
| `if-group` | the condition variable is **strictly `true`** | `conditionVariable` |
| `for-group` | once per item of a list variable | `itemsVariable`, `layout`, `justify`, `align`, `gap` |

`layout` defaults to `'none'` for `group` (free-form, children keep their own
`x`/`y`) — chosen so groups saved before auto-layout existed keep rendering as
before. `for-group` defaults to `'vertical'` instead, because a repeat with no
direction has no meaningful free-form interpretation.

## `resolveShapes`

`packages/common/src/rendering/shapeResolver.ts`. Flattens an authored tree into
absolute-positioned leaves. Called **only** by `ExportService` (see skill
`render-parity` for why).

```
for each shape:
  hidden          → drop
  group           → layoutGroupChildren, translate by (x, y), recurse
  if-group        → resolveVariable(condition) !== true ? drop : translate + recurse
  for-group       → resolveVariable(items) must be a non-empty array;
                    per item: reid children, translate by
                    (x + xOff - bbox.minX, y + yOff - bbox.minY), recurse
  anything else   → emit as-is
```

Two subtleties worth preserving:

- **A group with an active layout recomputes child positions** instead of
  trusting the persisted `x`/`y`. That is the only way it stays correct when
  children come from dynamic data.
- **`for-group` iterations are offset by the children's tight bbox origin**
  (`childrenBBox().minX/minY`). Without that subtraction the authored `minX`
  gets added on top of the layout offset and pushes iterations off-slide.

`childrenBBox` returns the tight extent (`max - min`), deliberately excluding
empty space between the parent's origin and its topmost/leftmost child.

## Adding a shape type

Use `/new-shape`, which walks this list. Every site is reachable by following
compile errors after you extend the union — which is the point of the union.

1. `packages/common/src/types.ts` — the interface, and add it to `Shape`. If it
   is a container, extend `ContainerShape` **and** `isContainerShape`.
2. `packages/common/src/rendering/` — any geometry both renderers need; a new
   `expand*` branch in `resolveShapes` for a container.
3. `packages/backend/src/services/ExportService.ts` — a `render*` method and a
   `renderShape` case. Containers need no case (they never arrive).
4. `packages/frontend/src/components/slide/svg/` — the component, plus the
   `SVGShape` switch.
5. `packages/frontend/src/store/editor/` — `ToolSlice` (the tool),
   `ShapeCreationSlice` (drawing → shape), `ShapeSlice.selectShape`
   (`contextBarType`), `ToolAttributeSlice` (`shapeToAttributesHelper`).
6. `packages/frontend/src/components/slide/SlideCanvas.tsx` — the drawing-tool
   list in `handleMouseDown`, if it is drawn by dragging.
7. Context toolbar under `.../TopBar/Context-toolbar/` + its `index.tsx` switch.
8. `packages/frontend/src/utils/shapeTree.ts` — `shapeDisplayName`,
   `nextShapeName`; the shape-tree panel icon in `ShapeRow/shapeIcon.tsx`.
9. `packages/sdk/src/ImprimeClient.ts` — an `addX` helper if it makes sense for
   API users.
10. No schema migration: `packages/backend/src/models/Slide.ts` stores `shapes`
    as `Schema.Types.Mixed`, because Mongoose cannot validate the discriminated
    union. The flip side is that **nothing validates shape payloads at the
    database boundary** — a malformed shape is persisted happily and only blows
    up at render time.

## Related

- Skills: `render-parity`, `variable-system`, `editor-store`
- Commands: `/new-shape`, `/parity`
- Agents: `imprime-architect`, `render-parity-auditor`
