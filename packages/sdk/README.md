# @imprime/sdk

TypeScript SDK for Imprime API - Create and manage presentations programmatically.

## Installation

```bash
npm install @imprime/sdk
```

## Quick Start

```typescript
import { ImprimeClient } from '@imprime/sdk'

// Initialize the client
const client = new ImprimeClient({
  baseUrl: 'http://localhost:3023/api'
})

// Create a presentation
const presentation = await client.createPresentation('My Presentation')

// Add a slide
const slide = await client.addSlide(presentation._id)
const slideId = slide._id

// Add shapes
await client.addRectangle(presentation._id, slideId, {
  x: 100,
  y: 100,
  width: 200,
  height: 100,
  fill: '#3b82f6'
})

await client.addText(presentation._id, slideId, {
  x: 120,
  y: 120,
  text: 'Hello World!',
  fontSize: 24,
  color: '#ffffff'
})
```

## API Reference

### Constructor

```typescript
new ImprimeClient(options?: ImprimeClientOptions)
```

**Options:**
- `baseUrl?: string` - Base URL of the Imprime API
- `timeout?: number` - Request timeout in milliseconds (default: `30000`)

### Presentation Methods

#### `listPresentations()`
List all presentations.

```typescript
const presentations = await client.listPresentations()
```

#### `getPresentation(id: string)`
Get a specific presentation by ID.

```typescript
const presentation = await client.getPresentation('674abc123def456')
```

#### `createPresentation(title?: string)`
Create a new presentation.

```typescript
const presentation = await client.createPresentation('Q4 Results')
```

#### `updatePresentation(id: string, data: { title?: string; slides?: Slide[] })`
Update a presentation's title or slides.

```typescript
await client.updatePresentation('674abc123def456', {
  title: 'Updated Title'
})
```

#### `deletePresentation(id: string)`
Delete a presentation.

```typescript
await client.deletePresentation('674abc123def456')
```

### Slide Methods

#### `addSlide(presentationId: string, slide?: SlideDTO.Create)`
Add a slide to a presentation and return it. Blank and last by default; `order`
inserts it at that 0-based position, `shapes` gives it content, and `_id`
restores a deleted slide under its former id (409 if that id is in use).

```typescript
const slide = await client.addSlide('674abc123def456')
const second = await client.addSlide('674abc123def456', { order: 1, shapes: [] })
```

#### `updateSlide(presentationId: string, slideId: string, shapes: Shape[])`
Update all shapes on a slide.

```typescript
await client.updateSlide('674abc123def456', 'slide-123', [
  { id: 'rect-1', type: 'rectangle', x: 0, y: 0, width: 100, height: 100, fill: '#000' }
])
```

#### `deleteSlide(presentationId: string, slideId: string)`
Delete a slide from a presentation.

```typescript
await client.deleteSlide('674abc123def456', 'slide-123')
```

### Shape Methods

#### `addRectangle(presentationId, slideId, options)`
Add a rectangle to a slide.

```typescript
await client.addRectangle('674abc123def456', 'slide-123', {
  x: 100,
  y: 100,
  width: 200,
  height: 100,
  fill: '#3b82f6' // optional, default: '#3b82f6'
})
```

#### `addEllipse(presentationId, slideId, options)`
Add an ellipse/circle to a slide.

```typescript
await client.addEllipse('674abc123def456', 'slide-123', {
  x: 100,
  y: 100,
  width: 150,
  height: 150,
  fill: '#f59e0b' // optional, default: '#f59e0b'
})
```

#### `addText(presentationId, slideId, options)`
Add a text box to a slide. Each line of `text` (split on `
`) becomes a
paragraph; the formatting options apply to all of them.

```typescript
await client.addText('674abc123def456', 'slide-123', {
  x: 50,
  y: 50,
  text: 'Hello World
Second paragraph',
  width: 200,              // optional, default: 200
  height: 50,              // optional, default: 50
  fontSize: 24,            // optional, default: 24
  fontFamily: 'Roboto',    // optional, default: 'Roboto'; a built-in or imported font (see listFonts), unknown fonts fall back to Roboto
  color: '#000000',        // optional, default: '#000000'
  align: 'center',         // optional: 'left' | 'center' | 'right' | 'justify', default: 'left'
  lineHeight: 1.15,        // optional, multiplier of the font size, default: 1.5
  verticalAlign: 'middle', // optional: 'top' | 'middle' | 'bottom', default: 'top'
  list: 'bullet'           // optional: 'bullet' | 'number', makes each line a list item
})
```

#### `updateShape(presentationId, slideId, shapeId, updates)`
Update a shape's properties.

```typescript
await client.updateShape('674abc123def456', 'slide-123', 'rect-1', {
  x: 150,
  y: 150,
  fill: '#ff0000'
})
```

#### `deleteShape(presentationId, slideId, shapeId)`
Delete a shape from a slide.

```typescript
await client.deleteShape('674abc123def456', 'slide-123', 'rect-1')
```

### Font Methods

Built-in fonts (all open source):

- **Sans serif** — Roboto (default), Open Sans, Inter, Lato, Montserrat, Noto
  Sans, Nunito, Poppins, Raleway, Roboto Condensed, Source Sans 3, Work Sans,
  Oswald
- **Serif** — Merriweather, Crimson Text, EB Garamond, Lora, Noto Serif,
  Playfair Display, Roboto Slab
- **Monospace** — Courier Prime, Roboto Mono, Source Code Pro
- **Display** — Anton, Bebas Neue
- **Handwriting** — Comic Neue, Dancing Script, Pacifico

The list is exported as `BUILTIN_FONT_FAMILIES`. Imported fonts belong to the instance: every user can use
them, by setting a text run's `fontFamily` to their `family`, and only admins
can import, change or delete them (other users get `403 ADMIN_REQUIRED`).
Files must be TrueType (`.ttf`) or OpenType (`.otf`), 5 MB at most, sent
base64-encoded.

A run marked bold or italic is drawn with the matching face; when the family
does not have it, the closest face it has is used instead (bold italic → bold →
italic → regular). Nothing is synthesised, so the editor and the PDF agree.

#### `listFonts()`
List the font families imported into the instance.

#### `createFont(family, regular)` — admin
Import a family with its regular face. `family` must be unique in the instance
and differ from the built-in fonts.

```typescript
import { readFileSync } from 'node:fs'

const font = await client.createFont('Brand Sans', {
  data: readFileSync('BrandSans-Regular.ttf').toString('base64'),
  originalName: 'BrandSans-Regular.ttf',
})
```

#### `setFontFace(fontId, variant, face)` — admin
Add or replace one face: `'regular' | 'bold' | 'italic' | 'boldItalic'`.

```typescript
await client.setFontFace(font._id, 'bold', {
  data: readFileSync('BrandSans-Bold.ttf').toString('base64'),
  originalName: 'BrandSans-Bold.ttf',
})
```

#### `getFontFace(fontId, variant)`
Get one face's file, base64-encoded.

#### `deleteFontFace(fontId, variant)` — admin
Remove an optional face (not `'regular'`).

#### `deleteFont(fontId)` — admin
Delete a family. Text that uses it, in every presentation, is drawn in Roboto.

### Settings Methods

Email and single sign-on are set by the instance's admins, not by the
environment, and apply at once, without a restart. Every method is admin only
(other users get `403 ADMIN_REQUIRED`).

Email covers the SMTP server, and whether accounts must verify their address.

#### `getEmailSettings()` — admin
The SMTP server (`null` when there is none) and `requireEmailVerification`.
The password is never returned: `smtp.hasPassword` says whether one is stored.

#### `updateEmailSettings(settings)` — admin
Replace both settings. Omit `smtp.password` to keep the stored one (as long as
`smtp.host`, `smtp.port` and `smtp.user` are unchanged: it is never sent to
another server); send `smtp: null` to remove the server. With a user and
password but `secure: false`, the server must offer STARTTLS, or no email is
sent. Turning `requireEmailVerification` on signs out the users whose address
is unverified.

```typescript
await client.updateEmailSettings({
  smtp: {
    host: 'smtp.example.com',
    port: 587,
    secure: false,          // TLS from the start; always on for port 465
    user: 'imprime@example.com',
    password: '…',
    from: 'Imprime <no-reply@example.com>',
  },
  requireEmailVerification: true,
})
```

Fails with `400 EMAIL_VERIFICATION_REQUIRES_SMTP` when verification is required
without a server, and `400 EMAIL_SETTINGS_INVALID` (with `details`) for a
malformed server.

#### `sendTestEmail({ to, smtp? })` — admin
Send one email through `smtp`, or through the stored server when it is
omitted, without saving anything — to check a configuration before saving it.
Fails with `502 SMTP_TEST_FAILED`, carrying the SMTP server's own error, or
`400 SMTP_NOT_CONFIGURED` when there is no server to test.

Single sign-on is set the same way: one OAuth application per provider,
`'google' | 'github' | 'microsoft'` (the list is exported as `SSO_PROVIDERS`).
A provider appears on the sign-in page as soon as it is saved.

#### `getSsoSettings()` — admin
For each provider: `callbackUrl`, the redirect URI to register with it;
`config`, the stored application (`null` when there is none) without its
secret; and `active`, whether it is offered on the sign-in page — false for a
stored application whose secret no longer decrypts, after `BETTER_AUTH_SECRET`
changed.

#### `updateSsoProvider(provider, data)` — admin
Store a provider's application. Omit `clientSecret` to keep the stored one (as
long as `clientId` is unchanged). `tenantId` is for Microsoft only:
`'common'` (the default), `'organizations'`, `'consumers'`, or a tenant ID.

```typescript
await client.updateSsoProvider('github', {
  clientId: 'Iv1.0123456789abcdef',
  clientSecret: '…',
})
```

Fails with `400 SSO_SETTINGS_INVALID` (with `details`) for a malformed
application or a missing secret, and `400 SSO_PROVIDER_INVALID` for an unknown
provider.

#### `removeSsoProvider(provider)` — admin
Remove a provider's application: it leaves the sign-in page at once. Accounts
that only signed in with it can still set a password through password reset,
when the instance sends email.

#### `getAccessSettings()` / `updateAccessSettings(settings)` — admin
Who may get into the instance:

- `passwordPolicy` — `'open'` (default): anyone signs up and signs in with an
  email and a password; `'existing'`: no new password accounts, existing ones
  keep signing in; `'admins'`: single sign-on only, administrators keep their
  password as the way back in.
- `allowedDomains` — e.g. `['example.com']`, exact domains: only addresses in
  them may have an account, and only once verified, by their provider or by
  email. Empty (default): any. The administrator is exempt. Google and GitHub
  say whether an address is verified; Microsoft does only when it sends the
  optional claim `xms_edov`, which its app registration must add to the ID
  token.

```typescript
await client.updateAccessSettings({ passwordPolicy: 'admins', allowedDomains: ['example.com'] })
```

Users the new settings shut out are signed out at once: everyone but
administrators when `'admins'` is turned on, those outside the domains when the
list changes. API keys and MCP tokens are not revoked, but stop working while
their owner is outside the domains. Fails with `400 ACCESS_SETTINGS_INVALID`
(with `details`). Nothing else is refused: single sign-on only without an
active provider leaves the administrator as the only one who can sign in.

Refused sign-ins answer `403` with `PASSWORD_SIGN_IN_DISABLED`,
`EMAIL_DOMAIN_NOT_ALLOWED` or `ADDRESS_NOT_VERIFIED`; a refused single sign-on
redirects to the sign-in page with the code in its `error` parameter.

## Error Handling

The SDK throws errors for failed requests:

```typescript
try {
  await client.getPresentation('invalid-id')
} catch (error) {
  console.error('Failed to get presentation:', error.message)
}
```

## TypeScript Support

The SDK is written in TypeScript and includes full type definitions:

```typescript
import type { Presentation, Slide, Shape } from '@imprime/sdk'

const presentation: Presentation = await client.getPresentation(id)
const slide: Slide = presentation.slides[0]
const shape: Shape = slide.shapes[0]
```

## Use Cases

- **Automation**: Generate presentations from data
- **CLI tools**: Build command-line tools for slide management
- **Testing**: Automated testing of presentation features
- **MCP Servers**: Build AI-accessible presentation tools
- **Integrations**: Connect Imprime to other services

## Requirements

- Node.js 18+
- Imprime backend server running
