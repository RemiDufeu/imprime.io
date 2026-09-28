---
name: backend-services
description: How Imprime's service layer is written — class shape and constructor injection, what a service owns versus what the route and middleware own, throwing typed errors instead of returning them, private helpers, cross-service calls, and the patterns for validation, cleanup and parent touching. Use when adding or changing anything under packages/backend/src/services.
metadata:
  origin: adapted from ECC (github.com/affaan-m/ECC)
---

# Services

The service layer holds all the business logic. It is also the persistence
boundary — there is no repository layer, services talk to Mongoose models
directly. → skill `backend-structure`

Seven services, wired once in `services/index.ts`:

| Service | Owns |
|---|---|
| `PresentationService` | presentation CRUD, aggregate assembly, cascade delete |
| `SlideService` | slide create/delete, shape writes and their validation |
| `VariableService` | variable CRUD, name uniqueness, in-use guard |
| `ImageService` | base64 image storage |
| `ExportService` | PDF rendering (→ skill `pdf-export`) |
| `AuthService` | the better-auth instance and id resolution |
| `MailerService` | optional SMTP, self-disabling when unconfigured |

## Class shape

```ts
export class SlideService {
  constructor(private imageService: ImageService) { }

  async updateShapes(presentationId: string, slideId: string, data: SlideDTO.Update): Promise<void> {
    ...
  }

  private async touchPresentation(presentationId: Types.ObjectId): Promise<unknown> { ... }
}
```

- **Dependencies arrive through the constructor**, typed against the class and
  marked `private`. A service never imports a singleton from
  `services/index.js` — that is an import cycle waiting to happen.
- **Ids in, DTOs out.** Public methods take `string` ids and DTO types from
  `@imprime/common`; they return DTOs or `void`. A Mongoose document must never
  cross the boundary. → skill `backend-persistence`
- **No Express.** No `req`, no `res`, no status codes. That is what lets the MCP
  tools call `presentationService` and `exportService` unchanged.
- `public` is written explicitly in most services and omitted in `SlideService`.
  Inconsistent; match the file you are in.

## What a service does not own

| Concern | Owner |
|---|---|
| Authentication | `requireAuth` middleware |
| **Ownership** | `requireOwnsPresentation` / `assertOwnsPresentation` |
| HTTP status codes | `errorHandler`, via the error class |
| Request shape | nothing, today — see the note in `backend-routes` |

Ownership is the one worth internalising: **services trust their caller.**
`presentationService.getById(id)` returns any presentation to anyone who asks.
The guard lives in the middleware, and in the MCP tools as an explicit
`assertOwnsPresentation` call. A new non-HTTP entry point that calls a service
must assert ownership itself — there is nothing in the service to fall back on.

## Errors are thrown, never returned

```ts
throw new NotFoundError('Presentation not found', 'PRESENTATION_NOT_FOUND')
throw new ValidationError('Invalid variable references', undefined, errors)
throw new ConflictError('Variable name already exists in this presentation', 'VARIABLE_NAME_EXISTS')
```

| Class | Status | Use |
|---|---|---|
| `NotFoundError` | 404 | missing, **and** not-owned |
| `ValidationError` | 400 | bad input; optional `details: string[]` |
| `ConflictError` | 409 | uniqueness violations |
| `AppError` | any | anything else — the export timeout uses 408 |

The second argument is a machine-readable `code`, and it is **part of the public
contract**: the editor branches on `VARIABLE_IN_USE`, so renaming one is a
breaking change. Adding a code means telling the SDK consumer in the same change.

No service returns `{ error }`, `null`-as-failure, or a result union. Express 5
forwards the rejection to `errorHandler` on its own.

## Recurring patterns

### Load, guard, act

Every mutation starts by loading the target and throwing if it is absent, rather
than trusting an `updateOne` to have matched:

```ts
const slide = await SlideModel.findOne({ _id: toObjectId(slideId), presentationId: toObjectId(presentationId) })
if (!slide) throw new NotFoundError('Slide not found', 'SLIDE_NOT_FOUND')
```

Note both ids in the filter — a child is always fetched through its parent, so a
valid slide id from another presentation cannot be reached.

### Mutate through the mapper, then save

```ts
Object.assign(slide, slideUpdateToModel(data))
await slide.save()
```

`Object.assign` onto a hydrated document with a **whitelisted** partial. The
whitelist is what makes this safe; assigning `req.body` directly would not be.

### Touch the parent

Slides and variables bump the presentation's `updatedAt` so the home page sorts
correctly:

```ts
// PresentationService.ts — module-level, exported
export function touchPresentation(presentationId: Types.ObjectId): Promise<unknown> {
  return PresentationModel.updateOne({ _id: presentationId }, { $currentDate: { updatedAt: true } })
}
```

It lives in `PresentationService.ts` because the presentation owns the
timestamp, and `SlideService` / `VariableService` import the function. This is
the shape to copy when two services need the same helper: a module-level export
from the file that owns the concept — **not** a private method copied into both,
and not a cross-service singleton import.

### Validate the tree before writing it

`SlideService.updateShapes` loads the presentation's variable ids and walks the
incoming shape tree recursively, collecting **every** bad reference before
throwing one `ValidationError` with all of them in `details`. Two things to keep
if you extend it: collect-then-throw rather than fail-fast, and recurse through
`isContainerShape` so nested shapes are covered.

This is the closest thing the codebase has to request validation, and it exists
because the schema stores shapes as `Mixed`.

### Clean up best-effort, log, continue

```ts
try { await this.imageService.delete(imageId) }
catch (error) { console.error(`Failed to delete image ${imageId}:`, error) }
```

Orphaned rows beat a failed user operation. Use this shape for cleanup only —
never to swallow something the caller needs to know about.

### Compose aggregates with `Promise.all`

`PresentationService.getById` fetches presentation, slides and variables
concurrently, then assembles the DTO. Several mutations end with
`return await this.getById(id)` so the client always gets the full, current
object back rather than a patch it has to merge.

### Private helpers stay private

`validateVariableReferences` and `collectImageIds` are `private` methods,
because only their own service calls them. A helper needed by **two** services
becomes a module-level function in the file that owns the concept — as
`touchPresentation` did — or moves to `packages/common` if the frontend needs it
too. `VariableService` also keeps two module-level helpers of its own
(`nameConflict`, `isDuplicateName`) so the name-clash error has one definition
across the pre-check and the index race.

## Adding a service

1. Create `services/<Name>Service.ts` with the class and constructor deps.
2. Instantiate it in `services/index.ts` **after** its dependencies, and export
   it. Order in that file is the dependency order.
3. Throw the error classes from `./errors.js`; do not invent a new one without
   adding it there.
4. Call it from a route, an MCP tool, or another service — never construct it.

## Related

- Skills: `backend-persistence`, `backend-routes`, `backend-structure`,
  `api-surfaces`, `pdf-export`
- Agents: `api-surface-reviewer`, `imprime-reviewer`
- Commands: `/new-endpoint`
