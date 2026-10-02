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

**Text metrics differ from the browser.** react-pdf breaks lines with its own
algorithm, so wrapping can still differ from the editor by a word.
`DEFAULT_LINE_HEIGHT` (1.5), `PARAGRAPH_SPACING` (8) and `DEFAULT_FONT_SIZE`
(24) live in `common/rendering/slideContentStyles.ts` and both renderers read
them — change them there, never locally. Hyphenation is off on purpose (see
Fonts): the browser never hyphenates.

## Fonts

Two kinds of family, one resolution.

- **Built-in** — `BUILTIN_FONTS` in `packages/common/src/fonts.ts` maps each
  family to the file of each face it has: `regular` always, `bold`, `italic`,
  `boldItalic` when shipped. Full file names (`.ttf` or `.otf`), in
  `packages/common/src/assets/fonts/`. Adding a family is the files plus one
  entry; nothing else lists families.
- **Imported** — instance-wide, managed by admins, in the `Font` collection
  (`FontService`), each face stored as binary and checked with fontkit at
  upload. Registered under `importedFontFamilyName(font)` =
  `imprime-font-<id>-<version>`: the version changes with every face update,
  because react-pdf's registry is process-wide and cannot unregister a family.

A run's face comes from `resolveFontFace(run, catalog)` (or `getRunTextStyle`)
in `common/rendering/slideContentStyles.ts`, against
`createFontCatalog(importedFonts)`. An unset or unknown family is drawn in
`DEFAULT_FONT` (Roboto); a face the family lacks falls back to the closest one
(`resolveFontVariant`: bold italic → bold → italic → regular). **Never build
`fontFamily`/`fontWeight`/`fontStyle` from the run's marks directly**: react-pdf
throws `Could not resolve font for X, fontWeight …, fontStyle …` for a style
the family did not register, and cannot synthesise one. The editor matches
that by setting `font-synthesis: none` on the text wrapper.

`packages/backend/src/config/fonts.ts`:

- `registerBuiltinFonts()` runs at `ExportService` module load. It also turns
  off react-pdf's hyphenation (`registerHyphenationCallback(word => [word])`),
  which otherwise splits long words with English rules whatever the language.
- `registerImportedFonts()` runs per export, for the families the runs ask for
  (`ExportService.loadFonts`), as base64
  data URLs; each name once, kept for the life of the process.
- The fonts directory is resolved by probing two candidate paths, because
  `tsx` runs from `src/config/` and the esbuild bundle runs from `dist/` — one
  directory level apart. A change to the build output location breaks font
  loading at runtime with no compile error.

The editor registers the same files under the same names, weights and styles
with the CSS Font Loading API, in `packages/frontend/src/fonts.ts`: built-ins
at startup (URLs from `import.meta.glob`), imported fonts when the editor opens
(`FontSlice.loadFonts`), which enter the catalog only once loaded.

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
