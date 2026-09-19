# Imprime — repository guide

Imprime turns a visually-designed template into a generated PDF. A user places
shapes and variables on 1920×1080 slides in a browser editor; a backend renders
the same slides to PDF, substituting runtime data.

That double life — **the same document drawn twice, by two different renderers**
— is the axis everything else turns around. Read `.claude/skills/render-parity`
before touching anything visual.

## Packages

`npm` workspaces under `packages/`. Dependency order is strict:

```
common  →  sdk  →  frontend
   └───────────→  backend
```

| Package | Role |
|---|---|
| `@imprime/common` | Domain types + **shared rendering logic**. Depends on nothing. |
| `@imprime/sdk` | REST client for the public API. Re-exports all of `common`. |
| `@imprime/backend` | Express API, MongoDB/Mongoose, better-auth, MCP server, PDF export. |
| `@imprime/frontend` | React 19 + Vite + antd editor, Zustand store, SVG renderer. |

Import convention, not enforced by tooling but consistent throughout:
**backend imports domain types from `@imprime/common`, frontend from
`@imprime/sdk`** (which re-exports `common`). Keep it that way.

## Verification gate

There are **no tests and no test runner** in this repository. The whole safety
net is the type system plus lint, which is exactly what CI runs
(`.github/workflows/ci.yml`, on every PR and on push to `develop`):

```bash
export NODE_OPTIONS=--max-old-space-size=6144   # not optional, see below
npm run build:common      # common must be built before anything typechecks
npm run build:sdk
npm run typecheck --workspace=@imprime/backend
npm run typecheck --workspace=@imprime/frontend
npm run lint --workspace=@imprime/frontend      # advisory: not in CI, currently red
```

**`NODE_OPTIONS=--max-old-space-size=6144` is required.** Without it the backend
typecheck dies with `JavaScript heap out of memory` on the default heap — a
crash, not a type error. CI sets it as a job-level env var for the same reason.

Lint is **not** in CI and is currently failing (11 errors, mostly unused `err`
bindings in `catch` blocks, plus two `any`). Treat it as "no new errors",
not "green".

Run `/verify` rather than remembering any of this. Because typecheck is the only
gate, treat `any`, `as` casts and `@ts-ignore` as holes punched straight through
the safety net — each one needs a comment saying why (see
`packages/backend/src/mcp/tools/exportPresentation.ts` for the form: a link to
the upstream issue and a recheck condition).

The export path has no static safety at all — `@react-pdf/renderer` accepts
styles it silently ignores. A change to `ExportService` is verified by
generating a PDF, never by typecheck alone.

## Invariants

1. **Render parity.** A visual feature exists in the editor (`packages/frontend/src/components/slide/svg/`)
   *and* in the export (`packages/backend/src/services/ExportService.ts`). Shared
   geometry, layout and resolution logic belongs in `packages/common/src/rendering/`
   so the two cannot drift. → skill `render-parity`
2. **The editor shows the authored tree; the export shows the resolved tree.**
   `resolveShapes()` is called only by `ExportService`. Containers stay nested in
   the editor, conditions are not evaluated, `for-group`s are not repeated.
   → skill `shape-model`
3. **One definition of variable semantics.** `resolveVariable`,
   `isEmptyVariableValue` and `stringifyVariableValue` in
   `packages/common/src/rendering/variables.ts` are the only place that decides
   what a variable evaluates to. → skill `variable-system`
4. **Four surfaces expose one domain.** REST routes, the SDK client, the MCP
   tools and the editor store all speak `common/types.ts`. A domain change that
   lands on fewer than four leaves a hole. → skill `api-surfaces`
5. **Ownership is checked per presentation, and denied as `NotFoundError`.**
   `assertOwnsPresentation` — never disclose that someone else's presentation
   exists. Every presentation-scoped route and MCP tool goes through it.
   Services trust their caller; the guard is in the middleware, so a new
   non-HTTP entry point must assert it itself. → skill `backend-services`
6. **Store state is immutable.** Shape-tree helpers in
   `packages/frontend/src/utils/shapeTree.ts` rebuild the branches they touch;
   never mutate a shape in place. → skill `editor-store`
7. **The React Compiler is enabled** (`babel-plugin-react-compiler`, in
   `vite.config.ts`). Do not add `useMemo`/`useCallback`/`React.memo` for
   performance — the compiler does it, and a component that mutates during
   render silently opts itself out. → skill `frontend-stack`
8. **No hardcoded visual constants.** Colours, borders, radii and shadows come
   from antd's `var(--ant-*)` CSS variables; spacing from the local
   `var(--space-*)` scale in `src/index.css`. Brand changes go in
   `src/config/antd-theme.ts`. → skill `frontend-styling`

## Harness

`.claude/` holds this project's agents, skills and commands. `.claude/README.md`
lists them. Start with `/verify`, `/parity`, `/feature`, `/new-shape`.

Frontend work is covered by four skills: `frontend-stack` (the libraries and
their configuration), `frontend-structure` (where files go), `frontend-styling`
(CSS and tokens) and `editor-store` (the Zustand slice decomposition).

Backend work by five: `backend-stack` (libraries and config), `backend-structure`
(the route → service → model layering), `backend-routes` (how to write a
handler), `backend-services` (the service layer) and `backend-persistence`
(schemas and the document ↔ DTO mapping rules).
