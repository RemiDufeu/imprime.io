import type { Request, Response, NextFunction } from 'express'
import { fromNodeHeaders } from 'better-auth/node'
import { auth } from '../auth/auth.js'
import { resolveApiKeyOwner } from '../auth/resolveApiKeyOwner.js'

/**
 * Exige un utilisateur authentifié.
 *
 * Accepte deux modes :
 *  - session cookie (navigateur), résolue par Better Auth,
 *  - clé d'API via l'en-tête `x-api-key` (accès programmatique / SDK).
 *
 * Pose `req.user` ou répond 401.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
    if (session?.user) {
      req.user = { id: session.user.id, email: session.user.email ?? undefined }
      next()
      return
    }

    const apiKeyHeader = req.headers['x-api-key']
    if (typeof apiKeyHeader === 'string' && apiKeyHeader.length > 0) {
      const userId = await resolveApiKeyOwner(apiKeyHeader)
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
