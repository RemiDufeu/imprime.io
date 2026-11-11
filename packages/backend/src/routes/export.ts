import { Router, type Request, type Response } from 'express'
import type { ExportDTO } from '@imprime/common'
import { templateService, exportService } from '../services/index.js'
import { requireOwnsTemplate } from '../middleware/requireOwnsTemplate.js'
import { sendPdf } from './attachments.js'

const router = Router()

async function sendTemplatePdf(req: Request, res: Response, templateId: string): Promise<void> {
  const template = await templateService.getById(templateId)
  const payload: ExportDTO.PdfRequest = { variableValues: req.body || {} }

  const startTime = Date.now()
  const result = await exportService.exportToPDF(template, req.user!.id, payload)
  sendPdf(res, result, template.title, Date.now() - startTime)
}

// Found among the caller's own templates only: that is the ownership check.
router.post('/code/:code/pdf', async (req, res) => {
  const templateId = await templateService.getIdByCode(req.params.code, req.user!.id)
  await sendTemplatePdf(req, res, templateId)
})

router.post('/:id/pdf', requireOwnsTemplate, async (req, res) => {
  await sendTemplatePdf(req, res, req.params.id)
})

export default router
