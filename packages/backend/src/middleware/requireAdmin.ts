import type { RequestHandler } from 'express'
import { authService } from '../services/index.js'
import { ForbiddenError } from '../services/errors.js'

/**
 * Lets through only users with the admin role, who manage what the whole
 * instance shares (fonts, settings). Assumes `requireAuth` ran first.
 *
 * Answers 403, not 404: what it guards is visible to every user, so there is
 * nothing to hide about its existence.
 */
export const requireAdmin: RequestHandler<Record<string, string>> = async (req, _res, next) => {
  try {
    if (!(await authService.isAdmin(req.user!.id))) {
      throw new ForbiddenError('Admin role required', 'ADMIN_REQUIRED')
    }
    next()
  } catch (err) {
    next(err)
  }
}
