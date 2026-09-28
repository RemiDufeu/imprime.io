---
name: api-surfaces
description: The four surfaces that expose the Imprime domain — REST routes, the SDK client, the MCP tools, and the editor's API wrapper — plus the auth and ownership model, the error contract, and the checklist for adding or changing an endpoint everywhere it must land. Use when touching packages/backend/src/routes, services, mcp, or packages/sdk.
metadata:
  origin: adapted from ECC (github.com/affaan-m/ECC)
---

# API Surfaces

One domain, four consumers. A change that lands on fewer than all of them
leaves a hole that nothing will catch — none of these are cross-checked by a
test, and only the types they share are checked by the compiler.

```
packages/common/src/types.ts   (DTO namespaces)
        │
        ├── backend/src/routes/*         HTTP contract
        ├── backend/src/mcp/tools/*      MCP tools (agents)
        ├── sdk/src/ImprimeClient.ts     typed REST client
        └── frontend/src/api/api.ts      thin wrapper over the SDK
```

`frontend/src/api/api.ts` instantiates one `ImprimeClient` and re-exports it as
`presentationsAPI` / `imagesAPI` / `variablesAPI`. The frontend therefore
consumes the *same* client third parties do — if a method is missing from the
SDK, the editor cannot use it either. That is a feature: it keeps the public
API honest.

## Routes

Mounted in `packages/backend/src/server.ts`, all behind `requireAuth`:

| Mount | Router |
|---|---|
| `/api/presentations` | `presentations.ts`, `slides.ts`, `variables.ts` (three routers, same mount) |
| `/api/export` | `export.ts` |
| `/api/images` | `images.ts` |
| `/api/mcp` | MCP router — **owns its own sessions, outside the `requireAuth` pipeline** |

Public: `/api/health`, `/api/auth-providers`, `/api/auth/*` (better-auth, rate
limited to 20 requests per 15 min), and the two `/.well-known/oauth-*`
discovery endpoints that must stay at the root per RFC 8414 / RFC 9728 for the
Claude web connector to find them.

Handlers are async and **do not try/catch** — Express 5 forwards a rejected
promise to `errorHandler` automatically. Do not reintroduce try/catch just to
build an error response; throw the right error class instead.

## Auth and ownership

Two mechanisms, both resolving to `req.user.id`:

- **Session cookie**, resolved by better-auth (browser);
- **`x-api-key` header**, resolved by `authService.resolveApiKeyOwner`
  (SDK, Claude Code, scripts).

Authentication is not authorization. Every presentation-scoped operation must
also call the ownership check:

```ts
requireOwnsPresentation        // Express middleware, after requireAuth
assertOwnsPresentation(id, ownerId)   // the same check for non-HTTP callers (MCP)
```

It throws **`NotFoundError`, not a 403** — deliberately, so a third party cannot
learn that someone else's presentation exists. Keep that when you add a check.

A route that takes a `:id` presentation param and does not go through
`requireOwnsPresentation` is a vulnerability, not a style issue.

## Error contract

Throw, never hand-build a response:

| Class | Status | Use |
|---|---|---|
| `NotFoundError` | 404 | missing **or** not owned |
| `ValidationError` | 400 | bad input; carries optional `details: string[]` |
| `ConflictError` | 409 | uniqueness violations (e.g. `VARIABLE_NAME_EXISTS`) |
| `AppError` | any | anything else (`exportToPDF` timeout uses 408) |

Each carries an optional machine-readable `code`. Clients branch on the code,
not the message — `VariableSlice.deleteVariable` keys off `VARIABLE_IN_USE`.
When you add a code, it is part of the public contract: give it to the SDK
consumer in the same change.

Unhandled errors are logged and become a bare `500 Internal server error`; the
message is never leaked.

## MCP

`packages/backend/src/mcp/router.ts` implements Streamable HTTP with a session
map, a 30-minute idle timeout and a 5-minute sweep. Tools are registered
per-session in `mcp/tools/index.ts`, **bound to the `ownerId` resolved from the
API key** — the tool closes over the owner, so it cannot be tricked into acting
for someone else by its arguments.

A tool has: a zod `inputSchema` and `outputSchema` with `.describe()` on every
field (that text is what the agent reads), `assertOwnsPresentation` first,
`toolError(...)` on failure rather than a thrown exception, and both
`content` (human-readable) and `structuredContent` (machine-readable) on success.
`exportPresentation.ts` is the reference implementation, including the

Binary results are not returned inline: the PDF goes into `pdfDownloadStore`
and the tool returns a single-use URL with a 10-minute TTL.

## Adding or changing an endpoint

Use `/new-endpoint`. The sites, in order:

1. `packages/common/src/types.ts` — the DTO in the right namespace.
2. `packages/backend/src/models/mappers.ts` — document ↔ DTO, if persisted.
   Never send a Mongoose document straight out; `_id` is an `ObjectId`.
3. `packages/backend/src/services/` — the logic, on an existing singleton or a
   new one wired in `services/index.ts`.
4. `packages/backend/src/routes/` — a thin handler; `requireOwnsPresentation`
   if it is presentation-scoped.
5. `packages/sdk/src/ImprimeClient.ts` — the typed method, in the matching
   `// ===` section.
6. `packages/frontend/src/api/api.ts` — the wrapper, if the editor needs it.
7. `packages/backend/src/mcp/tools/` — a tool, if it is useful to an agent, plus
   registration in `tools/index.ts`.
8. `README.md` — if it changes the documented public API or MCP surface.

## Related

- Skills: `imprime-architecture`, `variable-system`, `editor-store`
- Commands: `/new-endpoint`, `/review`, `/update-docs`
- Agents: `api-surface-reviewer`
