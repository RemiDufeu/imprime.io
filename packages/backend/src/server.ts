import './loadEnv.js'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import path from 'path'
import { fileURLToPath } from 'url'
import { oAuthDiscoveryMetadata, oAuthProtectedResourceMetadata } from 'better-auth/plugins'
import type { Server as HttpServer } from 'http'
import { connectDatabase } from './config/database.js'
import { connectAuthDb, closeAuthDb } from './config/authDb.js'
import { authService, settingsService } from './services/index.js'
import { CLIENT_IP_HEADER } from './services/AuthService.js'
import { requireAuth } from './middleware/requireAuth.js'
import templatesRouter from './routes/templates.js'
import pageRouter from './routes/pages.js'
import variablesRouter from './routes/variables.js'
import exportRouter from './routes/export.js'
import imagesRouter from './routes/images.js'
import fontsRouter from './routes/fonts.js'
import settingsRouter from './routes/settings.js'
import oauthConsentRouter from './routes/oauthConsent.js'
import { createMcpRouter } from './mcp/router.js'
import { errorHandler } from './middleware/errorHandler.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3001
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173'
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

if (IS_PRODUCTION && CORS_ORIGIN === '*') {
  throw new Error(
    'CORS_ORIGIN="*" is not allowed in production. Set an explicit origin list (comma-separated).',
  )
}

/**
 * PUBLIC_APP_URL is what links in emails and single sign-on callbacks are
 * built from. Without it, better-auth takes each request's Host header —
 * anyone's to write — so a password reset asked for with `Host: evil.example`
 * would email the real user a link that hands the token to that site.
 */
function checkPublicAppUrl(): void {
  if (!IS_PRODUCTION) return
  const value = process.env.PUBLIC_APP_URL?.trim()
  let url: URL | null = null
  try {
    url = value ? new URL(value) : null
  } catch {
    url = null
  }
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
    throw new Error(
      'PUBLIC_APP_URL must be set in production to the address users open, e.g. https://imprime.example.com: without it, links in emails are built from the Host header, which anyone can write.',
    )
  }
  // better-auth marks cookies Secure from the base URL's scheme.
  if (url.protocol === 'http:') {
    console.warn(`PUBLIC_APP_URL is ${url.origin}, not https: session cookies go without the Secure flag, readable on the network.`)
  }
}

checkPublicAppUrl()

/**
 * The reverse proxies in front of the server (TRUST_PROXY): how many, or their
 * addresses as Express takes them ("loopback", "10.0.0.0/8"). The client's
 * address is then read from X-Forwarded-For, past them. Unset, it is the
 * connection's: the header is anyone's to write.
 */
function trustProxy(): number | string | undefined {
  const value = process.env.TRUST_PROXY?.trim()
  if (!value) return undefined
  if (/^\d+$/.test(value)) return Number(value)
  if (value.toLowerCase() === 'true') {
    throw new Error('TRUST_PROXY="true" would trust an X-Forwarded-For anyone can write: give the number of proxies, or their addresses.')
  }
  return value
}

const TRUST_PROXY = trustProxy()
if (TRUST_PROXY !== undefined) app.set('trust proxy', TRUST_PROXY)

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    hsts: IS_PRODUCTION ? { maxAge: 15552000, includeSubDomains: true } : false,
  }),
)

const expressMiddleware = CORS_ORIGIN === '*'
  ? cors({ origin: '*', credentials: false })
  : cors({ origin: CORS_ORIGIN.split(',').map((o) => o.trim()), credentials: true })

// CORS First
app.use(expressMiddleware)

// Per client address (`req.ip`, which TRUST_PROXY decides). Not the session
// check, which the app makes at each page load and each time the tab regains
// focus: counted, it would lock users out of the app they are signed into.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => req.path === '/get-session',
  message: { error: 'Too many authentication attempts. Please try again later.' },
})
app.use('/api/auth', authLimiter)

// better-auth's own limits — sign-in, emails sent — key on this header:
// written here, from the address Express resolved, whatever the client sent.
app.use('/api/auth', (req, _res, next) => {
  if (req.ip) req.headers[CLIENT_IP_HEADER] = req.ip
  else delete req.headers[CLIENT_IP_HEADER]
  next()
})

// better-auth's MCP plugin asks the user only when the client sends exactly
// `prompt=consent`; otherwise the authorization code goes straight to the
// client's redirect URI. Anyone may register a client — MCP clients do so
// themselves, anonymously — so without this, one link opened by a signed-in
// user would hand a stranger's site their access, unseen. Rewritten here,
// before better-auth reads the URL, and kept through the sign-in it may
// detour by.
app.get('/api/auth/mcp/authorize', (req, _res, next) => {
  const url = new URL(req.url, 'http://localhost')
  url.searchParams.set('prompt', 'consent')
  req.url = `${url.pathname}${url.search}`
  next()
})

// Through the service, never a captured instance: it is rebuilt when the
// email settings change.
app.all('/api/auth/*splat', authService.handler)

// OAuth 2.0 discovery endpoints — MUST be at root per RFC 8414 / RFC 9728 so
// MCP clients (Claude web connector) can discover the authorization server.
const discovery = (req: globalThis.Request) => oAuthDiscoveryMetadata(authService.instance)(req)
const protectedResource = (req: globalThis.Request) => oAuthProtectedResourceMetadata(authService.instance)(req)
const adaptWebHandler =
  (handler: (req: globalThis.Request) => Promise<globalThis.Response>) =>
  async (req: express.Request, res: express.Response) => {
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`
    const webRes = await handler(new globalThis.Request(url, { method: req.method }))
    res.status(webRes.status)
    webRes.headers.forEach((v, k) => res.setHeader(k, v))
    res.send(await webRes.text())
  }
app.get('/.well-known/oauth-authorization-server', adaptWebHandler(discovery))
app.get('/.well-known/oauth-protected-resource', adaptWebHandler(protectedResource))

app.use(express.json({ limit: '10mb' }))

// Request logging: the path, never the query string, which carries secrets —
// the password reset link lands on /reset-password?token=…
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.path}`)
  next()
})

// Health check (public)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Enabled auth providers (public, consumed by the login page)
app.get('/api/auth-providers', (_req, res) => {
  res.json(authService.enabledProviders)
})

// Protected API routes (session cookie or API key)
app.use('/api/templates', requireAuth, templatesRouter)
app.use('/api/templates', requireAuth, pageRouter)
app.use('/api/templates', requireAuth, variablesRouter)
app.use('/api/export', requireAuth, exportRouter)
app.use('/api/images', requireAuth, imagesRouter)
app.use('/api/fonts', requireAuth, fontsRouter)
app.use('/api/settings', requireAuth, settingsRouter)
app.use('/api/oauth-consent', requireAuth, oauthConsentRouter)

// MCP (owns its own sessions, outside the requireAuth pipeline for now)
const mcp = createMcpRouter()
app.use('/api/mcp', mcp.router)

// Error handling middleware (after all routes)
app.use(errorHandler)

// Serve static files from frontend build in production
if (process.env.NODE_ENV === 'production') {
  const frontendDistPath = path.join(__dirname, '../../frontend/dist')
  app.use(express.static(frontendDistPath))
  app.get('/*splat', (_req, res) => {
    res.sendFile(path.join(frontendDistPath, 'index.html'))
  })
}

function installShutdownHandlers(httpServer: HttpServer): void {
  let shuttingDown = false
  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    console.log(`${signal} received, shutting down...`)
    const forceExit = setTimeout(() => process.exit(1), 10_000)
    forceExit.unref()
    try {
      await mcp.close()
      await closeAuthDb()
    } catch (err) {
      console.error('Error during shutdown:', err)
    }
    httpServer.close(() => process.exit(0))
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

async function startServer() {
  try {
    await connectDatabase()
    await connectAuthDb()
    await settingsService.load()
    await authService.promoteConfiguredAdmin()
    const httpServer = app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`)
    })
    installShutdownHandlers(httpServer)
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

startServer()
