---
name: render-parity
description: The dual-renderer contract of Imprime — the SVG editor renderer and the react-pdf export renderer draw the same document and must not drift. Covers what belongs in packages/common/src/rendering, the deliberate asymmetries between authored and resolved trees, and the per-feature checklist. Use whenever a change touches shapes, geometry, text formatting, layout, or the PDF output.
metadata:
  origin: adapted from ECC (github.com/affaan-m/ECC)
---

# Render Parity

Imprime draws every document twice:

| | Editor | Export |
|---|---|---|
| Entry point | `packages/frontend/src/components/slide/SlideCanvas.tsx` | `packages/backend/src/services/ExportService.ts` |
| Dispatch | `svg/SVGShape.tsx` → one component per shape type | `renderShape()` → one method per shape type |
| Technology | Browser SVG + Slate for text | `@react-pdf/renderer` (`Svg`/`Rect`/`Ellipse`, `View`, `Text`, `Image`) |
| Input | the **authored** shape tree | the **resolved** shape tree |

Drift between the two is the characteristic bug of this codebase, and it is
invisible to the compiler: both sides typecheck perfectly while producing
different pictures. The only structural defence is to put the decision in
`packages/common/src/rendering/` so there is one answer, not two.

## What belongs in `common/rendering`

Anything where "the editor and the PDF must agree" is the requirement:

| Module | Owns |
|---|---|
| `constants.ts` | `SLIDE_WIDTH` / `SLIDE_HEIGHT` (1920×1080) |
| `strokeUtils.ts` | `getDashArray` — dashed/dotted stroke patterns |
| `svgRenderers.ts` | `getEllipseGeometry`, `getRectangleCornerRadius` — shape geometry from a bounding box |
| `groupLayout.ts` | `distributeMainAxis`, `crossAxisOffset`, `layoutGroupChildren` — the flexbox subset |
| `shapeResolver.ts` | `resolveShapes`, `childrenBBox` — container expansion |
| `variables.ts` | `resolveVariable`, `isEmptyVariableValue`, `stringifyVariableValue` |
| `slideContentStyles.ts` | `getSlideContentWrapperStyles` — text box content styling |

Everything exported here is re-exported from `packages/common/src/rendering/index.ts`
and reachable as `@imprime/common` (backend) or `@imprime/sdk` (frontend).

**Test for "does this belong in common?"** — if you are about to write a number,
a formula or a conditional in one renderer and the other renderer would need the
same one to match, it belongs in `common`. Corner radius clamping, dash arrays
and ellipse centres all started as that question.

## What stays renderer-local

Legitimately asymmetric, and must not be forced into `common`:

- **Interaction** — selection handles, drag, drop highlights, the container
  frame outline (`ContainerFrame`), the drawing preview. The PDF has no
  equivalent and never will.
- **Editing affordances** — `SVGText` mounts a Slate editor; the export walks
  `paragraphes` directly. A variable run shows a bordered chip with the variable
  *name* in the editor (`VariableBlock.tsx`), and its *substituted value* in the
  PDF (`stringifyVariableValue`). That difference is the product, not a bug.
- **`@react-pdf/renderer` workarounds** — alpha parsing, `fixed`, per-shape `Svg`
  layers. These exist because of the PDF library, so they live in
  `ExportService`. → skill `pdf-export`

## The authored/resolved asymmetry

`resolveShapes()` is called in exactly one place: `ExportService.exportToPDF`.
The editor never calls it. This is deliberate — you cannot select, drag or
rename a shape that only exists because a `for-group` materialised it.

So in the editor:

- containers stay nested; `SVGGroup` draws a `<g transform="translate(x y)">`
  and recurses, so children keep parent-relative coordinates;
- an `if-group` renders its children regardless of the condition;
- a `for-group` renders its children exactly once;
- `hidden` shapes are skipped by `SVGSelectionWrapper` (still listed in the
  shape tree panel, still selectable there).

And in the export, `resolveShapes` flattens all of that to absolute-positioned
leaves: `hidden` dropped, conditions evaluated, iterations materialised with
re-forged ids (`reidShape`), coordinates translated into slide space. By the
time `renderShape` runs, **no container can reach it**.

The one place the editor deliberately mirrors resolution is auto-layout:
`reflowGroups` (`packages/frontend/src/utils/groupLayout.ts`) re-applies
`layoutGroupChildren` to the authored tree on every shape update
(`SlideSlice.updateSlideShapes`), so a laid-out group looks the same in the
editor as `expandGroup` will make it at export time. If you add a layout rule,
check both call sites still agree.

## Checklist for a visual change

1. Does the rule need to match between editor and PDF? → put it in
   `packages/common/src/rendering/`, export it from `index.ts`.
2. Editor side: the component under `packages/frontend/src/components/slide/svg/`,
   plus the `SVGShape` switch if it is a new type.
3. Export side: the `render*` method in `ExportService`, plus the `renderShape`
   switch.
4. If it is a new container type: `resolveShapes` needs an `expand*` case, and
   the editor needs it in `isContainerShape` (defined in `common/src/types.ts`,
   re-exported through `utils/shapeTree.ts`).
5. If it affects geometry, re-derive against `SLIDE_WIDTH`/`SLIDE_HEIGHT` —
   the export clips shapes to the slide (`.filter(s => s.y < SLIDE_HEIGHT && s.x < SLIDE_WIDTH)`)
   and the editor does not.
6. Verify by generating a real PDF against a presentation that exercises the
   change, and compare with the editor. Typecheck proves nothing here.
   → command `/export-debug`

## Known drift risks

- **Stroke on the bounding box.** The editor lets SVG overflow; the export
  builds a per-shape `Svg` layer clamped to the page (`renderInSvgLayer`), so a
  wide stroke near an edge is clipped in the PDF and not in the editor.
- **Text metrics.** Slate lays out text with browser font metrics, `@react-pdf`
  with its own. Line wrapping will not match exactly; a text box sized to fit in
  the editor can overflow in the PDF. Font registration is shared
  (`packages/common/src/fonts.ts` ↔ `packages/backend/src/config/fonts.ts`) —
  a font offered in the editor toolbar must be registered for the PDF or it
  silently falls back.
- **Colour with alpha.** `@react-pdf/renderer` parses neither `#RRGGBBAA` nor
  `rgba()`; `ExportService.parseColor` splits them into `color` + `opacity`.
  Any new colour-carrying property must go through it.
- **Paragraph spacing and line height.** Hard-coded in `ExportService`
  (`LINE_HEIGHT`, `PARAGRAPH_SPACING`, `DEFAULT_FONT_SIZE`) with no counterpart
  in the editor's CSS. Changing one without the other widens the gap.

## Related

- Skills: `shape-model`, `pdf-export`, `variable-system`
- Commands: `/parity`, `/export-debug`, `/new-shape`
- Agents: `render-parity-auditor`, `export-debugger`
