import type { RequestHandler } from 'express'
import { TemplateModel } from '../models/Template.js'
import { NotFoundError } from '../services/errors.js'

/**
 * Throws `NotFoundError` if `ownerId` does not own the template `id`
 * (does not disclose existence to third parties). Shared by the Express
 * middleware and non-HTTP entry points (MCP tools).
 */
export async function assertOwnsTemplate(id: string, ownerId: string): Promise<void> {
  const template = await TemplateModel.findById(id).select('ownerId')
  if (!template || template.ownerId !== ownerId) {
    throw new NotFoundError('Template not found', 'TEMPLATE_NOT_FOUND')
  }
}

/** Express middleware form. Assumes `requireAuth` ran first. */
export const requireOwnsTemplate: RequestHandler<{ id: string } & Record<string, string>> =
  async (req, _res, next) => {
    try {
      await assertOwnsTemplate(req.params.id, req.user!.id)
      next()
    } catch (err) {
      next(err)
    }
  }
