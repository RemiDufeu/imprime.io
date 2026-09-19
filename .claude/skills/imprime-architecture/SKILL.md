---
name: imprime-architecture
description: Map of the Imprime monorepo — package boundaries and dependency order, where each concern lives, the build/typecheck gate that stands in for a test suite, and the conventions a change is expected to follow. Use when orienting in the codebase, deciding where new code belongs, or when a build/typecheck fails for structural reasons.
metadata:
  origin: adapted from ECC (github.com/affaan-m/ECC)
---

# Imprime Architecture

## Package graph

```
packages/common   types + shared rendering      (no dependencies)
      │
      ├──────────────► packages/sdk       REST client, re-exports common
      │                      │
      │                      └──────────► packages/frontend   React editor
      │
      └──────────────────────────────────► packages/backend   Express + PDF + MCP
```

`common` and `sdk` are compiled with `tsc` to `dist/`. **They must be built
before backend or frontend typecheck**, because both consume the emitted `.d.ts`.
A typecheck failure that says `Cannot find module '@imprime/common'` means a
stale or missing build, not a real error — run `npm run build:common`.

## Where things live

| Concern | Location |
|---|---|
| Domain types, DTO namespaces | `packages/common/src/types.ts` |
| Shared geometry / layout / resolution | `packages/common/src/rendering/` |
| Fonts (shared registry) | `packages/common/src/fonts.ts`, `packages/common/src/assets/fonts/` |
| REST client | `packages/sdk/src/ImprimeClient.ts` |
| HTTP wiring, CORS, helmet, rate limit | `packages/backend/src/server.ts` |
| Route handlers (thin) | `packages/backend/src/routes/` |
| Business logic | `packages/backend/src/services/` |
| Mongoose schemas | `packages/backend/src/models/` |
| Document ↔ DTO conversion | `packages/backend/src/models/mappers.ts` |
| Auth / ownership middleware | `packages/backend/src/middleware/` |
| MCP server and tools | `packages/backend/src/mcp/` |
| Editor state (Zustand slices) | `packages/frontend/src/store/editor/` |
| SVG renderer | `packages/frontend/src/components/slide/svg/` |
| Shape tree manipulation | `packages/frontend/src/utils/shapeTree.ts` |
| Editor UI (toolbars, panels) | `packages/frontend/src/pages/EditorPage/` |

## Backend layering

`route → service → model`, and nothing skips a level.

- **Routes** parse params, call one service, set headers. No Mongoose, no
  business rules. See `packages/backend/src/routes/export.ts` for the target
  size of a handler.
- **Services** are instantiated once with constructor injection in
  `packages/backend/src/services/index.ts` and exported as singletons. A new
  service is added there, not `new`-ed at a call site.
- **Errors** are thrown, never returned: `NotFoundError`, `ValidationError`,
  `ConflictError`, `AppError` from `services/errors.js`. The `errorHandler`
  middleware (registered last in `server.ts`) maps them to responses. A route
  that try/catches to build its own error response is doing the middleware's job.
- **Mappers** convert Mongoose documents to DTOs. A route must never send a
  document straight out — `_id` is an `ObjectId`, and the DTO contract says
  `string`.

## Verification, without tests

This repository has no test files and no test runner. CI
(`.github/workflows/ci.yml`) runs exactly:

```bash
npm ci
npm run build:common
npm run build:sdk
npm run typecheck --workspace=@imprime/backend
npm run typecheck --workspace=@imprime/frontend
```

with `NODE_OPTIONS: --max-old-space-size=6144` set for the whole job. That flag
is load-bearing: on the default heap the backend typecheck aborts with
`FATAL ERROR: Ineffective mark-compacts near heap limit`. Reproduce the gate
locally with the same variable, or you will chase a crash that is not a type
error.

Consequences worth internalising:

- **Types are the test suite.** Prefer a discriminated union or an exhaustive
  `switch` over a runtime check, because only the former is actually verified.
  When you add a member to the `Shape` union, the compiler finds every site that
  must change — that is the mechanism that keeps the four surfaces in sync, and
  it only works if the code does not paper over it with `as` or `default:`.
- **Lint runs nowhere in CI, and is currently red.** `packages/backend` has a
  `lint` script but no eslint config, so `npm run lint --workspaces` always
  fails; use `npm run lint --workspace=@imprime/frontend`. That reports 11 errors
  and 1 warning on the current code — unused `err` bindings in `catch` blocks,
  two `no-explicit-any`, one `exhaustive-deps`. The working rule is **no new
  findings**; clearing the backlog is its own change, not a side effect.
- **Anything visual needs a human or a generated artifact.** A green typecheck
  says nothing about whether the PDF looks like the editor.

## Conventions

- ESM everywhere (`"type": "module"`). Backend and common imports carry the
  `.js` extension on relative paths, even from `.ts` sources — required by
  `nodeNext` resolution. Frontend (bundled by Vite) does not.
- Backend imports domain types from `@imprime/common`; frontend from
  `@imprime/sdk`.
- Comments explain *why*, and are used sparingly but deliberately —
  `packages/common/src/types.ts` and `shapeResolver.ts` are the house style:
  a comment earns its place by recording a decision or a trap, not by restating
  the line below it. Match that density.
- No Prettier config, no formatter in CI. Match the surrounding file: 4-space
  indent and no semicolons in most of the frontend, 2-space in common/backend.
  Do not reformat lines you did not otherwise change.

## Related

- Skills: `render-parity`, `shape-model`, `variable-system`, `editor-store`,
  `api-surfaces`, `pdf-export`
- Commands: `/verify`, `/feature`, `/new-shape`, `/new-endpoint`
- Agents: `imprime-explorer`, `imprime-architect`
