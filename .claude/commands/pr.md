---
description: Prepare a pull request for Imprime — verify the gate, run the review agents, then write a description that says what a reviewer must check by hand.
argument-hint: "[title]"
---

# PR

CI runs on every pull request and on pushes to `develop`:
build `common`, build `sdk`, typecheck backend, typecheck frontend. Nothing
else. A green PR therefore proves compilation and nothing about behaviour —
which is exactly what the description has to compensate for.

## Process

### 1. Check the branch

```bash
git branch --show-current
git log --oneline <base>..HEAD
git status --porcelain
```

Never open a PR from `main`. If the work is on `main`, branch first and say so.
Confirm the intended base (`main`, or `develop` if that is where this stream
lands) rather than assuming.

### 2. Run the gate

`/verify`, in full. If it is red, stop — CI will fail identically.

### 3. Review

`/review`, which dispatches to `imprime-reviewer`, `render-parity-auditor` and
`api-surface-reviewer` according to what changed. Resolve CRITICAL and HIGH
findings, or state in the PR why each is deliberate.

### 4. Write the description

```markdown
## What

<the change in domain terms — shapes, variables, slides, surfaces — not a file list>

## Why

<the problem, or the roadmap item>

## Surfaces touched

| Surface | Changed | Note |
|---|---|---|
| Editor | | |
| PDF export | | |
| REST / SDK | | |
| MCP | | |

## Verified

- Gate: build common, build sdk, typecheck backend, typecheck frontend, lint frontend
- <anything else actually run>

## Needs manual review

- <the editor-vs-PDF comparison, with the presentation and variable values to use>
- <anything a reviewer must look at rather than read>

## Backward compatibility

<what happens to presentations saved before this change; "none needed" is an answer>
```

The **Needs manual review** section is the point of this command. In a repository
with no tests, a PR that does not say what to look at is asking for a rubber
stamp.

### 5. Open it

Only on request, and with `gh pr create --base <base>`. Confirm the base and the
title before pushing anything.

## Related

- Commands: `/verify`, `/review`, `/parity`, `/update-docs`
