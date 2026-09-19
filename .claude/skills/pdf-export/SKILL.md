---
name: pdf-export
description: Constraints and traps of the Imprime PDF export path — @react-pdf/renderer quirks (colour alpha, per-shape Svg layers, fixed, absolute positioning), font registration, the 30s render timeout, and the single-use download store. Use when changing ExportService, debugging a PDF that does not match the editor, or touching fonts.
metadata:
  origin: adapted from ECC (github.com/affaan-m/ECC)
---

# PDF Export

`packages/backend/src/services/ExportService.ts`, built on
`@react-pdf/renderer`. Reached from two entry points:

- `POST /api/export/:id/pdf` → buffer streamed back with download headers;
- MCP `export_presentation` → buffer parked in `pdfDownloadStore`, single-use
  URL returned.

## Pipeline

```
exportToPDF(presentation, { variableValues })
  validateVariables          required variables must be non-empty (no default fallback)
  resolveShapes per slide    containers flattened → absolute leaves
  filter                     drop shapes whose x or y is past the slide edge
  fetchImageData             one batched pass, imageId → data URL
  renderSlide per slide      Page (1920×1080) + one element per shape
  renderToBuffer             raced against a 30s timeout → AppError(408)
```

`renderShape` never sees a container — `resolveShapes` has already expanded
them. If you add a container type, it is handled in the resolver, not here.

## `@react-pdf/renderer` traps

These are the reasons `ExportService` looks the way it does. Removing a
workaround because it looks redundant will reintroduce the bug it fixes.

**Colour has no alpha.** The library parses neither `#RRGGBBAA` nor `rgba()`.
`parseColor` splits any input into `{ color, opacity }` and each is applied to
the matching pair of props (`fill`/`fillOpacity`, `stroke`/`strokeOpacity`,
`color`/`opacity`). Any new colour-carrying property must go through it.
`'none'` and `'transparent'` become `{ color: 'none', opacity: 0 }`.

**Vector shapes need their own `Svg` layer.** `renderInSvgLayer` wraps each
rectangle/ellipse in an absolutely-positioned `Svg` sized to the shape's bounds
*plus half the stroke width*, clamped to the page, and redraws the shape in
layer-local coordinates (`shape.x - left`). One page-sized `Svg` would let
shapes paint over each other's layers and break z-order against `View`/`Text`
elements. A layer that computes to zero width or height renders an empty `View`
instead — the library errors on a zero-sized `Svg`.

**Text needs `fixed`.** `renderTextBox` sets `fixed: true` on the wrapper `View`
and on every `Text`, which stops react-pdf from trying to reflow the absolutely
positioned box across pages. Slides are fixed-size pages; there is no flow.

**Positioning is absolute, from the top-left.** Every shape carries
`position: 'absolute', left: shape.x, top: shape.y`. A text box sets `width` but
**not** `height` — it grows with its content, which is how a long substituted
variable overflows rather than clipping.

**Text metrics differ from the browser.** Wrapping will not match the editor
exactly. `LINE_HEIGHT` (1.5), `PARAGRAPH_SPACING` (8) and `DEFAULT_FONT_SIZE`
(16) are hard-coded here with no counterpart in the editor's CSS — if you change
one, the two drift further apart, so change both or neither.

## Fonts

`packages/common/src/fonts.ts` is the single registry: `AVAILABLE_FONTS`,
`DEFAULT_FONT` (`Roboto`), and `FONT_FILES` mapping each family to its
regular/bold/italic/boldItalic file stems. Files live in
`packages/common/src/assets/fonts/`.

`packages/backend/src/config/fonts.ts` registers them with react-pdf at module
load. Things to know:

- **No font substitution by design** — a requested family that is not registered
  does not silently become Roboto at registration time; `normalizeFontFamily`
  decides the fallback explicitly.
- The fonts directory is resolved by probing two candidate paths, because
  `tsx` runs from `src/config/` and the esbuild bundle runs from `dist/` — one
  directory level apart. A change to the build output location breaks font
  loading at runtime with no compile error.
- Extensions are per-family: `Crimson Text` ships `.otf`, everything else
  `.ttf`. Adding a family means adding files, the `FONT_FILES` entry, and
  checking that extension branch.
- Bold and italic come from `getFontStyleProps`, not from a synthesized weight.
  A family without a bold file will not render bold.

**Adding a font to the editor toolbar without registering it for the PDF is the
classic silent-divergence bug.** Both sides read `AVAILABLE_FONTS`, so add it
there and ship the files.

## Download store

`packages/backend/src/services/pdfDownloadStore.ts` — an in-process `Map`:
10-minute TTL, 200 MB / 100 entries cap with FIFO eviction, a 60s sweep, and
**single-use** reads (`takePdf` deletes on read). It is deliberately
process-local: it does not survive a restart and does not work across replicas.
If the deployment ever scales horizontally, this is the thing that breaks.

## Debugging a PDF

Typecheck proves nothing about the output. Generate a real one:

```bash
curl -X POST http://localhost:3001/api/export/<presentationId>/pdf \
  -H 'x-api-key: <key>' -H 'content-type: application/json' \
  -d '{"variableName":"value"}' -o /tmp/out.pdf
```

The response carries `X-Generation-Time` in ms. Then compare against the editor
for the same presentation. → command `/export-debug`

## Related

- Skills: `render-parity`, `variable-system`, `shape-model`
- Commands: `/export-debug`, `/parity`
- Agents: `export-debugger`, `render-parity-auditor`
