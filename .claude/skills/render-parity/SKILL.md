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
| Entry point | `packages/frontend/src/components/page/PageCanvas.tsx` | `packages/backend/src/services/ExportService.ts` |
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
| `pageSize.ts` | `PAGE_FORMATS` (A4 portrait, A4 landscape, 16:9), `DEFAULT_PAGE_SIZE`, `isValidPageSize` — the size is per template (`Template.pageSize`), read in the editor through `selectPageSize` |
| `strokeUtils.ts` | `getDashArray` — dashed/dotted stroke patterns |
| `svgRenderers.ts` | `getEllipseGeometry` — ellipse geometry from a bounding box |
| `boxGeometry.ts` | `getBoxPaths` (outline + per-side border as path data, Bézier corners, CSS radius fitting), `getBorderWidths`, `getCornerRadii`, `getPadding`, `getBorderOverhang` — every rectangle and group box |
| `rotation.ts` | `getRotation` (sanitised, in (-180, 180]), `getCenter`, `rotatePoint`, `Frame` with `getContentFrame` / `shapeToPage` / `shapeFromPage` (a group's turn composed into its children), `getRotatedBounds` — every rotated shape |
| `imageLayout.ts` | `getImageLayout` (fit, alignment and crop → the rect the *whole* image is drawn at, clipped to the box), `getImageCrop`, `getImageCornerRadius` (clamped as react-pdf clamps a clip), `getImageOpacity` |
| `groupLayout.ts` | `distributeMainAxis`, `crossAxisOffset`, `layoutGroupChildren` — the flexbox subset, padding, `stack` |
| `shapeResolver.ts` | `resolveShapes` — repeats, conditions, group expansion; `getGroupBox` — a group's background and border as rectangles |
| `variables.ts` | `resolveVariable`, `isConditionMet`, `isEmptyVariableValue`, `stringifyVariableValue` |
| `pageContentStyles.ts` | text formatting: `getPageContentWrapperStyles` (box, vertical alignment), `getParagraphStyle` (alignment, line height, sanitised), `getParagraphLeadFace` (the face and size a paragraph's lines are set in), `getHalfLeading` (where CSS puts glyphs in their line), `getTextDecoration`, `getTextTransform`, `parseFontSize`, `DEFAULT_FONT_SIZE`, `DEFAULT_LINE_HEIGHT`, `PARAGRAPH_SPACING` |
| `listStyles.ts` | lists: `getListStyle` (sanitised), `getListMarkers` (numbering), `getListMarkerFormatting`, `getListLayout` / `getBulletBox` (item and marker geometry) |

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

`resolveShapes()` is called in exactly one place: `resolvePages()`, which only
`ExportService.exportToPDF` calls.
The editor never calls it. This is deliberate — you cannot select, drag or
rename a shape that only exists because a repeat materialised it.

So in the editor:

- groups stay nested; `SVGGroup` draws a `<g transform="translate(x y)">`
  and recurses, so children keep parent-relative coordinates. It draws the
  group's box in the export's order — `getGroupBox`'s background, the
  children, the border — under the editor-only dashed frame;
- a repeated group shows **one copy**, the authored one, with a `⟳ list` badge;
- a `visibleWhen` shape is always drawn, with a `? variable` badge, and only
  **faded** when `previewCondition` (`utils/conditionPreview.ts`) finds the
  defaults would hide it — reading item fields from each repeat's first default
  item, through the shared `isConditionMet`. Its siblings do not reflow: the
  editor's layout keeps every authored child, the export's leaves it out;
- `hidden` shapes are skipped by `SVGSelectionWrapper` (still listed in the
  shape tree panel, still selectable there);
- a page is edited once whatever its own `repeat` and `visibleWhen` say: the
  page context bar and its thumbnail carry them, the thumbnail badged and
  faded when `previewPageCondition` finds the defaults would leave it out. A
  repeated page's item fields are in scope for every picker on it
  (`repeatsInScope` puts the page's repeat outermost).

And in the export, `resolveShapes` flattens all of that to absolute-positioned
leaves: `hidden` dropped, conditions evaluated, repeat copies materialised with
re-forged ids (`reidShape`), group boxes emitted as rectangles, coordinates
brought into page space — each group's rotation composed into its leaves'.
By the time `renderShape` runs, **no group can reach it**.

Rotation itself: the editor turns a shape's `<g>` about its box centre; the
export turns the shape's node with a `transform` style — its `Svg` layer
(then unclamped, so the clamp does not turn with it), its text `View`, or a
`View` wrapping the image's clip, since react-pdf clips a node before it
applies that node's own transform.

The one place the editor deliberately mirrors resolution is layout: the write
path (`DocumentWriteSlice.updatePageShapes`) runs `layoutTree`
(`common/rendering/groupLayout.ts`) on the authored tree on every shape
update, and `resolveShapes` runs the same function on the tree its data
produced. So a laid-out group looks the same in the editor as at export —
except where the data differs: one copy per repeat and every conditional
shape in the editor, so a hugging group is smaller there than in the PDF.
Add a layout rule inside `layoutTree` and both sides have it.

## Checklist for a visual change

1. Does the rule need to match between editor and PDF? → put it in
   `packages/common/src/rendering/`, export it from `index.ts`.
2. Editor side: the component under `packages/frontend/src/components/page/svg/`,
   plus the `SVGShape` switch if it is a new type.
3. Export side: the `render*` method in `ExportService`, plus the `renderShape`
   switch.
4. If it is a new container type: `resolveShapes` needs an `expand*` case, and
   the editor needs it in `isContainerShape` (defined in `common/src/types.ts`,
   re-exported through `utils/shapeTree.ts`).
5. If it affects geometry, re-derive against the template's `pageSize` —
   never a fixed size: pages are A4, 16:9 or custom. The export clips shapes to
   the page (`.filter(s => s.y < pageSize.height && s.x < pageSize.width)`)
   and the editor does not.
6. Verify by generating a real PDF against a template that exercises the
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
- **Line height is per run in the PDF.** react-pdf multiplies a unitless
  `lineHeight` by the declaring element's own font size and passes the product
  down, so `ExportService.inlineTextStyle` sets the paragraph's line height on
  every run — CSS inherits the multiplier instead, and that is what keeps the
  two in step with mixed font sizes.
- **The CSS strut.** A CSS line is the union of the runs and an invisible
  glyph in the paragraph's own font, each centred on its own ascent and
  descent; react-pdf's line is the tallest run's `fontSize × lineHeight`.
  `ParagraphElement` draws each `<p>` in its lead run's face and size
  (`getParagraphLeadFace`) so the strut coincides with the runs. Left to the
  box's default (Roboto 24px), it made Courier Prime lines ~3px taller per
  line than in the PDF. A paragraph mixing sizes across lines can still drift.
- **Leading placement.** CSS splits a line's leading above and below the
  glyphs; react-pdf puts the baseline at the line's top + ascent, all leading
  below. `ExportService` moves each paragraph's text (and a number marker)
  down by `getHalfLeading` with `top`, from the metrics react-pdf itself loaded
  for the lead face (`loadFaceMetrics`, `hhea`). Exact wherever the browser
  reads the same `hhea` values — every bundled family on macOS, all but two on
  Windows, where Chrome reads `usWin*` or `sTypo*`: Roboto (0.2px at 24px) and
  Crimson Text (up to ~3px at 24px). A bullet is placed by geometry and not
  moved.
- **Never give the PDF text a height.** react-pdf truncates (with an ellipsis)
  text taller than the height it is measured against. The text box is an outer
  View with the box height (for vertical alignment) around an *absolute* inner
  View with none, which is measured unconstrained, so overflowing text spills
  out as it does in the editor.
- **Hyphenation.** react-pdf hyphenates long words by default; the browser
  does not. Line breaks differ on long text even with identical metrics.
- **A word wider than its box.** react-pdf keeps it whole on one line, running
  past the edge. Slate's `Editable` defaults to `word-wrap: break-word`, which
  splits it instead (a narrow "03" read "0 / 3"): `TextBoxEditor` overrides
  it with `wordWrap: 'normal'`. Keep the override.
- **List markers are drawn, not typed.** None of the bundled PDF fonts has ◦
  or ▪ (only • and –), and the browser would silently borrow the glyph from
  another font. Bullets are boxes (`getBulletBox`); numbers are text, since
  digits and letters exist everywhere.
- **List item structure.** Both renderers pad the item to `textIndent` and
  position the marker absolutely in that padding, top-aligned with the first
  line. Absolute, so a marker wider than its slot overflows on one line
  instead of wrapping (react-pdf would wrap it inside a fixed-width column).
- **List numbering in the editor.** An item's number depends on its
  neighbours, but Slate re-renders an element only when it changes, so the
  editor computes all markers per box (`ListMarkersProvider`, selecting
  `editor.children`) and hands them down through context.
- **Paragraph spacing.** `PARAGRAPH_SPACING` is shared, and applies between
  paragraphs only. The editor enforces "not after the last" in CSS
  (`TextBoxEditor.css`, `:last-child`) because Slate memoises element renders.

## Related

- Skills: `shape-model`, `pdf-export`, `variable-system`
- Commands: `/parity`, `/export-debug`, `/new-shape`
- Agents: `render-parity-auditor`, `export-debugger`
