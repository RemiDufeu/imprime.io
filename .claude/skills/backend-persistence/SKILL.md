---
name: backend-persistence
description: Imprime's Mongoose models and the mapping rules between documents and DTOs — schema anatomy, ownership scoping, the mapper naming and direction conventions, why update mappers whitelist field by field, ObjectId handling, aggregate composition, manual cascade deletes, and why nothing is migrated before production. Use when adding a collection or a field, changing a schema or a stored shape, writing or changing a mapper, or reviewing anything under models/.
metadata:
  origin: adapted from ECC (github.com/affaan-m/ECC)
---

# Persistence and Mapping

Seven collections, seven thin schemas, and one mapper module that is the only
place a Mongoose document turns into something a client may see.

```
Template      { title, ownerId, pageSize: { width, height }, timestamps }
Page          { templateId, order, shapes: Mixed[], timestamps }
VariableData  { templateId, type, name, default: Mixed, required }
Image         { data (base64), mimeType, originalName, size, orphanedAt? (TTL), timestamps }
Font          { family, familyKey (unique), version, faces: { regular, bold?, italic?, boldItalic? } (size, name), timestamps }
FontFile      { fontId, variant, data (binary) }   — one per face, unique (fontId, variant)
InstanceSettings { _id: 'instance', email: { smtp? { host, port, secure, user?, password? (encrypted), from }, requireEmailVerification }, sso: { google?, github?, microsoft? } ({ clientId, clientSecret (encrypted), tenantId? }), access: { passwordPolicy ('open' | 'existing' | 'admins', default 'open'), allowedDomains (default []) }, timestamps }   — a single document, written with upserting findByIdAndUpdate
```

## Model file anatomy

Three exports per model, in this shape:

```ts
export interface IPage {                 // plain data, no Document methods
  templateId: Types.ObjectId
  order: number
  shapes: Shape[]
  createdAt?: Date
  updatedAt?: Date
}

const PageSchema = new Schema<IPage>({ ... }, { timestamps: true })

export type PageDocument = HydratedDocument<IPage>
export const PageModel = model<IPage>('Page', PageSchema)
```

`Template.ts`, `Page.ts` and `VariableData.ts` all follow it.
**`Image.ts` does not** — it uses the older `interface ImageDocument extends Document`
style with the `_id` declared by hand. That is the legacy pattern; do not copy it
into a new model.

Schema conventions in use:

- **Index every foreign key**: `templateId` and `ownerId` are both
  `index: true`. Queries filter on them constantly.
- **Declare an index a business rule depends on.** `VariableData` carries
  `index({ templateId: 1, name: 1 }, { unique: true })` because name
  uniqueness is what makes the name-keyed export payload unambiguous — the
  service's `exists()` pre-check alone cannot survive two concurrent writers.
  When you add one, map the resulting E11000 back to the service's own error so
  the client contract does not change. Note that Mongoose builds indexes on
  startup and only *creates* them: a unique index will fail to build (logged on
  the connection, the app keeps running unguarded) if the collection already
  holds duplicates, and removing the declaration will not drop an index already
  in the database.
- **`timestamps: true`** everywhere except `VariableData`, which has none — so a
  variable edit cannot be dated. `touchTemplate()` (exported from
  `TemplateService.ts`) exists to compensate by bumping the parent's
  `updatedAt`.
- **`enum` on constrained strings**: `VariableData.type` is
  `enum: ['string', 'boolean', 'string-list']`, matching `VariableType` in
  `common`. Extending the union means extending the enum in the same change, or
  writes fail validation at runtime with nothing in the compiler to warn you.
- **`Schema.Types.Mixed` for the shape tree and variable defaults.** Mongoose
  cannot validate a discriminated union. The consequence is real: **nothing
  validates a shape payload at the database boundary** — a malformed shape is
  persisted happily and only surfaces at render time. What validation exists is
  in `PageService`, not the schema.

## Ownership scoping

Only `Template` carries `ownerId`. `Font` belongs to the instance: no
owner, readable by everyone, written only behind `requireAdmin`.
`InstanceSettings` too, but read by admins only, and its SMTP password never
leaves: `emailSettingsToDTO` turns it into `hasPassword`, and
`ssoProviderToDTO` drops the client secrets. Everything
else is scoped **through** the template:

- `Page` and `VariableData` hold `templateId`, and services query with both
  ids together (`findOne({ _id, templateId })`) so a child cannot be reached
  from the wrong parent;
- ownership itself is asserted one level up, by `assertOwnsTemplate`.
  → skill `api-surfaces`

**`Image` has no owner and no template link at all.** It is referenced only
by `imageId` inside a shape. Anything reached by image id is therefore unscoped;
treat that as a known gap rather than a pattern to reuse (see the end of this
skill).

## Mapping rules

`models/mappers.ts`. Pure functions, no database access, no `async`, one
direction each, named for that direction:

| Name | Direction | Returns |
|---|---|---|
| `<entity>ToDTO(doc)` | document → client | the DTO from `common/src/types.ts` |
| `<entity>CreateToModel(…, dto)` | client → new document fields | exactly the fields a create may set |
| `<entity>UpdateToModel(dto)` | client → partial update | only the fields actually present |

### Rule 1 — `_id` is always stringified

```ts
export function pageToDTO(doc: PageDocument): Page {
  return { _id: doc._id.toString(), order: doc.order, shapes: doc.shapes, ... }
}
```

The DTO contract says `string`; the document holds an `ObjectId`. Sending a
document straight out ships `{ "$oid": ... }` or a stringified object depending
on the serialiser, and breaks the SDK's types. **A route that responds with a
Mongoose document is a bug**, even if it renders correctly today.

Going the other way, `toObjectId(id)` is the single conversion helper — use it
rather than `new mongoose.Types.ObjectId(...)` inline.

### Rule 2 — create mappers take foreign keys as parameters, never from the DTO

```ts
pageCreateToModel(templateId: Types.ObjectId, order: number)
variableCreateToModel(templateId: Types.ObjectId, dto: VariableDTO.Create)
```

The parent id comes from the **verified route param**, not from the request
body. Likewise `ownerId` is attached by the service
(`TemplateModel.create({ ...templateCreateToModel(data), ownerId })`)
and never appears in `TemplateDTO.Create`. This is what keeps a client from
writing a row it does not own.

### Rule 3 — update mappers whitelist field by field

```ts
export function variableUpdateToModel(dto: VariableDTO.Update) {
  const update: Partial<...> = {}
  if (dto.type !== undefined) update.type = dto.type
  if (dto.name !== undefined) update.name = dto.name
  if (dto.default !== undefined) update.default = dto.default
  if (dto.required !== undefined) update.required = dto.required
  return update
}
```

Verbose on purpose, and doing two jobs at once:

1. **No accidental unsetting.** A PATCH that omits a field leaves it alone;
   spreading the DTO would write `undefined` over it.
2. **No mass assignment.** The output type is `Partial<Pick<IVariableData, ...>>`,
   so `templateId` cannot be smuggled in through the body even though the
   route hands `req.body` straight to the mapper untyped at runtime. With no
   request validation anywhere (→ skill `backend-routes`), **this whitelist is
   the only thing standing between a request body and the database.**

Do not "simplify" an update mapper to a spread. Add the new field to the chain.

### Rule 4 — the service composes aggregates, the mapper does not

`templateToDTO` deliberately returns
`Omit<Template, 'pages' | 'variableData'>` — the flat document only. The
service assembles the whole thing:

```ts
const [template, pages, variables] = await Promise.all([...])
return {
  ...templateToDTO(template),
  pages: pages.map(pageToDTO),
  variableData: variables.map(variableToDTO),
}
```

Mappers stay synchronous and testable-in-principle; anything needing a second
query belongs in the service.

### Adding a field

1. the DTO in `packages/common/src/types.ts`
2. the `I<Entity>` interface and the schema — `required` unless its absence
   means something; never a default for documents saved before (→ the next section)
3. `<entity>ToDTO` — or it will never reach a client
4. `<entity>CreateToModel` and `<entity>UpdateToModel` — or it can never be set
5. the SDK, and the README if it is public (→ skill `api-surfaces`)

Steps 3 and 4 are where fields get silently dropped, because nothing fails: the
optional DTO field simply stays `undefined` forever.

## No migrations before production

Imprime is **not in production yet**: no stored template, page or variable has
to survive a change. A schema, a collection name, a field or a stored shape is
changed directly, and the development database is reset. This holds until the
user says Imprime is in production.

So, for any change to what is persisted:

- **no migration script** — not written, not proposed, not offered as an option;
- **no startup backfill** that rewrites existing documents;
- **no read-side fallback** — a schema `default`, a `?? legacyValue`, an
  "unset means the old behaviour" — whose only job is coping with documents
  saved before the change;
- **no compatibility question** to the user about "templates saved before".

What the change needs instead is one line in the summary or the PR: which
development collections to drop, or "none". Never drop them yourself — the
`.env` database is the user's, and a reset is theirs to run.

**Test for an optional field** — does its absence mean something in the domain,
for a document created today? `GroupShape.layout` unset is free positioning,
`Paragraph.align` unset is left: those stay optional, with the meaning
documented. A field every new document always has is required.

This governs new work. Code that predates the rule —
`PageService.indexImageReferences` (a startup backfill),
`scripts/migrateTemplates.ts` (the presentation → template rename), the
`pageSize` defaults on the `Template` schema — is not a pattern to copy, and is
not removed unless the user asks.

## Cascades and transactions

**There are no transactions.** Multi-collection operations run as a sequence of
independent writes, and a failure halfway leaves the database inconsistent.
`TemplateService.delete` is the clearest case: images, then pages, then
variables, then the template. Accept it and order the writes so a partial
failure leaves the least harmful state — do not introduce a session for one
feature.

Best-effort side effects are wrapped and logged rather than propagated:

```ts
try { await this.imageService.deleteUnused(imageIds, template.ownerId) }
catch (error) { console.error('Failed to delete associated images:', error) }
```

Orphaned image rows are preferred to a failed delete. Match that judgement for
cleanup work; do not match it for anything the caller needs to know about.

### Images are released, not deleted

An image is **shared**: duplicating or pasting an image shape keeps its
`imageId`, on any page of any template. So "is it still used?" is asked of
every page, through `Page.imageIds` — derived from `shapes` by a pre-save hook
on the model, indexed, and backfilled at startup for pages saved before it
existed (`PageService.indexImageReferences`). `updateOne` and `bulkWrite` skip
that hook: never use them to write `shapes`.

An image that leaves its page — a shape write without it, or the page's
deletion — is **released** (`ImageService.release`): if no page shows it any
more it gets `orphanedAt` instead of being deleted, because the editor can undo
either and shows the image again by the same id. A TTL index
(`ORPHAN_GRACE_SECONDS`, 7 days) lets MongoDB delete it after that. Every save
unsets the field on all the images its tree shows (`markReferenced`), which also
repairs a release that raced another save. Release **after** the write that
removed the image, so that page no longer counts as showing it.
`TemplateService.delete` deletes its pages first, then the images no other
template shows (`deleteUnused`). Nothing calls `delete` on an image a page
dropped.

### Restoring under a former id

`PageDTO.Create._id` and `VariableDTO.Create._id` let a client recreate a
deleted page or variable under its old id — the editor's undo, since text runs
and history steps point to those ids. The service checks the 24-hex form
(`isObjectIdString`), answers 409 when the id exists anywhere, and maps a racing
E11000 to the same error.

## Known gaps

Verify these still hold before relying on them:

1. **Images belong to their uploader, not to a template.** `Image.ownerId`
   is set at upload and every `ImageService` method takes the `ownerId` to
   scope by — reads, deletes, and the reference bookkeeping, since the image
   ids a page holds are anyone's to write. The export draws only the
   template owner's images. Images stored before the field existed have
   no owner and answer 404 to everyone: no backfill was written (not in
   production then). ObjectIds follow each other, so an unscoped lookup by id
   is an enumerable one. → skill `backend-routes`

## Related

- Skills: `backend-services`, `backend-routes`, `backend-structure`, `api-surfaces`
- Agents: `api-surface-reviewer`
- Commands: `/new-endpoint`
