import type { RequestHandler } from 'express'
import { PresentationModel } from '../models/Presentation.js'
import { NotFoundError } from '../services/errors.js'

/**
 * Throws `NotFoundError` if `ownerId` does not own the presentation `id`
 * (does not disclose existence to third parties). Shared by the Express
 * middleware and non-HTTP entry points (MCP tools).
 */
export async function assertOwnsPresentation(id: string, ownerId: string): Promise<void> {
  const presentation = await PresentationModel.findById(id).select('ownerId')
  if (!presentation || presentation.ownerId !== ownerId) {
    throw new NotFoundError('Presentation not found', 'PRESENTATION_NOT_FOUND')
  }
}

/** Express middleware form. Assumes `requireAuth` ran first. */
export const requireOwnsPresentation: RequestHandler<{ id: string } & Record<string, string>> =
  async (req, _res, next) => {
    try {
      await assertOwnsPresentation(req.params.id, req.user!.id)
      next()
    } catch (err) {
      next(err)
    }
  }
