---
name: backend-structure
description: How the Imprime backend is layered and organised — the route/service/model chain, why there is no repository layer, singleton wiring with constructor injection, where each kind of file belongs, naming, and the import rules. Use when creating a backend file, deciding which layer owns a piece of logic, or reviewing a change that adds files.
metadata:
  origin: adapted from ECC (github.com/affaan-m/ECC)
---

# Backend Structure

```
src/
  server.ts              HTTP wiring, middleware order, mounts, shutdown
  loadEnv.ts             dotenv against the monorepo-root .env — imported first

  config/
    database.ts          Mongoose connection
    authDb.ts            raw MongoClient for better-auth
    fonts.ts             react-pdf font registration
  middleware/
    requireAuth.ts       session cookie or x-api-key → req.user
    requireOwnsPresentation.ts  ownership guard + assertOwnsPresentation()
    errorHandler.ts      AppError subclasses → HTTP responses
  models/
    Presentation.ts  Slide.ts  VariableData.ts  Image.ts
    mappers.ts           document ↔ DTO
  routes/
    presentations.ts  slides.ts  variables.ts  export.ts  images.ts
  services/
    index.ts             the singletons, wired here
    PresentationService.ts  SlideService.ts  VariableService.ts
    ImageService.ts  ExportService.ts  AuthService.ts  MailerService.ts
    errors.ts            AppError, NotFoundError, ValidationError, ConflictError
    pdfDownloadStore.ts  in-process single-use PDF store
  mcp/
    router.ts            Streamable HTTP transport + sessions
    tools/               one file per tool + index.ts + errors.ts
  types/
    index.ts             re-export of @imprime/common
    express.d.ts         Request.user augmentation
```

## The layering

```
route  →  service  →  model
```

and nothing skips a level. Concretely:

| Layer | May do | May not do |
|---|---|---|
| **route** | read `req.params` / `req.body` / `req.user`, call **one** service, set status and headers | touch Mongoose, hold business rules, catch to build a response |
| **service** | query models, enforce rules, throw error classes, call other services it was injected with | know about `req`, `res`, HTTP status codes |
| **model** | declare the schema, indexes, timestamps | contain logic — no statics, no virtuals, no hooks anywhere today |

A service never sees Express. That is what lets the MCP tools reuse
`presentationService` and `exportService` unchanged.

## There is no repository layer

Services import Mongoose models directly — `PresentationModel.findById(...)`,
`SlideModel.find(...)`. **The service is the persistence boundary.** There is no
`repositories/` directory, no `IPresentationRepository`, no generic base class,
and no dependency-inversion seam between service and driver.

That is a deliberate shape for this codebase, not an omission waiting to be
fixed: with no tests to fake a repository for, and one database, the extra layer
would only add indirection. Do not introduce one for a single feature — it would
be a parallel mechanism alongside seven services that do it the other way.

What the service layer *does* isolate: **the DTO boundary**. Nothing above a
service ever sees a Mongoose document. → skill `backend-persistence`

## Dependency injection and singletons

`services/index.ts` is the composition root. Services are instantiated once, in
dependency order, and exported as singletons:

```ts
const imageService = new ImageService()
const slideService = new SlideService(imageService)
const presentationService = new PresentationService(imageService)
const exportService = new ExportService(imageService)
const authService = new AuthService(mailerService)
```

Rules:

- A service that needs another takes it as a **constructor parameter** with the
  `private` modifier, typed against the class. Never import the singleton from
  inside a service module — that is an import cycle waiting to happen.
- A new service is added to `index.ts`. Never `new SomeService()` at a call site;
  services hold connections, transporters and registered fonts.
- `index.ts` also re-exports the error classes, so most modules need one import:
  `import { presentationService, NotFoundError } from '../services/index.js'`.

## Where a new file goes

| You are adding | It goes |
|---|---|
| an HTTP endpoint | a handler in the matching `routes/*.ts`, or a new router + a mount in `server.ts` inside the `requireAuth` pipeline |
| business logic | a method on the service that owns the resource, or a new service wired in `services/index.ts` |
| a persisted collection | `models/<Name>.ts` + mappers in `models/mappers.ts` |
| a cross-cutting request concern | `middleware/` |
| a capability for agents | `mcp/tools/<name>.ts` + registration in `mcp/tools/index.ts` |
| a shared error type | `services/errors.ts` |
| startup/connection config | `config/` |
| logic the **frontend also needs** | not here at all — `packages/common/` |

That last row is the one most often got wrong. Shape geometry, variable
resolution and layout live in `packages/common/src/rendering/` so the PDF and
the editor cannot disagree. → skill `render-parity`

## Naming

- Services: `PascalCaseService.ts`, exporting `class PascalCaseService`,
  instantiated as `camelCaseService` in `index.ts`.
- Models: `PascalCase.ts`, exporting `IPascalCase` (the plain interface),
  `PascalCaseDocument` (the hydrated type) and `PascalCaseModel`.
- Routes: lowercase plural resource — `presentations.ts`, `variables.ts` —
  `export default router`.
- Middleware: `camelCase.ts` named after the thing it asserts.
- Mappers: `<entity>ToDTO`, `<entity>CreateToModel`, `<entity>UpdateToModel`.

## Import rules

- Relative imports **must** end in `.js`, including from `.ts` files. Node16
  resolution; omitting it throws at runtime, not at build.
- Domain types come from `@imprime/common` (the frontend uses `@imprime/sdk`).
  `src/types/index.ts` re-exports it, but most files import `@imprime/common`
  directly — prefer that, it is the majority convention.
- `import type { ... }` for type-only imports, consistently.

## Related

- Skills: `backend-stack`, `backend-routes`, `backend-services`,
  `backend-persistence`, `api-surfaces`
- Commands: `/new-endpoint`, `/review`
