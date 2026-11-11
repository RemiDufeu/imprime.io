import type { Request, Response, NextFunction } from 'express'
import { fromNodeHeaders } from 'better-auth/node'
import { authService } from '../services/index.js'
import { ForbiddenError } from '../services/errors.js'

/**
 * The REST routes an API key opens: listing and reading one's templates,
 * printing them, previewing them. Building a template — pages, variables,
 * images — and fonts, settings, template files take a session: the editor's.
 *
 * Closed by default: a route added later is out of an API key's reach until
 * it is listed here. Matched as the routers match — any case, an optional
 * trailing slash. The MCP server is not behind `requireAuth`: it resolves
 * its own credentials (`mcp/router.ts`), and an API key keeps every tool there.
 */
const API_KEY_ROUTES: ReadonlyArray<{ method: string; path: RegExp }> = [
  { method: 'GET', path: /^\/api\/templates\/?$/i }, // listTemplates
  { method: 'GET', path: /^\/api\/templates\/[^/]+\/?$/i }, // getTemplate
  { method: 'POST', path: /^\/api\/export\/[^/]+\/pdf\/?$/i }, // exportPDF
  { method: 'POST', path: /^\/api\/export\/code\/[^/]+\/pdf\/?$/i }, // exportPDFByCode
  { method: 'POST', path: /^\/api\/templates\/[^/]+\/previews\/?$/i }, // createPreview
  { method: 'GET', path: /^\/api\/previews\/[^/]+\/?$/i }, // getPreview
  { method: 'POST', path: /^\/api\/previews\/[^/]+\/pdf\/?$/i }, // exportPreviewPDF
]

function apiKeyMayCall(req: Request): boolean {
  const path = req.baseUrl + req.path
  return API_KEY_ROUTES.some((route) => route.method === req.method && route.path.test(path))
}

/**
 * Require authentication for the request.
 *
 * Accepts two authentication methods:
 *  - session cookie resolved by Better Auth: every route;
 *  - API key via the `x-api-key` header (programmatic access / SDK): only
 *    the routes of `API_KEY_ROUTES`, 403 `API_KEY_NOT_ALLOWED` elsewhere.
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
        // After the key is resolved: a wrong key is a 401 on any route.
        if (!apiKeyMayCall(req)) {
          throw new ForbiddenError(
            'Not available with an API key, which lists, reads, exports and previews templates only',
            'API_KEY_NOT_ALLOWED',
          )
        }
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
