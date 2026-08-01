import type { Request, Response, NextFunction } from 'express'
import { fromNodeHeaders } from 'better-auth/node'
import { authService } from '../services/index.js'

/**
 * Require authentication for the request.
 *
 * Accepts two authentication methods:
 *  - session cookie resolved by Better Auth,
 *  - API key via the `x-api-key` header (programmatic access / SDK).
 *
 * Sets `req.user` or responds with 401.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await authService.instance.api.getSession({
      headers: fromNodeHeaders(req.headers),
    })
    if (session?.user) {
      req.user = { id: session.user.id }
      next()
      return
    }

    const apiKeyHeader = req.headers['x-api-key']
    if (typeof apiKeyHeader === 'string' && apiKeyHeader.length > 0) {
      const userId = await authService.resolveApiKeyOwner(apiKeyHeader)
      if (userId) {
        req.user = { id: userId }
        next()
        return
      }
    }

    res.status(401).json({ code: 'UNAUTHENTICATED', error: 'Authentication required' })
  } catch (err) {
    next(err)
  }
}
