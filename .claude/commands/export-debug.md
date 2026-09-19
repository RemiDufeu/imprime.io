---
description: Diagnose a PDF that is wrong, empty, misplaced or different from the editor, by walking the export pipeline stage by stage.
argument-hint: "<what is wrong> [presentation id]"
---

# Export Debug

Invokes `export-debugger`. The point is to isolate the **stage** that loses the
content before looking at rendering code — most "render bugs" turn out to be
data or resolution, not `@react-pdf/renderer`.

## Pipeline

```
1. validateVariables   required + empty → 400 before anything renders
2. resolveShapes       hidden · if-group condition · for-group items · layout
3. slide-edge filter   s.y < SLIDE_HEIGHT && s.x < SLIDE_WIDTH
4. fetchImageData      missing image → red placeholder, logged not thrown
5. renderShape         per type; containers never arrive here
6. renderToBuffer      30s race → 408
```

## Before anything else

Gather:

- the presentation id, and the exact `variableValues` used;
- whether the editor shows it correctly (if both are wrong, it is not a parity
  problem — it is the data or the authored template);
- the HTTP status and `X-Generation-Time` header.

```bash
curl -X POST http://localhost:3001/api/export/<id>/pdf \
  -H 'x-api-key: <key>' -H 'content-type: application/json' \
  -d '<variableValues>' -o /tmp/out.pdf -D /tmp/headers.txt
```

If you do not have a reproduction, say so and ask for one rather than
speculating down the pipeline.

## Fast triage

| Symptom | First suspect |
|---|---|
| Section missing entirely | `if-group` condition not strictly `true`, or unknown variable `_id` → `resolveVariable` returns `undefined` silently |
| Repeat renders once or zero times | `itemsVariable` is not a non-empty array |
| Content off-slide | `expandForGroup` bbox origin, or the stage-3 filter |
| Colour flat, shape invisible | `parseColor` — alpha must be split out |
| Wrong font, no bold | `AVAILABLE_FONTS` / `FONT_FILES` / missing font file |
| Text wraps differently | expected: browser vs react-pdf metrics |
| Stroke clipped at an edge | `renderInSvgLayer` clamps to the page; the editor does not |
| 408 | render exceeded 30s |
| Dead download link | `pdfDownloadStore` is single-use, 10-min TTL, process-local |

## Close with

- the stage, the root cause with `file:line`, and the fix;
- whether the **editor** or the **PDF** is the wrong one;
- if the cause is data rather than code, say so plainly — do not invent a code
  change to accommodate bad data.

## Related

- Skills: `pdf-export`, `variable-system`, `render-parity`
- Agents: `export-debugger`
- Commands: `/parity`
