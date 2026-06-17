import { Router, type Response } from 'express'
import type { ExportDTO } from '@imprime/common'
import { presentationService, exportService } from '../services/index.js'
import { takePdf } from '../services/pdfDownloadStore.js'

const router = Router()

function setPdfDownloadHeaders(res: Response, buffer: Buffer, filename: string): void {
  const ascii = filename.replace(/[^\w.\- ]/g, '_') || 'presentation.pdf'
  const utf8 = encodeURIComponent(filename)
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`
  )
  res.setHeader('Content-Length', buffer.length)
}

router.post('/:id/pdf', async (req, res) => {
  const presentation = await presentationService.getById(req.params.id)
  const payload: ExportDTO.PdfRequest = { variableValues: req.body || {} }

  const startTime = Date.now()
  const pdfBuffer = await exportService.exportToPDF(presentation, payload)
  const duration = Date.now() - startTime

  setPdfDownloadHeaders(res, pdfBuffer, `${presentation.title || 'presentation'}.pdf`)
  res.setHeader('X-Generation-Time', duration.toString())

  res.send(pdfBuffer)
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
