---
description: Create, verify or list a work checkpoint — a named, gate-verified point you can compare against or return to.
argument-hint: "[create|verify|list] [name]"
---

# Checkpoint

A lightweight marker for long-running work. Because there are no tests here, a
checkpoint records the **gate state** and the diff shape, not a coverage number.

## `create <name>`

1. Run `/verify`. If the gate is red, say so and ask whether to checkpoint
   anyway — a checkpoint on a broken build is sometimes what you want, but never
   silently.
2. Record the point:
   ```bash
   mkdir -p .claude/local
   echo "$(date +%Y-%m-%d-%H:%M) | <name> | $(git rev-parse --short HEAD) | <gate: PASS|FAIL> | $(git status --porcelain | wc -l) dirty" \
     >> .claude/local/checkpoints.log
   ```
3. If the working tree is dirty, offer a `git stash push -m "checkpoint: <name>"`
   or a WIP commit on the current branch. Never commit without being asked, and
   never commit on `main`.
4. Report the name, the sha and the gate state.

## `verify [name]`

Compare now against the checkpoint (most recent if unnamed):

```bash
git diff --stat <sha>..HEAD
git diff --name-only <sha>..HEAD
```

Then run `/verify` and report:

```
CHECKPOINT: <name>  (<sha>, <when>)
Files changed since: n
Gate then: PASS    Gate now: FAIL
Regressions: <the steps that passed then and fail now>
```

Call out specifically whether a change since the checkpoint touched a render
path — that is the drift the gate cannot see.

## `list`

Print `.claude/local/checkpoints.log`, newest first, with each entry's gate
state.

## Note

`.claude/local/` is for machine-local state. Add it to `.gitignore` if it is not
there — checkpoints are yours, not the repository's.

## Related

- Commands: `/verify`, `/save-session`, `/pr`
