---
name: pdf-export
description: Constraints and traps of the Imprime PDF export path — @react-pdf/renderer quirks (colour alpha, per-shape Svg layers, fixed, absolute positioning), font registration, the worker threads renders run on and their timeout, and the resolution the preview shares. Use when changing ExportService, pdfDocument.ts or the render pool, debugging a PDF that does not match the editor, or touching fonts.
metadata:
  origin: adapted from ECC (github.com/affaan-m/ECC)
---

# PDF Export

Three files in `packages/backend/src/services/`, split by thread:

| File | Thread | Holds |
|---|---|---|
| `ExportService.ts` | the server's | validation, resolution, image and font reads |
| `pdfRenderPool.ts` | the server's | the worker threads, their bounds and queue, the timeout that terminates one |
| `pdfDocument.ts` (+ `pdfWorker.ts`, its entry) | a worker's | everything `@react-pdf/renderer`: font registration, `render*`, `parseColor` |
| `pdfRaster.ts` | a worker's | the page images, loaded by the first job that asks for them |

The bounds are read from the environment by `config/pdfRendering.ts`.

The server's thread never loads react-pdf. A render job crosses to the worker
by structured clone, so it is **data only** — pages, images, font files; no
function, no class instance survives the trip, and a `Buffer` arrives as a
plain `Uint8Array` (`asBuffers`). The worker reads no database: what it needs
goes in the job.

Reached from three entry points, each streaming the buffer back with download
headers (`routes/attachments.ts`, `sendPdf`):

- `POST /api/export/:id/pdf`, and `POST /api/export/code/:code/pdf` by the
  template's code;
- `POST /api/previews/:id/pdf`, the PDF a preview shows.

The MCP returns no PDF: `preview_template` makes a preview and links to the
editor's page for it, from which the owner prints — and returns PNG images of
the PDF's pages for the agent, drawn by pdf.js on `@napi-rs/canvas`
(`services/pdfRaster.ts`): react-pdf writes PDF only. The images show the PDF
as pdf.js reads it, so they are also a quick way to look at an export here. The resolution half of the
pipeline — `resolveTemplate`, public as `resolve` — is what the preview shows,
so a preview fails exactly where the PDF would.

## Pipeline

```
exportToPDF(template, ownerId, { variableValues }) → { pdf, warnings }
  validateVariables          required variables must be non-empty (no default fallback)
  resolvePages               repeated pages copied, failed page conditions dropped
                             (none left → ValidationError NO_PAGE_TO_EXPORT); each
                             copy's resolveShapes in its item's scope: data applied,
                             layoutTree, flattened → absolute leaves
  filter                     drop shapes whose x or y is past the page edge, one
                             CONTENT_OFF_PAGE warning per PDF page that loses any
  PdfRenderPool.render(owner) a worker lent to `owner`: an idle one, or a new
                             one that loads react-pdf while the job is built —
                             if fewer than 4 are busy, 2 for `owner`
                             (MAX_PDF_RENDERS, MAX_PDF_RENDERS_PER_USER); else
                             waits, FIFO, up to 10 s in a queue of 10
                             (PDF_QUEUE_WAIT_SECONDS, PDF_QUEUE_SIZE, 0: no
                             queue); refused → AppError(429 EXPORT_BUSY)
    fetchUploadedImages      one batched pass, imageId → data URL + natural size, ownerId's images only
    fontService.getForExport the imported families the runs ask for, files only
                             for those this worker has not registered
  ── worker thread ──
  renderPdf                  fonts registered + metrics, JPEGs stripped (pdfJpeg),
                             renderPage per page, renderToBuffer; with `raster`
                             (exportPageImages, the MCP preview), the pages as
                             PNG by pdf.js (pdfRaster), in the same job
  timeout                    30s from the job reaching the worker → worker
                             terminated, AppError(408)
                             (PDF_RENDER_TIMEOUT_SECONDS in the env, 1 to 300)
```

**The pool is the bound.** There is no counter beside the workers: a busy
worker carries the `owner` it is lent to, and how many are busy — overall,
for one owner — is how many renders run. A worker is given back only once the
job is done with it, finished or terminated, and a freed worker goes at once
to the first waiting job whose owner may have one (`dispatch`). An owner may
have no more jobs waiting than running (`maxPerOwner`), so one account cannot
fill the queue.

**The timeout stops the render.** The worker is terminated — mid-loop if it
must — and counts as busy until it is gone. A worker's start (about half a
second) is not counted. A worker is kept for the next render and closed after
a minute idle; each costs 150 to 200 MB on a real document while it lives
(measured in the image, the 9-page tutorial), which is what `MAX_PDF_RENDERS`
bounds now that renders run side by side on separate cores.

A render error (react-pdf threw) gives the worker back; a worker that dies —
out of memory, or a crash — fails its export with a 500 and is replaced.

The SDK puts no timeout of its own on a PDF export: the server's 408 is the
limit, and a shorter one on the client would cut an export the server still
allows. A request can last the queue wait plus the render timeout.

`renderShape` never sees a container — `resolveShapes` has already expanded
them. If you add a container type, it is handled in the resolver, not here.

## `@react-pdf/renderer` traps

These are the reasons `pdfDocument.ts` looks the way it does. Removing a
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

**Every positioned element needs `fixed`.** The text box's `View` and every
`Text`, the image's `View` and `Image`, and each `Svg` layer set `fixed: true`,
which stops react-pdf from trying to reflow an absolutely positioned box across
pages. Pages are fixed-size pages; there is no flow. Leaving it off is not
cosmetic: react-pdf moves a non-fixed element that cannot split (an `Svg`, an
`Image`) to the next page as soon as `top + height` exceeds the page height —
and Yoga lays out in float32, so a layer clamped *exactly* to the page bottom
from a fractional `top` can exceed it by 1e-4. On the next page its absolute
`top` puts it past the bottom again, and the pagination loops forever. On its
worker, such a render is terminated at its timeout rather than hanging the
server — but every export of that template then fails with 408: `fixed` is
still what makes it draw.

**Positioning is absolute, from the top-left.** Every shape carries
`position: 'absolute', left: shape.x, top: shape.y`. A text box sets `width` but
**not** `height` — it grows with its content, which is how a long substituted
variable overflows rather than clipping.

**Text metrics differ from the browser.** react-pdf breaks lines with its own
algorithm, so wrapping can still differ from the editor by a word.
`DEFAULT_LINE_HEIGHT` (1.5), `PARAGRAPH_SPACING` (8) and `DEFAULT_FONT_SIZE`
(24) live in `common/rendering/pageContentStyles.ts` and both renderers read
them — change them there, never locally. Hyphenation is off on purpose (see
Fonts): the browser never hyphenates.

**An image react-pdf cannot parse is left out silently.** The export succeeds,
the box is empty, and the only trace is a console line. JPEGs go through
jay-peg, which reads a JFIF segment as exactly 16 bytes: an iPhone photo
(APP0 extended with "AMPF") made it throw "Unknown version 16717".
`pdfJpeg.ts` strips JFIF segments and anything after the image's end from every
JPEG before rendering. Suspect this first when an image shows in the editor and
not in the PDF: a PDF of a few KB for a page with photos is the giveaway.

## Fonts

Two kinds of family, one resolution.

- **Built-in** — `BUILTIN_FONTS` in `packages/common/src/fonts.ts` gives each
  family a `category` (the font menu groups by it) and the file of each face
  it has: `regular` always, `bold`, `italic`, `boldItalic` when shipped. Full
  file names (`.ttf` or `.otf`), in `packages/common/src/assets/fonts/`, with
  each family's license in `licenses/` (the Docker image copies the folder).
  Files must be **static** instances — react-pdf cannot use a variable font.
  Adding a family is the files, the license and one entry; nothing else lists
  families. `assets/fonts/README.md` has the download recipe.
- **Imported** — instance-wide, managed by admins: metadata in the `Font`
  collection, each face's file in its own `FontFile` document (so a family is
  not bound by MongoDB's 16 MB document limit), checked with fontkit at upload,
  `MAX_FONT_FILE_SIZE_MB` (5) per file. Registered under `importedFontFamilyName(font)` =
  `imprime-font-<id>-<version>`: the version changes with every face update,
  because react-pdf's registry — one per worker thread — cannot unregister a
  family.

A run's face comes from `resolveFontFace(run, catalog)` (or `getRunTextStyle`)
in `common/rendering/pageContentStyles.ts`, against
`createFontCatalog(importedFonts)`. An unset or unknown family is drawn in
`DEFAULT_FONT` (Roboto); a face the family lacks falls back to the closest one
(`resolveFontVariant`: bold italic → bold → italic → regular). **Never build
`fontFamily`/`fontWeight`/`fontStyle` from the run's marks directly**: react-pdf
throws `Could not resolve font for X, fontWeight …, fontStyle …` for a style
the family did not register, and cannot synthesise one. The editor matches
that by setting `font-synthesis: none` on the text wrapper.

`packages/backend/src/config/fonts.ts`:

- `registerBuiltinFonts()` runs when a worker loads `pdfDocument.ts`. It also
  turns off react-pdf's hyphenation (`registerHyphenationCallback(word => [word])`),
  which otherwise splits long words with English rules whatever the language.
- `registerImportedFonts()` runs per export, on the worker, for the families
  the runs ask for (`pdfDocument.loadFonts`), as base64 data URLs; each name
  once, kept for the life of that worker. The worker reports what it holds
  (`registeredImportedFontFamilies`), and the pool fetches files only for the
  others: a font is read from the database once per worker, not per export.
- The fonts directory is one relative path, right from both places that load
  `fonts.ts`: `src/config/` under tsx and `dist/services/` in the bundled
  worker, at the same depth. A change to the build output location breaks
  font loading at runtime with no compile error.
- The worker's own entry is probed the same way (`pdfRenderPool.workerEntry`):
  `src/services/pdfWorker.ts` in dev, `dist/services/pdfWorker.js` once built —
  an esbuild entry point of its own in the backend's `build` script. tsx's
  loader does not reach worker threads, so in dev the worker registers it
  (`tsx/esm/api`) before importing the TypeScript entry.

The editor registers the same files under the same names, weights and styles
with the CSS Font Loading API, in `packages/frontend/src/fonts.ts`: built-ins
at startup (URLs from `import.meta.glob`), imported fonts when the editor opens
(`FontSlice.loadFonts`), which enter the catalog only once loaded.

## Text reaches the renderer as text

`resolvePages` adds the template's page-number box to the pages that show it,
then writes every variable run and every page number (`PageNumberElement`,
counted after repeated pages are copied and failed conditions left out) into
literal text, so `renderTextBox` only reads `child.text`. A new inline element must be baked there too, or it draws as
nothing.

## Debugging a PDF

Typecheck proves nothing about the output. Generate a real one:

```bash
curl -X POST http://localhost:3001/api/export/<templateId>/pdf \
  -H 'x-api-key: <key>' -H 'content-type: application/json' \
  -d '{"variableName":"value"}' -o /tmp/out.pdf
```

The response carries `X-Generation-Time` in ms. Then compare against the editor
for the same template. → command `/export-debug`

A change that should not alter the output — a refactor of `pdfDocument.ts`, of
the pool — is checked by drawing a few PDFs before and after with
`rasterizePdf` and comparing the PNGs' hashes: identical pixels give identical
files.

## Related

- Skills: `render-parity`, `variable-system`, `shape-model`
- Commands: `/export-debug`, `/parity`
- Agents: `export-debugger`, `render-parity-auditor`
