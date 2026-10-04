---
name: backend-stack
description: The libraries the Imprime backend runs on and how each is configured — Express 5, Mongoose 8, better-auth, the MCP SDK, zod, helmet/cors/rate-limit, nodemailer — plus the ESM and TypeScript Node16 rules, environment loading, and the two separate database connections. Use when writing or reviewing backend code, adding a dependency, or debugging startup and config.
metadata:
  origin: adapted from ECC (github.com/affaan-m/ECC)
---

# Backend Stack

`packages/backend` — Express 5 on Node 18+, MongoDB via Mongoose, better-auth
for identity, and an MCP server. `tsx watch` in development, a single esbuild
bundle in production.

## ESM and TypeScript

`"type": "module"` with `module: Node16` / `moduleResolution: node16`. Two
consequences that bite immediately:

- **Every relative import carries a `.js` extension**, even from a `.ts` source:
  `import { slideService } from '../services/index.js'`. Omit it and the build
  passes but the runtime throws `ERR_MODULE_NOT_FOUND`. This is the opposite of
  the frontend, which is bundler-resolved and extensionless.
- No `__dirname`. Use
  `path.dirname(fileURLToPath(import.meta.url))` — `server.ts`, `loadEnv.ts` and
  `config/fonts.ts` all do.

`strict: true`, but **not** the extra flags the frontend enables — no
`noUnusedLocals`, no `verbatimModuleSyntax`. Type-only imports are still written
`import type` by convention throughout; keep it.

There is no ESLint config in this package, even though `package.json` declares a
`lint` script. `npm run lint --workspaces` therefore always fails. → skill
`imprime-architecture`

## Express 5

Version 5 is not a cosmetic bump. The behaviour this codebase depends on:

- **Async handlers that reject are forwarded to the error middleware
  automatically.** No `try/catch` in routes, no `express-async-handler`. Writing
  a try/catch that only rebuilds an error response is reimplementing
  `errorHandler`. → skill `backend-routes`
- **Wildcards are named**: `/api/auth/*splat`, `/*splat`. The Express 4 bare `*`
  no longer parses.

Middleware order in `server.ts` is load-bearing and is:

```
helmet → cors → rate limit (/api/auth) → better-auth handler
→ OAuth discovery (root level) → express.json({ limit: '10mb' })
→ request logging → public routes → requireAuth + API routers
→ /api/mcp (own session auth) → errorHandler → static frontend (prod)
```

`errorHandler` must stay last, and the static SPA fallback after it. `express.json`
sits **after** the better-auth handler because better-auth consumes the raw
request itself.

`helmet` runs with `contentSecurityPolicy: false` and `crossOriginEmbedderPolicy: false`
— relaxed because the same server serves the built SPA. HSTS is production-only.

`CORS_ORIGIN` accepts a comma-separated list; `'*'` throws at startup in
production. That check is deliberate — do not soften it.

## Mongoose 8

Models are thin; the query logic lives in services. → skills `backend-persistence`,
`backend-services`

Connection is `connectDatabase()` (`config/database.ts`), which `process.exit(1)`s
on failure — the server must not come up half-connected. `MONGODB_URI` is read
*inside* the function so `loadEnv` has already run.

**There are two connections to the same database**, on purpose:

| Connection | Driver | Used by |
|---|---|---|
| `mongoose.connect()` | Mongoose | application models |
| `authMongoClient` (`config/authDb.ts`) | raw `mongodb` `MongoClient` | better-auth's `mongodbAdapter` |

better-auth manages its own collections and needs a native client. Only
`closeAuthDb()` is closed on shutdown; the Mongoose connection is left to
process exit.

## better-auth

`services/AuthService.ts` builds the instance in `buildAuth()` and exposes it
as `instance`. Everything about auth is configuration, assembled conditionally
from the environment **and from the instance settings admins store in the
database** (`SettingsService`, passed in as `AuthSettings`):

- email + password always on, `minPasswordLength: 8`, reset token 15 min;
  who may use it is `AuthSettings.passwordPolicy` (`disableSignUp` unless
  `'open'`);
- **the access policy lives in `databaseHooks`**: `user.create.before` refuses
  an address outside `allowedDomains` (a provider's must also be verified),
  and the administrator's address from a provider that does not vouch for it;
  `session.create.before` — which runs after the credentials were checked, so
  it leaks nothing — promotes ADMIN_EMAIL (always: role and verified
  address), exempts admins, refuses a password
  session under `'admins'` (only `/callback/:id` and `/sign-in/social` are
  single sign-on), and an unlisted or unverified address. A thrown `APIError`
  answers the request, or redirects a single sign-on to its `errorCallbackURL`
  with the code. A Microsoft provider in the organisation's own tenant marks
  addresses verified (`mapProfileToUser`): shared tenants do not vouch for them;
- account linking is left to better-auth's defaults — **no `trustedProviders`**:
  an SSO account joins an existing one only when the provider vouches for the
  address and the local one is verified, or an account claiming an address
  (the administrator's) could take it over;
- Google / GitHub / Microsoft added **only while an admin has configured
  them** (`AuthSettings.sso`, secrets decrypted; one whose secret no longer
  decrypts is left out rather than offered broken);
- password reset and the verification sender exist only while `MailerService`
  has an SMTP server; `requireEmailVerification` (with `sendOnSignIn`, so
  accounts created before it was on get a link) only with one too —
  `SettingsService` refuses the combination rather than letting signups go
  unverifiable;
- plugins: `apiKey()` for programmatic access, `admin()` for the role,
  `mcp()` for the OAuth flow the Claude web connector uses.

better-auth reads its options **once**, at construction. Settings that change
at runtime therefore take effect by building a new instance
(`AuthService.applySettings`, always with the whole document: email and
single sign-on together), which is why nothing may capture
`authService.instance` at startup: `server.ts` serves `/api/auth/*` through
`authService.handler`, and every other caller reads the getter at each use.
Sessions live in the database, so a rebuild signs nobody out.

`enabledProviders` is computed alongside and served at `GET /api/auth-providers`
so the login page renders only what works. Adding a provider means extending
`SSO_PROVIDERS` in common, then following the compiler: the settings schema,
`buildAuth`, the login buttons and the admin card.

Two resolution helpers on the service, used by the auth middleware and the MCP
router: `resolveApiKeyOwner(key)` and `resolveMcpBearerOwner(token)`. Both return
a user id or `null`, never throw.

## MCP SDK

`@modelcontextprotocol/sdk` with `StreamableHTTPServerTransport`, one session per
client, 30-minute idle timeout. Tools are registered per session, closed over the
resolved `ownerId`. → skill `api-surfaces`

**zod is used only here** — the MCP tools define `inputSchema`/`outputSchema` with
it. Note `import { z } from 'zod/v3'`: the MCP SDK ≥1.23 added Zod v4 support and
the v3 entry point is what currently type-checks. The same file carries a
documented `@ts-ignore TS2589` with an upstream issue link; that is the house
form for a suppression.

REST routes do **not** use zod. → skill `backend-routes`

## Other libraries

| Library | Role |
|---|---|
| `@react-pdf/renderer` | PDF export (→ skill `pdf-export`) |
| `express-rate-limit` | 20 requests / 15 min on `/api/auth` only |
| `nodemailer` | `MailerService`, entirely optional — configured from the SMTP server stored in the database (Administration → Email), `isConfigured` is false without one, and the features that need it turn themselves off |
| `dotenv` | loaded by `src/loadEnv.ts`, imported first in `server.ts` |

## Environment

`loadEnv.ts` resolves **the monorepo root `.env`**, three levels up from
`src/` — not a per-package file. It must be imported before anything reads
`process.env`, which is why `server.ts` opens with `import './loadEnv.js'` and
`config/authDb.ts` imports it again defensively.

Variables with real startup validation: `CORS_ORIGIN` (no `'*'` in production),
`PUBLIC_APP_URL` (must be an absolute http(s) URL — the MCP export tool throws
otherwise). Everything else degrades quietly, which is a reason to check
`.env.example` when adding one.

Email and single sign-on are **not** configured by the environment: the SMTP
server, address verification and the Google / GitHub / Microsoft applications
are instance settings, set by an admin in the app and stored in
`InstanceSettings` (SMTP password and client secrets encrypted with the auth
secret, `AuthService.encrypt`). `ADMIN_EMAIL` is what bootstraps that admin.
Two server commands act on it: `npm run admin:reset-password`
(`scripts/resetAdminPassword.ts`), the way back in when they cannot sign in,
and `npm run admin:demote-others`, which takes the role from every other
account after `ADMIN_EMAIL` changed.

## Build

- dev: `tsx watch src/server.ts`
- prod: esbuild bundles to `dist/server.js` with `--packages=external`, so
  `node_modules` is still required at runtime
- typecheck: `tsc --noEmit`, and it **needs** `NODE_OPTIONS=--max-old-space-size=6144`

The bundle changes the directory depth at runtime, which is why `config/fonts.ts`
probes two candidate paths for the font directory. Any new runtime file lookup
has the same problem. → skill `pdf-export`

## Related

- Skills: `backend-structure`, `backend-routes`, `backend-services`,
  `backend-persistence`, `api-surfaces`
- Commands: `/verify`, `/new-endpoint`
