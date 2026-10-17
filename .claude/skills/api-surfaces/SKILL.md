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
`templatesAPI` / `imagesAPI` / `fontsAPI` / `variablesAPI`. The frontend therefore
consumes the *same* client third parties do — if a method is missing from the
SDK, the editor cannot use it either. That is a feature: it keeps the public
API honest.

## Routes

Mounted in `packages/backend/src/server.ts`, all behind `requireAuth`:

| Mount | Router |
|---|---|
| `/api/templates` | `templates.ts`, `pages.ts`, `variables.ts` (three routers, same mount) |
| `/api/templates` | `templates.ts` also serves `GET /:id/file` and `POST /import` (template files, 50 MB body parsed after auth), and `POST /:id/duplicate` (`TemplateFileService.duplicate`: new ids, the same images, none re-uploaded); `previews.ts`' `templatePreviewsRouter` serves `POST /:id/previews` |
| `/api/export` | `export.ts` — `/:id/pdf`, and `/code/:code/pdf` by the template's code, looked up among the caller's own |
| `/api/previews` | `previews.ts` — `GET /:id`, `POST /:id/pdf`, behind `requireOwnsPreview` (the preview's owner and its template's) |
| `/api/images` | `images.ts` — the uploader's own images (`Image.ownerId`), 500 MB each |
| `/api/oauth-consent` | `oauthConsent.ts` — the pending OAuth authorization the consent page shows, to the user it was asked of |
| `/api/fonts` | `fonts.ts` — instance-wide; reads open, writes behind `requireAdmin` |
| `/api/settings` | `settings.ts` — instance settings (`/email`, `/email/test`, `/sso`, `/sso/:provider`, `/access`); reads and writes behind `requireAdmin`; no MCP tool, deliberately: instance configuration, not a document operation |
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

Authentication is not authorization. Every template-scoped operation must
also call the ownership check:

```ts
requireOwnsTemplate        // Express middleware, after requireAuth
assertOwnsTemplate(id, ownerId)   // the same check for non-HTTP callers (MCP)
```

It throws **`NotFoundError`, not a 403** — deliberately, so a third party cannot
learn that someone else's template exists. Keep that when you add a check.

A route that takes a `:id` template param and does not go through
`requireOwnsTemplate` is a vulnerability, not a style issue.

Some resources belong to the **instance**, not to a user: imported fonts and
the instance settings (email, single sign-on). Every authenticated user reads the fonts; only
admins read the settings or change either, through `requireAdmin`
(`middleware/requireAdmin.ts`), which answers **403 `ADMIN_REQUIRED`** — not
404, since nothing about their existence is secret. The role is better-auth's
(`admin` plugin, `user.role`) and is read from the database on each check, so
it holds for API keys as for sessions. The account of `ADMIN_EMAIL` — one
address — is promoted at startup and at every sign-in, by password or single
sign-on (`AuthService.promoteConfiguredAdmin` and the `session.create` hook),
**only once its address is verified**. It is created by
`npm run admin:reset-password` (address verified: the operator vouches) or by
a provider vouching for the address; a password sign-up with it is refused
(`ADMIN_ADDRESS_RESERVED`), or the first to sign up would claim the role. The
role stays in the database when `ADMIN_EMAIL` changes:
`npm run admin:demote-others` takes it from every other account.

API keys and MCP tokens never meet the session hooks, so
`resolveApiKeyOwner` / `resolveMcpBearerOwner` apply the domain list
themselves: a new credential type must too.

## Error contract

Throw, never hand-build a response:

| Class | Status | Use |
|---|---|---|
| `NotFoundError` | 404 | missing **or** not owned |
| `ForbiddenError` | 403 | authenticated but lacking a role (`ADMIN_REQUIRED`); never for owned resources |
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
map, a 30-minute idle timeout, a 5-minute sweep and at most 10 sessions per
owner (the oldest is closed). Tools are registered per-session in
`mcp/tools/index.ts`, **bound to the `ownerId` resolved from the Bearer token
or API key** — the tool closes over the owner, so it cannot be tricked into
acting for someone else by its arguments. **Every request re-resolves its
credentials** and must match the session's owner: a session id alone is no
credential, and a revoked key or an expired token ends the sessions it opened
(401, or 404 for someone else's session).

The OAuth flow interactive clients use (`/api/auth/mcp/*`, better-auth's MCP
plugin) lets anyone register a client, anonymously, with any redirect URI —
MCP clients need it. `server.ts` therefore forces `prompt=consent` on
`/mcp/authorize`, without which the plugin sends the code straight to the
redirect URI; the consent page shows where the access goes from
`GET /api/oauth-consent/:code` (`AuthService.getOAuthConsent`), never from its
own URL.

The tools cover the whole authoring loop, one file per resource under
`mcp/tools/` (`templates`, `pages`, `variables`, `shapes`, `assets`, plus
`previewTemplate`): an agent can create a template, declare its variables, draw
its pages and preview it. A tool has: a zod `inputSchema` with `.describe()` on
every field (that text is what the agent reads), `assertOwnsTemplate` first,
`toolError(errorMessage(err))` on failure rather than a thrown exception, and a
text result an agent can act on — plus an `outputSchema` and `structuredContent`
when it creates something, so the new ids need no parsing out of prose (only
`preview_template` returns them for anything else). `annotations` say which tools only read and
which destroy (`destructiveHint`), so a client knows what to confirm.
`errorMessage` passes on an `AppError`'s message, code and `details` — how an
agent learns which reference or field to fix — and logs anything else as an
internal error, as the REST error handler does.

**The domain's zod mirror is `mcp/schemas.ts`**, the only validation a shape
gets (pages store `shapes` as Mixed). Each object is written
`z.object({...} satisfies SchemaShape<T>)`, so a field added to or removed from
a type in `common` fails the typecheck there; enums go through `enumOf`, which
asks for every member. Reuse its schemas in a tool rather than writing another.
**`MCP_INSTRUCTIONS`** (`mcp/instructions.ts`) is the authoring guide every
client receives on connecting: how the pieces combine, which no field schema says.

Shape edits go through `PageService.editShapes`, never a read and a separate
`update`: it queues edits per page (an agent's parallel calls would otherwise
lose writes), fills blank shape ids, refuses duplicates and image ids the owner
has no image for (`IMAGE_NOT_FOUND`, which would export as a blank box), and
runs `layoutTree` as the editor's write path does. The page rules live in
`PageService` for every surface: `move`, and `delete` refusing the last page
(`LAST_PAGE`, which the editor never offers). The editor does not reload, so a page edited
over MCP while open in the editor is overwritten by its next save.

The one binary an agent gets inline is a look at its work: `preview_template`
returns PNG images of the PDF's pages (`seePages`, first 3 by default, 10 at
most), drawn from the real PDF by pdf.js on `@napi-rs/canvas`
(`services/pdfRaster.ts`, `ExportService.exportPageImages`, under a render
slot). The PDF itself is not returned inline: `preview_template` stores a preview
(`Preview`, a TTL-indexed collection, 24 h) and returns the editor's page for
it (`getPreviewPath`, under `PUBLIC_APP_URL`). The owner opens it signed in —
`RequireAuth` sends them back to it after login — and prints from there.
Template files (export/import) have no tool, deliberately: a file holds its
images in base64, megabytes in an agent's context, and `get_template` /
`set_page_shapes` already read and write a whole template. `duplicate_template`
copies one on the server instead, nothing passing through the agent.

## Adding or changing an endpoint

Use `/new-endpoint`. The sites, in order:

1. `packages/common/src/types.ts` — the DTO in the right namespace.
2. `packages/backend/src/models/mappers.ts` — document ↔ DTO, if persisted.
   Never send a Mongoose document straight out; `_id` is an `ObjectId`.
3. `packages/backend/src/services/` — the logic, on an existing singleton or a
   new one wired in `services/index.ts`.
4. `packages/backend/src/routes/` — a thin handler; `requireOwnsTemplate`
   if it is template-scoped.
5. `packages/sdk/src/ImprimeClient.ts` — the typed method, in the matching
   `// ===` section.
6. `packages/frontend/src/api/api.ts` — the wrapper, if the editor needs it.
7. `packages/backend/src/mcp/tools/` — a tool in its resource's file, if it is
   useful to an agent, with schemas from `mcp/schemas.ts` (a new domain type
   gets its mirror there first).
8. `README.md` — if it changes the documented public API or MCP surface.

## Related

- Skills: `imprime-architecture`, `variable-system`, `editor-store`
- Commands: `/new-endpoint`, `/review`, `/update-docs`
- Agents: `api-surface-reviewer`
