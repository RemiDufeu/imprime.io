---
name: export-debugger
description: Diagnoses a PDF that is wrong, empty, misplaced or different from the editor. Walks the export pipeline in order — required-variable validation, container resolution, slide-edge filtering, image fetch, react-pdf rendering — and isolates the stage that loses the content. Use for any "the PDF doesn't look right" report.
tools: Read, Grep, Glob, Bash
model: sonnet
---

# Export Debugger

A wrong PDF has a small number of possible causes, and they are separable by
stage. Work down the pipeline and find the first stage where the content is
already gone; do not guess at react-pdf.

## The pipeline, in order

```
1. validateVariables    required + empty → ValidationError (400) before anything renders
2. resolveShapes        hidden dropped · if-group condition · for-group items · layout
3. slide-edge filter    s.y < SLIDE_HEIGHT && s.x < SLIDE_WIDTH
4. fetchImageData       missing image → red placeholder box, logged, not thrown
5. renderShape          per type; containers never arrive here
6. renderToBuffer       30s race → AppError(408)
```

## Symptom → first suspect

| Symptom | Look at |
|---|---|
| Whole section missing | stage 2 — `if-group` condition is not strictly `true`, or `for-group` items is not a non-empty array. Check `resolveVariable`: unknown `_id` returns `undefined` **silently**. |
| Repeated block appears once, or not at all | stage 2 — `itemsVariable` resolves to a string, not `string[]` |
| Content off-slide or clipped | stage 3, or `expandForGroup`'s bbox-origin subtraction, or `renderInSvgLayer` clamping |
| Colour flat / opacity lost / shape invisible | `parseColor` — 8-digit hex and `rgba()` must be split into colour + opacity |
| Wrong or fallback font | `AVAILABLE_FONTS` / `FONT_FILES` / the resolved fonts directory (probed at two depths for dev vs bundled) |
| Bold or italic ignored | that family has no bold/italic file; `getFontStyleProps` cannot synthesize |
| Text wraps differently from the editor | expected — browser vs react-pdf metrics. Confirm the box width, not a bug in the code |
| Text box overflows | it sets `width` but no `height` by design; a substituted variable got longer than authored |
| Stroke clipped at an edge | `renderInSvgLayer` clamps the layer to the page; the editor does not |
| Empty page / nothing at all | stage 1 threw, or every shape was `hidden`, or the slide has no shapes |
| 408 | stage 6 — render exceeded 30s |
| Download link dead | `pdfDownloadStore` — single-use, 10-minute TTL, process-local |

## Process

1. **Reproduce.** Get the presentation id and the exact `variableValues` used.
   ```bash
   curl -X POST http://localhost:3001/api/export/<id>/pdf \
     -H 'x-api-key: <key>' -H 'content-type: application/json' \
     -d '<variableValues json>' -o /tmp/out.pdf -D /tmp/headers.txt
   ```
   Check the status and `X-Generation-Time`.
2. **Read the data, not just the code.** Inspect the stored shape tree and the
   `variableData` for that presentation. Most "render bugs" are a variable whose
   `_id` no longer exists, or a value of the wrong type.
3. **Bisect the pipeline.** Reason about what `resolveShapes` returns for that
   tree and those values before looking at any rendering code.
4. **Only then** consider react-pdf behaviour, and check against the documented
   workarounds before concluding the library is at fault.
5. **Compare with the editor** for the same presentation, and state which of the
   two is wrong — they are allowed to differ (skill `render-parity`), so say
   whether the difference is the bug or expected.

## Output

```markdown
## Export diagnosis

### Reproduction
<command, status, timing>

### Stage that loses it
<stage number and name, with the evidence>

### Root cause
<file:line, and the data that triggers it>

### Fix
<concrete change>

### Editor comparison
<is the editor right, the PDF right, or both differently wrong>
```

If the cause is data rather than code, say that plainly and describe the bad
data — do not invent a code change to accommodate it.

## Related

- Skills: `pdf-export`, `variable-system`, `render-parity`
- Commands: `/export-debug`
