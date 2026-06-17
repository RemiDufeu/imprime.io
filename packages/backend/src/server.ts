import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import { connectDatabase } from './config/database.js'
import presentationsRouter from './routes/presentations.js'
import slideRouter from './routes/slides.js'
import variablesRouter from './routes/variables.js'
import exportRouter from './routes/export.js'
import imagesRouter from './routes/images.js'
import { createMcpRouter } from './mcp/router.js'
import type { Server as HttpServer } from 'http'
import { errorHandler } from './middleware/errorHandler.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables from root .env file
dotenv.config({ path: path.resolve(__dirname, '../../../.env') })

const app = express()
const PORT = process.env.PORT || 3001
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173'

const expressMiddleware = CORS_ORIGIN === '*'
  ? cors({ origin: '*', credentials: false })
  : cors({ origin: CORS_ORIGIN, credentials: true })

// Middleware
app.use(expressMiddleware)
app.use(express.json({ limit: '10mb' }))

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`)
  next()
})

// API Routes
app.use('/api/presentations', presentationsRouter)
app.use('/api/presentations', slideRouter)
app.use('/api/presentations', variablesRouter)
app.use('/api/export', exportRouter)
app.use('/api/images', imagesRouter)
const mcp = createMcpRouter()
app.use('/api/mcp', mcp.router)

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Error handling middleware (must be after all routes)
app.use(errorHandler)

// Serve static files from frontend build in production
if (process.env.NODE_ENV === 'production') {
  const frontendDistPath = path.join(__dirname, '../../frontend/dist')

  // Serve static files
  app.use(express.static(frontendDistPath))

  // Handle client-side routing - return index.html for all non-API routes
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
    } catch (err) {
      console.error('Error closing MCP transports:', err)
    }
    httpServer.close(() => process.exit(0))
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

async function startServer() {
  try {
    await connectDatabase()
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
