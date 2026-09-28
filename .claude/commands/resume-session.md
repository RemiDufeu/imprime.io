---
description: Load the most recent saved session file, re-orient in the current repository state, and continue where the last session stopped.
argument-hint: "[YYYY-MM-DD | path]"
---

# Resume Session

The counterpart to `/save-session`. Orient fully **before** doing any work.

## Step 1 — find the file

- no argument → the newest `.claude/local/sessions/*-session.md`
- a date → the newest file for that date
- a path → exactly that file, with no substitution

If there is none:

```
No session files in .claude/local/sessions/
Run /save-session at the end of a session to create one.
```

and stop.

## Step 2 — read it, then check it against reality

A session file records what *was* true. Verify before trusting:

```bash
git branch --show-current      # same branch?
git log --oneline -5           # new commits since?
git status --porcelain         # same working tree?
```

Run `/verify` rather than believing the recorded gate state — the environment
may have changed, and `common`/`sdk` may need rebuilding.

Report any divergence between the file and the repository explicitly. A file
that says "in progress in X.ts" when X.ts is committed and clean means someone
else, or a later session, moved on.

## Step 3 — re-orient

State back, in a few lines:

- the branch and its goal
- what is done, what is half-done and where
- the gate state **as measured now**
- what was never verified (PDF output, editor behaviour)
- open questions and dead ends, so they are not re-explored

## Step 4 — continue

Pick up at the session file's "Next", adjusted for anything that changed. Do not
redo completed work; do not start something new without saying so.

## Related

- Commands: `/save-session`, `/verify`, `/checkpoint`
