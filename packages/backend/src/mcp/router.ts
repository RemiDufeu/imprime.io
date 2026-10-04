import { Router, type Request, type Response } from 'express'
import { randomUUID } from 'node:crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { registerTools } from './tools/index.js'
import { authService } from '../services/index.js'

interface SessionMeta {
  transport: StreamableHTTPServerTransport
  // Whose credentials opened it: every later request must carry theirs.
  ownerId: string
  lastActivity: number
}

const SESSION_IDLE_MS = 30 * 60 * 1000
const SESSION_SWEEP_MS = 5 * 60 * 1000
// Each session holds a server in memory. A client that reconnects without
// closing its previous session would hit a refusal, so the oldest goes.
const MAX_SESSIONS_PER_OWNER = 10

/**
 * Who the request is from: an OAuth Bearer token (MCP web connectors) or an
 * API key (CLI/SDK). Checked on every request, not only the one that opens
 * the session, so that a revoked key, an expired token or a user the access
 * rules now shut out loses the sessions they opened too.
 */
async function resolveOwner(req: Request): Promise<string | null> {
  const authHeader = req.headers.authorization
  const apiKeyHeader = req.headers['x-api-key']
  if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
    return authService.resolveMcpBearerOwner(authHeader.slice(7).trim())
  }
  if (typeof apiKeyHeader === 'string') {
    return authService.resolveApiKeyOwner(apiKeyHeader)
  }
  return null
}

function sendUnauthorized(res: Response): void {
  // RFC 9728: point clients to the protected-resource metadata so they can
  // discover the authorization server.
  const base = process.env.PUBLIC_APP_URL ?? ''
  res.setHeader(
    'WWW-Authenticate',
    `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`,
  )
  res.status(401).json({
    jsonrpc: '2.0',
    error: {
      code: -32001,
      message: 'Unauthorized: OAuth Bearer token or x-api-key header required',
    },
    id: null,
  })
}

export interface McpRouter {
  router: Router
  close: () => Promise<void>
}

export function createMcpRouter(): McpRouter {
  const router = Router()
  const sessions = new Map<string, SessionMeta>()

  const closeSession = (id: string, meta: SessionMeta) => {
    sessions.delete(id)
    void meta.transport.close?.()
  }

  // Makes room for one more session of `ownerId`'s.
  const evictOldestSessions = (ownerId: string) => {
    const own = [...sessions].filter(([, meta]) => meta.ownerId === ownerId)
    own.sort(([, a], [, b]) => a.lastActivity - b.lastActivity)
    for (const [id, meta] of own.slice(0, Math.max(0, own.length - MAX_SESSIONS_PER_OWNER + 1))) {
      closeSession(id, meta)
    }
  }

  // The session the request names, once its credentials prove it is the
  // owner's; otherwise the response is sent and undefined returned. As the
  // MCP transport specifies: 400 without a session id, 404 for an unknown
  // one, which tells the client to start a new session. Someone else's
  // session answers as an unknown one.
  const authorizedSession = async (req: Request, res: Response): Promise<SessionMeta | undefined> => {
    const sessionId = req.headers['mcp-session-id']
    if (typeof sessionId !== 'string') {
      res.status(400).json({ error: 'Missing session ID' })
      return undefined
    }
    const ownerId = await resolveOwner(req)
    if (!ownerId) {
      sendUnauthorized(res)
      return undefined
    }
    const meta = sessions.get(sessionId)
    if (!meta || meta.ownerId !== ownerId) {
      res.status(404).json({ error: 'Session not found' })
      return undefined
    }
    meta.lastActivity = Date.now()
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
    const meta = await authorizedSession(req, res)
    if (meta) await meta.transport.handleRequest(req, res)
  }

  router.post('/', async (req: Request, res: Response) => {
    if (req.headers['mcp-session-id'] !== undefined) {
      const meta = await authorizedSession(req, res)
      if (meta) await meta.transport.handleRequest(req, res, req.body)
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

    const ownerId = await resolveOwner(req)
    if (!ownerId) {
      sendUnauthorized(res)
      return
    }
    evictOldestSessions(ownerId)

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, { transport, ownerId, lastActivity: Date.now() })
      },
    })

    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId)
    }

    const mcp = new McpServer({ name: 'imprime-mcp', version: '1.0.0' })
    registerTools(mcp, ownerId)
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
