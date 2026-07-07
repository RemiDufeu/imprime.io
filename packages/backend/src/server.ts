import './loadEnv.js'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { toNodeHandler } from 'better-auth/node'
import type { Server as HttpServer } from 'http'
import { connectDatabase } from './config/database.js'
import { connectAuthDb, closeAuthDb } from './config/authDb.js'
import { auth, enabledAuthProviders } from './auth/auth.js'
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

const expressMiddleware = CORS_ORIGIN === '*'
  ? cors({ origin: '*', credentials: false })
  : cors({ origin: CORS_ORIGIN, credentials: true })

// CORS First
app.use(expressMiddleware)

app.all('/api/auth/*splat', toNodeHandler(auth))
app.use(express.json({ limit: '10mb' }))

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`)
  next()
})

// Health check (public)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Providers d'auth activés (public, utilisé par la page de connexion)
app.get('/api/auth-providers', (_req, res) => {
  res.json(enabledAuthProviders)
})

// Routes API protégées (session cookie ou clé d'API)
app.use('/api/presentations', requireAuth, presentationsRouter)
app.use('/api/presentations', requireAuth, slideRouter)
app.use('/api/presentations', requireAuth, variablesRouter)
app.use('/api/export', requireAuth, exportRouter)
app.use('/api/images', requireAuth, imagesRouter)

// MCP (sessions propres, hors auth pour l'instant)
const mcp = createMcpRouter()
app.use('/api/mcp', mcp.router)

// Error handling middleware (après toutes les routes)
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
