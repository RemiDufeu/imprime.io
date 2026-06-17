import { Router, type Request, type Response } from 'express'
import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { registerTools } from './tools/index.js'

interface SessionMeta {
  transport: StreamableHTTPServerTransport
  lastActivity: number
}

const SESSION_IDLE_MS = 30 * 60 * 1000
const SESSION_SWEEP_MS = 5 * 60 * 1000

export interface McpRouter {
  router: Router
  close: () => Promise<void>
}

export function createMcpRouter(): McpRouter {
  const router = Router()
  const sessions = new Map<string, SessionMeta>()

  const touch = (sessionId: string | undefined): SessionMeta | undefined => {
    if (!sessionId) return undefined
    const meta = sessions.get(sessionId)
    if (meta) meta.lastActivity = Date.now()
    return meta
  }

  const sweepTimer = setInterval(() => {
    const now = Date.now()
    for (const [id, meta] of sessions) {
      if (now - meta.lastActivity > SESSION_IDLE_MS) {
        void meta.transport.close?.()
        sessions.delete(id)
      }
    }
  }, SESSION_SWEEP_MS)
  sweepTimer.unref()

  const handleSessionRequest = async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    const meta = touch(sessionId)
    if (!meta) {
      res.status(400).json({ error: 'Invalid or missing session ID' })
      return
    }
    await meta.transport.handleRequest(req, res)
  }

  router.post('/', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    const existing = touch(sessionId)
    if (existing) {
      await existing.transport.handleRequest(req, res, req.body)
      return
    }

    if (!isInitializeRequest(req.body)) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: no valid session ID' },
        id: null,
      })
      return
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, { transport, lastActivity: Date.now() })
      },
    })

    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId)
    }

    const mcp = new McpServer({ name: 'imprime-mcp', version: '1.0.0' })
    registerTools(mcp)
    await mcp.connect(transport)

    await transport.handleRequest(req, res, req.body)
  })

  router.get('/', handleSessionRequest)
  router.delete('/', handleSessionRequest)

  return {
    router,
    close: async () => {
      clearInterval(sweepTimer)
      await Promise.allSettled(
        [...sessions.values()].map((meta) => meta.transport.close?.())
      )
      sessions.clear()
    },
  }
}
