import { Router, type Response } from 'express'
import type { ExportDTO } from '@imprime/common'
import { EXPORT_WARNINGS_HEADER } from '@imprime/common'
import { templateService, exportService } from '../services/index.js'
import { takePdf } from '../services/pdfDownloadStore.js'
import { requireOwnsTemplate } from '../middleware/requireOwnsTemplate.js'

const router = Router()

function setPdfDownloadHeaders(res: Response, buffer: Buffer, filename: string): void {
  const ascii = filename.replace(/[^\w.\- ]/g, '_') || 'template.pdf'
  const utf8 = encodeURIComponent(filename)
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`
  )
  res.setHeader('Content-Length', buffer.length)
}

router.post('/:id/pdf', requireOwnsTemplate, async (req, res) => {
  const template = await templateService.getById(req.params.id)
  const payload: ExportDTO.PdfRequest = { variableValues: req.body || {} }

  const startTime = Date.now()
  const { pdf, warnings } = await exportService.exportToPDF(template, req.user!.id, payload)
  const duration = Date.now() - startTime

  setPdfDownloadHeaders(res, pdf, `${template.title || 'template'}.pdf`)
  res.setHeader('X-Generation-Time', duration.toString())
  // The PDF is the body, so what the caller should know about it rides in a
  // header — ASCII JSON, read by the SDK's `exportPDF`.
  if (warnings.length > 0) res.setHeader(EXPORT_WARNINGS_HEADER, JSON.stringify(warnings))

  res.send(pdf)
})

router.get('/download/:token', (req, res) => {
  const entry = takePdf(req.params.token)
  if (!entry) {
    res.status(404).json({ error: 'Link expired or invalid' })
    return
  }

  setPdfDownloadHeaders(res, entry.buffer, entry.filename)
  res.send(entry.buffer)
})

export default router
