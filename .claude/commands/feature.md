---
description: Guided feature development for Imprime — explore the existing code, design across packages and surfaces, implement, then verify and review.
argument-hint: "<feature description>"
---

# Feature

A structured workflow for non-trivial changes. Its purpose is to stop
implementation from starting before the cross-package shape of the change is
known — in this repo a feature usually lands in four to eight files across three
packages, and discovering that halfway through is how drift gets introduced.

## Phases

### 1. Understand

Restate the request in domain terms (shapes, variables, slides, surfaces).
Identify acceptance criteria. Ask now if the request is ambiguous about
behaviour, not later.

### 2. Explore

Invoke `imprime-explorer` on the area involved. You need, before designing:

- the domain type it hangs off in `packages/common/src/types.ts`
- both render paths, and what is already shared in `common/rendering/`
- the write path through the store and the API
- which of the four surfaces already expose it

### 3. Clarify

Present what exploration found, then ask the design questions it raised —
typically: does this need to appear in the PDF, does it need to be reachable
from the SDK or MCP, what should happen to presentations saved before the
change. Wait for answers.

### 4. Design

Invoke `imprime-architect`. Expect a blueprint with package placement, an
ordered site list (common → sdk → backend → frontend, so the build stays green),
a surface table, backward compatibility, and what is verifiable by the compiler
versus what needs a generated PDF.

**Present the blueprint and wait for approval before implementing.**

### 5. Implement

Follow the approved site order. While implementing:

- put anything both renderers need in `packages/common/src/rendering/`
- extend the union and let the compiler enumerate the sites; do not suppress it
- new optional fields carry the legacy behaviour as their unset meaning, with a
  comment saying so (shapes persist as `Mixed`; old documents must still render)
- match the surrounding file's formatting; do not reformat untouched lines

Run `/verify` as you go, not only at the end.

### 6. Verify and review

- `/verify` — the full gate
- `/review` — dispatches to the reviewer agents that match the diff
- `/parity` — if anything visual changed, including the manual comparison

### 7. Summarise

What was built, which files, which surfaces moved and which deliberately did
not, what still needs a human check in the editor and the PDF, and any follow-up
left undone.

## Related

- Agents: `imprime-explorer`, `imprime-architect`, `imprime-reviewer`
- Commands: `/verify`, `/review`, `/parity`, `/new-shape`, `/new-endpoint`
