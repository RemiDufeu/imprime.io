import { Router } from 'express'
import type { VariableValueType } from '@imprime/common'
import { previewService } from '../services/index.js'
import { requireOwnsTemplate } from '../middleware/requireOwnsTemplate.js'
import { requireOwnsPreview } from '../middleware/requireOwnsPreview.js'
import { sendPdf } from './attachments.js'

// Mounted on /api/templates: a preview is made of one of the caller's
// templates. The body is the variable values, as an export's.
export const templatePreviewsRouter = Router()

templatePreviewsRouter.post('/:id/previews', requireOwnsTemplate, async (req, res) => {
  const variableValues: Record<string, VariableValueType> = req.body || {}
  const preview = await previewService.create(req.params.id, req.user!.id, variableValues)
  res.status(201).json(preview)
})

// Mounted on /api/previews.
const router = Router()

router.get('/:id', requireOwnsPreview, async (req, res) => {
  const preview = await previewService.getById(req.params.id)
  res.json(preview)
})

router.post('/:id/pdf', requireOwnsPreview, async (req, res) => {
  const startTime = Date.now()
  const { title, ...result } = await previewService.exportToPDF(req.params.id, req.user!.id)
  sendPdf(res, result, title, Date.now() - startTime)
})

export default router
