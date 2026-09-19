---
description: Run the Imprime quality gate — build common and sdk, typecheck backend and frontend, lint — in the order the dependency graph requires, and report failures with the fix.
argument-hint: "[quick|full] (default full)"
---

# Verify

This repository has no tests. The build and the type checker are the entire
safety net, and this command runs exactly what CI runs
(`.github/workflows/ci.yml`), plus lint.

## The gate

```bash
export NODE_OPTIONS=--max-old-space-size=6144
npm run build:common
npm run build:sdk
npm run typecheck --workspace=@imprime/backend
npm run typecheck --workspace=@imprime/frontend
npm run lint --workspace=@imprime/frontend     # advisory, see below
```

`quick` runs the two builds and the typecheck of whichever workspace the diff
touches. `full` (default) runs everything above.

### Three things that will trip you up

**Heap size is not optional.** Without
`NODE_OPTIONS=--max-old-space-size=6144` the backend typecheck aborts with
`FATAL ERROR: Ineffective mark-compacts near heap limit — JavaScript heap out of
memory`. That is a crash, not a type error; do not start reading the code for a
cause. CI sets the same value as a job-level env var.

**Order is not optional.** `backend` and `frontend` typecheck against the
**emitted** `.d.ts` of `common` and `sdk`. Typechecking first yields
`Cannot find module '@imprime/common'`, which means a stale build.

**Lint is advisory.** It is not in CI, and the frontend currently reports 11
errors and 1 warning that predate any given change — mostly unused `err`
bindings in `catch` blocks (`PresentationSlice`, `SlideSlice`, `VariableSlice`),
two `no-explicit-any`, and one `exhaustive-deps` warning in `HomePage`. So the
bar is **no new findings**, not zero findings: compare against
`git stash`-ed baseline output if in doubt, and never "fix" the pre-existing
ones as a side effect of unrelated work.

Do **not** run `npm run lint --workspaces`: the backend declares a `lint` script
but ships no eslint config, so it always fails.

## Process

1. Run each step in order, stopping at the first failure.
2. On failure, read the actual error before reporting. Classify it:
   - `JavaScript heap out of memory` → missing `NODE_OPTIONS`, not a code problem
   - `Cannot find module '@imprime/...'` → stale build, re-run the build step
   - a type error in `common` → it will cascade; fix there first
   - a frontend error mentioning a `Shape` member → a union member was added
     without updating every dispatcher (skill `shape-model`)
   - a lint finding → check whether it is one of the pre-existing ones above
3. Report per step: PASS / FAIL, and for failures the file, line and the
   concrete fix.
4. Close with the gap this gate does **not** cover, whenever the diff touches
   rendering or export:

```
Not covered by this gate:
- <the visual behaviour that needs a generated PDF or an editor check>
```

## Output

```
Build common      PASS
Build sdk         PASS
Typecheck backend PASS
Typecheck frontend FAIL — packages/frontend/src/.../X.tsx:42
  <error>
  Fix: <...>
Lint frontend     not run (stopped at first failure)

Gate: FAIL
```

Report lint as `n new / 11 pre-existing` rather than a bare pass/fail.

## Related

- Skills: `imprime-architecture`
- Commands: `/review`, `/checkpoint`, `/pr`
