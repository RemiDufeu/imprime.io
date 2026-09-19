---
description: Audit the editor SVG renderer against the react-pdf export renderer for drift, and produce the manual comparison steps that code reading cannot replace.
argument-hint: "[diff|full|<shape type>] (default: diff)"
---

# Parity

Imprime draws every document twice. Both renderers typecheck while producing
different pictures, so this is the one class of bug the gate cannot see.

## Modes

- **`diff`** (default) — audit only what changed. Invokes `render-parity-auditor`
  on the current diff.
- **`full`** — audit every pair, regardless of the diff. Use before a release or
  after a refactor of `packages/common/src/rendering/`.
- **`<shape type>`** — audit one type end to end (`rectangle`, `ellipse`, `text`,
  `image`, `group`, `if-group`, `for-group`).

## The pairs

| Editor | Export |
|---|---|
| `svg/SVGRectangle.tsx` | `ExportService.renderRectangle` |
| `svg/SVGEllipse.tsx` | `ExportService.renderEllipse` |
| `svg/SVGText.tsx`, `TextEditor/` | `renderTextBox` + `inlineTextStyle` |
| `svg/SVGImage.tsx` | `renderImage` |
| `svg/SVGGroup.tsx` | `resolveShapes` / `expandGroup` |
| `utils/groupLayout.ts` `reflowGroups` | `common/rendering/groupLayout.ts` |

Shared logic lives in `packages/common/src/rendering/`. The recurring question
for every finding is: *would the other renderer need the same formula to match?*
If yes, it belongs in `common`, not in one side.

## Process

1. Invoke `render-parity-auditor` with the chosen scope.
2. For every CRITICAL or HIGH finding, name the file in `common/rendering/`
   where the logic should live.
3. Produce the manual comparison — the part that matters:
   - which presentation to open (or what to build: the shapes and the variables
     that exercise the change)
   - which variable values to pass
   - what to look at in the editor
   - the export command, and what to look at in the PDF

```bash
curl -X POST http://localhost:3001/api/export/<id>/pdf \
  -H 'x-api-key: <key>' -H 'content-type: application/json' \
  -d '{"<variable>":"<value>"}' -o /tmp/parity.pdf
```

4. If a divergence is intentional (editor chrome, variable chips, container
   frames), record it as intentional rather than leaving it unremarked.

## Output

```markdown
# Parity audit — <scope>

## Findings
<from render-parity-auditor>

## Intentional differences confirmed
- <...>

## Manual comparison
1. <setup>
2. <editor: expect ...>
3. <export command>
4. <pdf: expect ...>

## Verdict
PASS | DRIFT | BLOCK
```

Never report `PASS` on a visual change without having run, or handed over, the
manual comparison. Reading two files that look consistent is not evidence.

## Related

- Skills: `render-parity`, `pdf-export`, `shape-model`
- Agents: `render-parity-auditor`
- Commands: `/export-debug`, `/review`
