---
description: Review the current Imprime changes with the agents that match what the diff touches — code quality, render parity, and API surface — then consolidate into one report.
argument-hint: "[staged|branch|<PR number>] (default: uncommitted changes)"
---

# Review

Routes the diff to the right specialist agents and merges their findings. Each
agent owns a lane, so their findings do not overlap.

## Step 1 — scope the diff

- no argument → `git diff --staged`, falling back to `git diff`
- `branch` → merge base against the real base branch (`main`)
- `<PR number>` → `gh pr view <n> --json baseRefName,mergeStateStatus,statusCheckRollup`,
  then the diff against that base. If checks are red or there are conflicts,
  report that and stop.

Never hard-code a base branch.

## Step 2 — run the gate

Run `/verify`. A red gate is reported first: there is no point reviewing code
that does not compile.

## Step 3 — dispatch

| The diff touches | Run |
|---|---|
| anything under `packages/frontend` or `packages/backend` | `imprime-reviewer` |
| `components/slide/`, `common/src/rendering/`, `ExportService.ts`, fonts, geometry, layout | `render-parity-auditor` |
| `routes/`, `services/`, `models/`, `mcp/`, `packages/sdk/` | `api-surface-reviewer` |

Run every agent that matches — most real changes match two. Run them in
parallel; they are read-only.

## Step 4 — consolidate

One report, grouped by severity across all agents, each finding tagged with the
agent that raised it. Deduplicate only exact duplicates; the agents are scoped
so that a finding appearing twice usually means two different problems.

```markdown
# Review

## Gate
<verify results>

## Findings
[CRITICAL] <title>                              (api-surface-reviewer)
File: path:NN
Issue / Why / Fix

...

## Surfaces
<the api-surface-reviewer table, if it ran>

## Manual checks still required
- <editor vs PDF comparison, if the parity auditor asked for one>

## Verdict
CRITICAL: n · HIGH: n · MEDIUM: n
Block | Warning | Approve
```

Block on any CRITICAL or HIGH. Always carry the manual-check list through —
a green gate plus a clean review still says nothing about what the PDF looks
like.

## Related

- Agents: `imprime-reviewer`, `render-parity-auditor`, `api-surface-reviewer`
- Commands: `/verify`, `/parity`, `/pr`
