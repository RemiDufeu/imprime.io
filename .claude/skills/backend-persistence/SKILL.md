---
name: backend-persistence
description: Imprime's Mongoose models and the mapping rules between documents and DTOs — schema anatomy, ownership scoping, the mapper naming and direction conventions, why update mappers whitelist field by field, ObjectId handling, aggregate composition, and manual cascade deletes. Use when adding a collection or a field, writing or changing a mapper, or reviewing anything under models/.
metadata:
  origin: adapted from ECC (github.com/affaan-m/ECC)
---

# Persistence and Mapping

Four collections, four thin schemas, and one mapper module that is the only
place a Mongoose document turns into something a client may see.

```
Presentation  { title, ownerId, timestamps }
Slide         { presentationId, order, shapes: Mixed[], timestamps }
VariableData  { presentationId, type, name, default: Mixed, required }
Image         { data (base64), mimeType, originalName, size, timestamps }
```

## Model file anatomy

Three exports per model, in this shape:

```ts
export interface ISlide {                 // plain data, no Document methods
  presentationId: Types.ObjectId
  order: number
  shapes: Shape[]
  createdAt?: Date
  updatedAt?: Date
}

const SlideSchema = new Schema<ISlide>({ ... }, { timestamps: true })

export type SlideDocument = HydratedDocument<ISlide>
export const SlideModel = model<ISlide>('Slide', SlideSchema)
```

`Presentation.ts`, `Slide.ts` and `VariableData.ts` all follow it.
**`Image.ts` does not** — it uses the older `interface ImageDocument extends Document`
style with the `_id` declared by hand. That is the legacy pattern; do not copy it
into a new model.

Schema conventions in use:

- **Index every foreign key**: `presentationId` and `ownerId` are both
  `index: true`. Queries filter on them constantly.
- **`timestamps: true`** everywhere except `VariableData`, which has none — so a
  variable edit cannot be dated. `touchPresentation()` exists to compensate by
  bumping the parent's `updatedAt`.
- **`enum` on constrained strings**: `VariableData.type` is
  `enum: ['string', 'boolean', 'string-list']`, matching `VariableType` in
  `common`. Extending the union means extending the enum in the same change, or
  writes fail validation at runtime with nothing in the compiler to warn you.
- **`Schema.Types.Mixed` for the shape tree and variable defaults.** Mongoose
  cannot validate a discriminated union. The consequence is real: **nothing
  validates a shape payload at the database boundary** — a malformed shape is
  persisted happily and only surfaces at render time. What validation exists is
  in `SlideService`, not the schema.

## Ownership scoping

Only `Presentation` carries `ownerId`. Everything else is scoped **through** it:

- `Slide` and `VariableData` hold `presentationId`, and services query with both
  ids together (`findOne({ _id, presentationId })`) so a child cannot be reached
  from the wrong parent;
- ownership itself is asserted one level up, by `assertOwnsPresentation`.
  → skill `api-surfaces`

**`Image` has no owner and no presentation link at all.** It is referenced only
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
export function slideToDTO(doc: SlideDocument): Slide {
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
slideCreateToModel(presentationId: Types.ObjectId, order: number)
variableCreateToModel(presentationId: Types.ObjectId, dto: VariableDTO.Create)
```

The parent id comes from the **verified route param**, not from the request
body. Likewise `ownerId` is attached by the service
(`PresentationModel.create({ ...presentationCreateToModel(data), ownerId })`)
and never appears in `PresentationDTO.Create`. This is what keeps a client from
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
   so `presentationId` cannot be smuggled in through the body even though the
   route hands `req.body` straight to the mapper untyped at runtime. With no
   request validation anywhere (→ skill `backend-routes`), **this whitelist is
   the only thing standing between a request body and the database.**

Do not "simplify" an update mapper to a spread. Add the new field to the chain.

### Rule 4 — the service composes aggregates, the mapper does not

`presentationToDTO` deliberately returns
`Omit<Presentation, 'slides' | 'variableData'>` — the flat document only. The
service assembles the whole thing:

```ts
const [presentation, slides, variables] = await Promise.all([...])
return {
  ...presentationToDTO(presentation),
  slides: slides.map(slideToDTO),
  variableData: variables.map(variableToDTO),
}
```

Mappers stay synchronous and testable-in-principle; anything needing a second
query belongs in the service.

### Adding a field

1. the DTO in `packages/common/src/types.ts`
2. the `I<Entity>` interface and the schema
3. `<entity>ToDTO` — or it will never reach a client
4. `<entity>CreateToModel` and `<entity>UpdateToModel` — or it can never be set
5. the SDK, and the README if it is public (→ skill `api-surfaces`)

Steps 3 and 4 are where fields get silently dropped, because nothing fails: the
optional DTO field simply stays `undefined` forever.

## Cascades and transactions

**There are no transactions.** Multi-collection operations run as a sequence of
independent writes, and a failure halfway leaves the database inconsistent.
`PresentationService.delete` is the clearest case: images, then slides, then
variables, then the presentation. Accept it and order the writes so a partial
failure leaves the least harmful state — do not introduce a session for one
feature.

Best-effort side effects are wrapped and logged rather than propagated:

```ts
try { await this.imageService.deleteMany(imageIds) }
catch (error) { console.error('Failed to delete associated images:', error) }
```

Orphaned image rows are preferred to a failed delete. Match that judgement for
cleanup work; do not match it for anything the caller needs to know about.

## Known gaps

Verify these still hold before relying on them:

1. **`PresentationService.collectImageIds` does not recurse into containers.**
   The module-level helper filters `shapes` for `type === 'image'` at the top
   level only, while `SlideService.collectImageIds` walks the tree via
   `isContainerShape`. Deleting a presentation therefore orphans every image
   nested inside a group.
2. **`variableToDTO` never maps `value`.** `VariableData` in `common` declares
   `value?`, and `IVariableData` has no such field — so it is dead on both the
   read and the write path. Either remove it from the type or implement it.
3. **Variable name uniqueness is enforced only in service code**, with no unique
   index on `{ presentationId, name }`. Two concurrent creates can both pass the
   `exists()` check.
4. **`touchPresentation` is duplicated** — identical private method in
   `SlideService` and `VariableService`.
5. **Images are unscoped.** No `ownerId`, no `presentationId`, and the routes do
   not check ownership, so any authenticated user can read or delete any image
   by id. → skill `backend-routes`

## Related

- Skills: `backend-services`, `backend-routes`, `backend-structure`, `api-surfaces`
- Agents: `api-surface-reviewer`
- Commands: `/new-endpoint`
