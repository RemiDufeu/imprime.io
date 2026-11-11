---
description: Write the current session's state — what was built, what broke, what is left, and the Imprime-specific context needed to resume — to a dated file.
argument-hint: "[short-id]"
---

# Save Session

Capture enough that a fresh session can continue without re-deriving anything.
Written for a reader with no memory of this conversation.

## When

- End of a work session
- Before starting a fresh context on the same task
- After solving something non-obvious that is not yet committed

## Process

### 1. Gather

- `git status --porcelain`, `git diff --stat`, `git log --oneline -10`
- the current branch and what it is for
- the state of the gate (`/verify`) — do not guess, run it
- what was attempted and abandoned, and why

### 2. Write

`.claude/local/sessions/YYYY-MM-DD-<short-id>-session.md`, short-id being
lowercase letters/digits/hyphens, 8+ characters to avoid same-day collisions.

```bash
mkdir -p .claude/local/sessions
```

### 3. Content

```markdown
# Session <date> — <one-line topic>

## Branch
<branch> — <what it is for> — base: <base branch>

## Goal
<what this work is meant to achieve, in domain terms>

## Done
- <change> → <files>

## In progress
- <what is half-written, in which file, and what the next edit is>

## Gate
Build common / sdk: <state>
Typecheck backend / frontend: <state>
Lint frontend: <state>
<if red: the exact error and where it is>

## Not verified
- <anything needing a generated PDF or an editor check that was not done>

## Decisions
- <decision> — because <reason>
- <alternative rejected> — because <reason>

## Dead ends
- <what was tried and did not work, so it is not tried again>

## Open questions
- <what needs a human answer>

## Next
1. <concrete next action>
```

### 4. Report

Print the file path. If anything is uncommitted, say so explicitly — the session
file is not a substitute for a commit.

## Note

`.claude/local/` holds machine-local state; add it to `.gitignore` if it is not
there.

## Related

- Commands: `/resume-session`, `/checkpoint`, `/verify`
