---
name: backend-stack
description: The libraries the Imprime backend runs on and how each is configured — Express 5, Mongoose 8, better-auth, the MCP SDK, zod, helmet/cors/rate-limit, nodemailer — plus the ESM and TypeScript Node16 rules, environment loading, and the two separate database connections. Use when writing or reviewing backend code, adding a dependency, or debugging startup and config.
metadata:
  origin: adapted from ECC (github.com/affaan-m/ECC)
---

# Backend Stack

`packages/backend` — Express 5 on Node 20+ (24 in CI and the Docker image), MongoDB via Mongoose, better-auth
for identity, and an MCP server. `tsx watch` in development, a single esbuild
bundle in production.

## ESM and TypeScript

`"type": "module"` with `module: Node16` / `moduleResolution: node16`. Two
consequences that bite immediately:

- **Every relative import carries a `.js` extension**, even from a `.ts` source:
  `import { pageService } from '../services/index.js'`. Omit it and the build
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

`CORS_ORIGIN` accepts a comma-separated list, and defaults to the app's own
origin — `PUBLIC_APP_URL`'s in production, Vite's dev server otherwise: the
editor is served same-origin, so nothing else is needed. `'*'` throws at startup in
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

**A replica set is optional.** `connectAuthDb` asks the server (`hello`) whether
it is a replica set member or a mongos; better-auth's adapter gets
`transaction: authDbSupportsTransactions()`, so its multi-write operations
(a sign-up: user, then account) are atomic there and plain writes on a single
`mongod`, which refuses transactions outright. The flag is false until the
connection, so the instance must be (re)built after it — `SettingsService.load`
does, at startup, and the admin commands build `AuthService` once connected.
The application's own models use no transactions at all (→ skill
`backend-persistence`).

## better-auth

`services/AuthService.ts` builds the instance in `buildAuth()` and exposes it
as `instance`. Everything about auth is configuration, assembled conditionally
from the environment **and from the instance settings admins store in the
database** (`SettingsService`, passed in as `AuthSettings`):

- email + password always on, `minPasswordLength: 8`, reset token 15 min;
  who may use it is `AuthSettings.passwordPolicy` (`disableSignUp` unless
  `'open'`);
- **the access policy lives in `databaseHooks`**: `user.create.before` refuses
  an address outside `allowedDomains` (a provider's must also be verified);
  `session.create.before` — which runs after the credentials were checked, so
  it leaks nothing — exempts admins, refuses a password
  session under `'admins'` (only `/callback/:id` and `/sign-in/social` are
  single sign-on), and an unlisted or unverified address. A thrown `APIError`
  answers the request, or redirects a single sign-on to its `errorCallbackURL`
  with the code. Microsoft addresses are verified only on the optional claim
  `xms_edov` (`mapProfileToUser`, any tenant): its `email` claim is whatever
  the directory holds (nOAuth);
- **the first account is the administrator**: `user.create.after`
  (`AuthService.accountCreated`) gives it the role when it is the only
  account — two sign-ups at once on a new instance get none, and
  `npm run admin grant` settles it. `/api/auth-providers` adds `firstAccount`
  per request, and the startup log warns while there is no account;
- **onboarding**: the same hook gives every new account (sign-up, first
  single sign-on, an admin's `/admin/create-user`) a copy of the tutorial,
  `OnboardingService.welcome` importing `src/assets/tutorial.imprime.json`.
  better-auth runs it after the transaction commits (after the writes, on a
  server without transactions), and awaits it: a throw
  would fail a request whose account already exists, so `welcome` never
  throws. The admin commands build `AuthService` without it — they connect
  the auth database only;
- **proving an address** — following a verification link
  (`afterEmailVerification`) or a reset link on an unverified account
  (`onPasswordReset`) — marks it verified and revokes the sessions, API keys
  (`apikey.referenceId`) and MCP tokens (`oauthAccessToken.userId`) made
  before (`AuthService.proveAddress`): whoever signed up with the address may
  not own it. Every reset revokes sessions (`revokeSessionsOnPasswordReset`);
- rate limits key on `CLIENT_IP_HEADER`, which `server.ts` overwrites with
  `req.ip` (decided by `TRUST_PROXY`) — never on a client-written
  X-Forwarded-For;
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
a user id or `null`, never throw, and apply the domain list to the owner —
the session hooks never see these credentials.

## MCP SDK

`@modelcontextprotocol/sdk` with `StreamableHTTPServerTransport`, one session per
client, 30-minute idle timeout. Tools are registered per session, closed over the
resolved `ownerId`. → skill `api-surfaces`

**zod is used only here** — the MCP tools define their `inputSchema` with it,
from the domain mirror in `mcp/schemas.ts`. Imports are `from 'zod/v3'` (the v3
API, which zod 4 still ships), and the backend's `zod` must stay the very copy
the MCP SDK resolves (`npm ls zod`: one version, deduped). With a second copy,
`registerTool`'s inference compares two declarations of `ZodType`
structurally: every tool fails with TS2589 and the typecheck runs out of heap.
That, not an SDK regression, was behind the `@ts-expect-error TS2589` the
export tool used to carry.

REST routes do **not** use zod. → skill `backend-routes`

## Other libraries

| Library | Role |
|---|---|
| `@react-pdf/renderer` | PDF export, loaded on worker threads only — never by the server's thread (→ skill `pdf-export`) |
| `express-rate-limit` | 20 requests / 15 min on `/api/auth` only, `get-session` excepted; keyed on `req.ip`, so behind a proxy `TRUST_PROXY` must be set |
| `nodemailer` | v10, typed by itself (no `@types/nodemailer`), needs Node 20+. `MailerService`, entirely optional — configured from the SMTP server stored in the database (Administration → Email), `isConfigured` is false without one, and the features that need it turn themselves off. `requireTLS` whenever credentials are sent; account names are escaped and shortened in emails, since whoever signs up chooses them |
| `dotenv` | loaded by `src/loadEnv.ts`, imported first in `server.ts` |

## Environment

`loadEnv.ts` resolves **the monorepo root `.env`**, three levels up from
`src/` — not a per-package file. It must be imported before anything reads
`process.env`, which is why `server.ts` opens with `import './loadEnv.js'` and
`config/authDb.ts` imports it again defensively.

Variables with real startup validation: `CORS_ORIGIN` (no `'*'` in production),
`TRUST_PROXY` (a number of proxies or Express addresses, never `true`),
`PUBLIC_APP_URL` (an absolute http(s) URL, required in production: without
it better-auth builds email links from the request's Host header, so a reset
asked for with a forged Host mails the token to another site; a warning when
it is http, since cookies then lose `Secure`), `MAX_PDF_RENDERS` and
`MAX_PDF_RENDERS_PER_USER` (whole numbers of 1 or more; empty means 4 and 2),
`PDF_RENDER_TIMEOUT_SECONDS` (1 to 300; empty means 30), `PDF_QUEUE_SIZE`
(0 or more; 10) and `PDF_QUEUE_WAIT_SECONDS` (1 to 300; 10) — all read by
`config/pdfRendering.ts` when `ExportService` is built. The request log prints paths
only, never query strings, which carry tokens. Everything else degrades quietly, which is a reason to check
`.env.example` when adding one.

Email and single sign-on are **not** configured by the environment: the SMTP
server, address verification and the Google / GitHub / Microsoft applications
are instance settings, set by an admin in the app and stored in
`InstanceSettings` (SMTP password and client secrets encrypted with the auth
secret, `AuthService.encrypt`; a stored SMTP password is kept only for the
same host, port and user). The first account to sign up is that admin; one
server command, `npm run admin grant|demote <email>` (`scripts/admin.ts`),
gives and takes the role afterwards; `npm run admin reset-password <email>` gives a locked-out account a new password (address verified, sessions, API keys and MCP tokens revoked).

## Build

- dev: `tsx watch src/server.ts`
- prod: esbuild bundles to `dist/server.js` with `--packages=external`, so
  `node_modules` is still required at runtime. The PDF worker is an entry
  point of its own, `dist/services/pdfWorker.js`: the server starts it as a
  file, so it cannot be inlined into `server.js`
- typecheck: `tsc --noEmit`, and it **needs** `NODE_OPTIONS=--max-old-space-size=6144`
- image: the root `Dockerfile` builds on the build machine's platform
  (`--platform=$BUILDPLATFORM`) and installs production dependencies on the
  target's — `@napi-rs/canvas` is native. It copies `packages/backend/dist`
  whole (the worker with it), `common/dist`, `frontend/dist` and the fonts;
  a new runtime file outside those is missing from the image with no error at
  build time. `.github/workflows/docker.yml` publishes it to GHCR for amd64
  and arm64; `docker-compose.yml` runs it with MongoDB (→ `doc/self-hosting.md`)

The bundle changes the directory depth at runtime: `pdfRenderPool.ts` probes
for the worker's entry (`./pdfWorker.ts` in dev, `./services/pdfWorker.js`
beside `server.js`), and `config/fonts.ts` relies on the bundled worker sitting
in `dist/services/`, as deep as `src/config/`. Any new runtime file lookup has
the same problem. → skill `pdf-export`

**Worker threads do not inherit tsx.** Its loader stays on the main thread, so
in dev a worker started on a `.ts` file cannot resolve its `.js` imports.
`pdfRenderPool.startWorker` starts it from a two-line bootstrap that registers
`tsx/esm/api` first; built, the entry is JavaScript and starts directly.

## Related

- Skills: `backend-structure`, `backend-routes`, `backend-services`,
  `backend-persistence`, `api-surfaces`
- Commands: `/verify`, `/new-endpoint`
