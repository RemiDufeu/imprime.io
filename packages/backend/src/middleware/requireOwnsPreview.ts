import type { RequestHandler } from 'express'
import { PreviewModel } from '../models/Preview.js'
import { isObjectIdString } from '../models/mappers.js'
import { previewNotFound } from '../services/PreviewService.js'
import { assertOwnsTemplate } from './requireOwnsTemplate.js'

/**
 * Throws `NotFoundError` unless `ownerId` owns the preview `id` and the
 * template it shows — not disclosing that someone else's exists. Shared by
 * the Express middleware and non-HTTP entry points.
 */
export async function assertOwnsPreview(id: string, ownerId: string): Promise<void> {
  const preview = isObjectIdString(id) ? await PreviewModel.findById(id).select('ownerId templateId') : null
  if (!preview || preview.ownerId !== ownerId) throw previewNotFound()
  await assertOwnsTemplate(preview.templateId.toString(), ownerId)
}

/** Express middleware form. Assumes `requireAuth` ran first. */
export const requireOwnsPreview: RequestHandler<{ id: string } & Record<string, string>> =
  async (req, _res, next) => {
    try {
      await assertOwnsPreview(req.params.id, req.user!.id)
      next()
    } catch (err) {
      next(err)
    }
  }
