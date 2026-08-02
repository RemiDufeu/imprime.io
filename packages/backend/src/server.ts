import './loadEnv.js'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import path from 'path'
import { fileURLToPath } from 'url'
import { toNodeHandler } from 'better-auth/node'
import { oAuthDiscoveryMetadata, oAuthProtectedResourceMetadata } from 'better-auth/plugins'
import type { Server as HttpServer } from 'http'
import { connectDatabase } from './config/database.js'
import { connectAuthDb, closeAuthDb } from './config/authDb.js'
import { authService } from './services/index.js'
import { requireAuth } from './middleware/requireAuth.js'
import presentationsRouter from './routes/presentations.js'
import slideRouter from './routes/slides.js'
import variablesRouter from './routes/variables.js'
import exportRouter from './routes/export.js'
import imagesRouter from './routes/images.js'
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

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again later.' },
})
app.use('/api/auth', authLimiter)

app.all('/api/auth/*splat', toNodeHandler(authService.instance))

// OAuth 2.0 discovery endpoints — MUST be at root per RFC 8414 / RFC 9728 so
// MCP clients (Claude web connector) can discover the authorization server.
const discovery = oAuthDiscoveryMetadata(authService.instance)
const protectedResource = oAuthProtectedResourceMetadata(authService.instance)
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

// Request logging
app.use((req, res, next) => {
  const isAuthPath = req.path.startsWith('/api/auth')
  console.log(`${req.method} ${isAuthPath ? req.path : req.originalUrl}`)
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
app.use('/api/presentations', requireAuth, presentationsRouter)
app.use('/api/presentations', requireAuth, slideRouter)
app.use('/api/presentations', requireAuth, variablesRouter)
app.use('/api/export', requireAuth, exportRouter)
app.use('/api/images', requireAuth, imagesRouter)

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
