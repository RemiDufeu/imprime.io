---
name: backend-routes
description: How to write an Imprime route handler — the router-per-resource layout and mounting, the three-to-six line handler anatomy, guard order, status-code and response-shape conventions, why there is no try/catch, and the honest state of request validation. Use when adding or changing anything under packages/backend/src/routes or the mounts in server.ts.
metadata:
  origin: adapted from ECC (github.com/affaan-m/ECC)
---

# Routes (controllers)

A route handler in this codebase is three to six lines. It reads the request,
calls **one** service, and shapes the response. Everything else belongs
somewhere else.

```ts
router.post('/:id/variables', requireOwnsPresentation, async (req, res) => {
  const data: VariableDTO.Create = req.body
  const variables = await variableService.create(req.params.id, data)
  res.status(201).json({ variables })
})
```

If a handler grows a conditional, a second service call, or a loop, that logic
belongs in the service.

## File and mount layout

One `Router` per resource file, `export default router`, mounted in `server.ts`:

```ts
app.use('/api/presentations', requireAuth, presentationsRouter)
app.use('/api/presentations', requireAuth, slideRouter)
app.use('/api/presentations', requireAuth, variablesRouter)
app.use('/api/export',        requireAuth, exportRouter)
app.use('/api/images',        requireAuth, imagesRouter)
```

**Three routers share the `/api/presentations` mount.** That is why
`slides.ts` and `variables.ts` declare paths like `/:id/slides/:slideId` rather
than `/:slideId` — the parent segment is part of their own path, not the mount.
Split by resource, not by URL prefix, and keep the full sub-path in the router.

`requireAuth` is applied **at the mount**, never inside a handler. A new router
goes inside that pipeline; putting one outside it needs a stated reason
(`/api/mcp` is the single deliberate exception — it authenticates per session).

## Guard order

```
mount:    requireAuth               → sets req.user, or 401
handler:  requireOwnsPresentation   → 404 if req.user does not own :id
```

Every route with a presentation `:id` carries `requireOwnsPresentation`, before
the handler function. Authentication is not authorization — `requireAuth` only
proves *someone* is signed in.

The guard throws `NotFoundError`, not 403, so a third party cannot learn that
someone else's presentation exists. Preserve that.

After `requireAuth`, `req.user` is non-null; handlers write `req.user!.id`.
The `!` is the convention here, not an oversight — the type is optional because
the augmentation in `types/express.d.ts` applies to every request.

## No try/catch

Express 5 forwards a rejected promise from an async handler to the error
middleware. Services throw `NotFoundError` / `ValidationError` / `ConflictError` /
`AppError`; `errorHandler` (registered last in `server.ts`) turns them into
`{ code, error, details? }` with the right status.

A `try/catch` in a route that only builds an error response is reimplementing
that middleware — and worse, it usually loses the `code` the client branches on.

## Request bodies, honestly

```ts
const data: VariableDTO.Create = req.body
```

This is a **compile-time annotation over `any`**. It documents intent and gets
you autocomplete; it validates nothing. There is no zod, no celebrate, no
express-validator on any REST route — zod appears only in the MCP tools, where
the schema doubles as the agent's documentation.

What actually stands between a request body and the database:

1. **The update mappers' field-by-field whitelist**, which is why they must not
   be "simplified" into a spread. → skill `backend-persistence`
2. **Service-level checks** where they exist — `SlideService.validateVariableReferences`,
   `ImageService.upload`'s required-field check, `VariableService`'s uniqueness
   and in-use guards.
3. `express.json({ limit: '10mb' })`, the only global size bound.

So: when you add a route, ask what rejects a malformed body, and if the answer
is "nothing", put a check in the service. Do not annotate and move on. Adding
zod to the REST layer would be a welcome change, but it is a decision to make
deliberately across all routes, not to introduce on one endpoint.

## Status codes and response shapes

Observed, and worth matching:

| Situation | Response |
|---|---|
| Created, client needs the object | `res.status(201).json(obj)` |
| Created, nothing to return | `res.status(201).end()` |
| Updated/deleted, nothing to return | `res.status(204).end()` |
| Read or update returning data | `res.json(obj)` |
| Delete with a confirmation | `res.json({ message: '... deleted successfully' })` |

Response shapes are **not** uniform across resources: presentations return the
bare object or a bare array, variables return `{ variables }`, images return the
bare object, deletes return `{ message }`. Match the neighbours in the same
router rather than inventing a third convention — and if you change one, change
the SDK method and the editor's API wrapper with it. → skill `api-surfaces`

## Headers and binary responses

`routes/export.ts` is the reference for anything that is not JSON:

- a small helper (`setPdfDownloadHeaders`) sets `Content-Type`,
  `Content-Disposition` with **both** an ASCII-sanitised `filename` and an
  RFC 5987 `filename*=UTF-8''…`, and `Content-Length`;
- a custom `X-Generation-Time` header carries timing for debugging;
- the one-shot download route (`GET /download/:token`) is **deliberately
  unguarded by ownership** because the token itself is the capability —
  single-use, 10-minute TTL, from `pdfDownloadStore`.

Do not inline header juggling into a handler; give it a named helper as that
file does.

## Adding a route

1. Which resource? → the matching `routes/*.ts`, or a new router + a mount
   inside the `requireAuth` pipeline.
2. Presentation-scoped? → `requireOwnsPresentation`.
3. Type the body against a DTO namespace in `packages/common/src/types.ts` —
   never an inline object type.
4. Call one service method. No Mongoose, no business rules, no try/catch.
5. Pick the status code from the table above.
6. Mirror it in the SDK, the editor's `api.ts`, and an MCP tool if an agent
   should reach it. → command `/new-endpoint`

## Known gap

**`routes/images.ts` has no ownership check.** It sits behind `requireAuth`, but
`Image` documents carry neither `ownerId` nor `presentationId`, so any
authenticated user can `GET /api/images/:id` or `DELETE /api/images/:id` for any
image id. Fixing it means scoping images to an owner at the model level, not
only adding a middleware.

## Related

- Skills: `backend-services`, `backend-persistence`, `backend-structure`,
  `backend-stack`, `api-surfaces`
- Agents: `api-surface-reviewer`
- Commands: `/new-endpoint`, `/review`
