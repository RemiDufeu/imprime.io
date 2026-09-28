---
description: Sync Imprime's documentation with the code — the public REST and MCP surface, environment variables, scripts and the roadmap — generating from the source of truth rather than editing prose by hand.
argument-hint: "[api|env|scripts|roadmap|all] (default all)"
---

# Update Docs

`README.md` is this project's public documentation: it advertises the export
endpoint, the `x-api-key` header, the MCP server and the roadmap. It drifts
silently because nothing checks it.

## Sources of truth

| Source | Documents |
|---|---|
| `packages/backend/src/routes/*` + `server.ts` mounts | the REST surface |
| `packages/backend/src/mcp/tools/*` (tool name, description, zod schemas) | the MCP tools |
| `packages/sdk/src/ImprimeClient.ts` | what an SDK user can do |
| `.env.example` | environment variables |
| root `package.json` scripts | the command reference |
| `packages/common/src/types.ts` | variable types, shape types |
| git log since the last README change | roadmap items that shipped |

## Process

### `api`

1. List every route, with its mount, method, auth requirement and whether it is
   presentation-scoped.
2. Compare against what the README documents. The README currently describes
   `POST https://imprime.io/api/export/{{presentationId}}/pdf` and the
   `x-api-key` header — confirm both still hold.
3. Report undocumented public endpoints and documented endpoints that no longer
   exist. Do not document internal routes that were never meant to be public;
   say which you judged internal and why.

### `mcp`

Read each tool's registered name, description and schema `.describe()` text.
Those strings are what an agent sees, so they *are* the documentation — if they
are stale, fix them at the source rather than describing them differently in
the README.

### `env`

Diff `.env.example` against every `process.env.X` in the codebase. Report
variables that are read but not in the example (a setup trap) and variables in
the example that nothing reads (dead config). `PUBLIC_APP_URL` and
`CORS_ORIGIN` both have runtime validation — note their constraints.

### `scripts`

Regenerate the command table from the root `package.json`. Flag
`npm run lint --workspaces`, which fails because the backend has a lint script
but no eslint config.

### `roadmap`

Compare the README roadmap against what the code now does. Conditional (`if`)
and iteration (`for`) blocks and grouped operations are areas where the code has
moved; check each roadmap bullet against `common/src/types.ts` and the editor
before editing. Move shipped items out of the roadmap into Features; do not
invent new roadmap entries.

## Rules

- Generate from code, never from memory of what the docs used to say.
- Propose the diff and what it is derived from. Do not rewrite the README's
  voice, restructure sections, or "improve" prose that is merely out of date.
- If code and docs disagree about intended behaviour, say so and ask — the code
  is not automatically right.

## Related

- Skills: `api-surfaces`
- Commands: `/new-endpoint`, `/pr`
