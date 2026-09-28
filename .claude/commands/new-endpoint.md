---
description: Add or change an Imprime API capability across all four surfaces — REST route, service, SDK client, editor wrapper and MCP tool — with the auth and error contract applied.
argument-hint: "<capability, e.g. 'duplicate a presentation'>"
---

# New Endpoint

One domain, four consumers. Nothing cross-checks them, so the surfaces are
walked deliberately rather than discovered later.

## Decide first

- **Is it presentation-scoped?** Then it needs `requireOwnsPresentation` (route)
  or `assertOwnsPresentation` (MCP), and an ownership failure is a
  `NotFoundError`, never a 403.
- **Should an agent be able to do it?** If yes, it needs an MCP tool, not just a
  route.
- **Does the editor need it?** If yes, it goes through the SDK — the editor
  consumes the same client third parties do.

## Sites, in order

### 1. `packages/common/src/types.ts`
The DTO, in the matching namespace (`PresentationDTO`, `SlideDTO`,
`VariableDTO`, `ImageDTO`, `ExportDTO`). Never type a route body inline.

### 2. `packages/backend/src/models/mappers.ts`
Document ↔ DTO, if it persists. A Mongoose document must never be sent
directly: `_id` is an `ObjectId`, the DTO says `string`.

### 3. `packages/backend/src/services/`
The logic, on an existing singleton — or a new service wired into
`services/index.ts` with constructor injection, never `new`-ed at a call site.
Throw `NotFoundError` / `ValidationError` / `ConflictError` / `AppError` with a
machine-readable `code`; never build an error response by hand.

### 4. `packages/backend/src/routes/`
A thin handler: parse params, call one service, respond. No try/catch — Express 5
forwards rejections to `errorHandler`. Add `requireOwnsPresentation` if scoped.
If it needs a new mount, add it in `server.ts` **inside** the `requireAuth`
pipeline.

### 5. `packages/sdk/src/ImprimeClient.ts`
The typed method, in the matching `// ===` section.

### 6. `packages/frontend/src/api/api.ts`
The wrapper on `presentationsAPI` / `imagesAPI` / `variablesAPI`, if the editor
uses it. Store slices call these, never `fetch`.

### 7. `packages/backend/src/mcp/tools/`
If useful to an agent: zod `inputSchema` and `outputSchema` with `.describe()`
on every field, `assertOwnsPresentation` first, `toolError(...)` on failure
instead of throwing, both `content` and `structuredContent` on success, then
register it in `tools/index.ts`. Never accept an owner id as an argument — the
tool closes over the `ownerId` from the API key. Large binaries go through
`pdfDownloadStore` as a single-use URL.

### 8. `README.md`
If it changes the publicly documented API or MCP surface.

## Close with

```
| Capability | REST | SDK | MCP | Editor | README |
|---|---|---|---|---|---|
```

Stating "not applicable, because ..." for each surface you skipped. Then
`/verify` and `/review` (which runs `api-surface-reviewer`).

## Related

- Skills: `api-surfaces` (the cross-surface contract), `backend-routes` (handler
  anatomy), `backend-services` (the logic layer), `backend-persistence` (mapping
  rules), `backend-structure`
- Agents: `api-surface-reviewer`, `imprime-architect`
- Commands: `/feature`, `/verify`, `/review`, `/update-docs`
