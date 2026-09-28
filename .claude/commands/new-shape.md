---
description: Add a new shape or container type to Imprime, walking every site across common, backend, sdk and frontend that the union forces.
argument-hint: "<shape type name> [container|leaf]"
---

# New Shape

Adding a member to the `Shape` union touches three packages. The compiler will
find most of the sites once the union changes — that is the mechanism, and it
only works if nothing suppresses it with `as` or a `default:` case.

## Decide first

- **Leaf or container?** A container (`children: Shape[]`) needs an `expand*`
  branch in `resolveShapes` and must join `ContainerShape` and
  `isContainerShape`. A leaf needs a `renderShape` case instead.
- **Is it drawn by dragging?** If so it needs a tool, a drawing preview and an
  entry in `SlideCanvas.handleMouseDown`.
- **What does it need in the PDF?** If the answer is "nothing", stop and
  reconsider — an editor-only shape is a surprise at export time.

## Sites

### 1. `packages/common`

- `src/types.ts` — the interface extending `BaseShape`; add to `Shape`. Container:
  add to `ContainerShape` **and** `isContainerShape`.
- `src/rendering/` — geometry or layout both renderers need, exported from
  `rendering/index.ts`. Container: an `expand*` function and a case in
  `resolveShapes`.

### 2. `packages/backend`

- `src/services/ExportService.ts` — a `render*` method and a `renderShape` case.
  Containers need neither: `resolveShapes` has already expanded them.
- Colour-carrying props go through `parseColor`; vector shapes through
  `renderInSvgLayer`.

### 3. `packages/sdk`

- `src/ImprimeClient.ts` — an `addX` helper in the shape section, if API users
  should be able to create it.

### 4. `packages/frontend`

- `components/slide/svg/SVGX.tsx` + the `SVGShape` switch
- `store/editor/ToolSlice.tsx` — `ToolType` and `contextBarForShapeType`
- `store/editor/ShapeCreationSlice.tsx` — drawing gesture → shape
- `store/editor/ShapeSlice.tsx` — the `contextBarType` branch in `selectShape`
- `store/editor/ToolAttributeSlice.tsx` — `ContextBarType`, `shapeToAttributesHelper`
- `components/slide/SlideCanvas.tsx` — the drawing-tool list, if drag-drawn
- `pages/.../TopBar/Context-toolbar/` — a context bar + the `index.tsx` switch
- `pages/.../TopBar/Toolbar/Toolbar.tsx` — the tool button
- `utils/shapeTree.ts` — `TYPE_LABEL` (typed `Record<Shape['type'], string>`,
  so the compiler *will* flag a missing entry)
- `pages/.../ShapeTreePanel/ShapeRow/shapeIcon.tsx` — the panel icon

### 5. Persistence

None. `packages/backend/src/models/Slide.ts` stores `shapes` as
`Schema.Types.Mixed`. The flip side: nothing validates the payload at the
database boundary, so a malformed shape persists silently and fails at render.

## Process

1. Write the type in `common/src/types.ts` first.
2. `npm run build:common && npm run typecheck --workspace=@imprime/backend` —
   the errors are your checklist for the backend.
3. `npm run build:sdk && npm run typecheck --workspace=@imprime/frontend` — same
   for the frontend.
4. Work through them. Resist adding a `default:` to quiet a switch.
5. Check by hand the editor sites the compiler does **not** find, because they
   test tool or shape type as a string rather than exhausting the union:
   the toolbar button list (`Toolbar.tsx`), the drawing-tool guards in
   `ShapeCreationSlice.finishDrawing` and `SlideCanvas.handleMouseDown`, the
   `shapeIcon.tsx` switch, and `contextBarForShapeType`.
6. `/parity` — including the manual editor-vs-PDF comparison.
7. `/review`.

## Related

- Skills: `shape-model`, `render-parity`, `pdf-export`
- Agents: `imprime-architect`, `render-parity-auditor`
- Commands: `/feature`, `/verify`, `/parity`
