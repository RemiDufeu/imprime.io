import type { Response } from 'express'
import { EXPORT_WARNINGS_HEADER } from '@imprime/common'
import type { ExportResult } from '../services/ExportService.js'

/** Has the browser save the response as a file named `filename`. */
export function setAttachmentHeader(res: Response, filename: string): void {
  const ascii = filename.replace(/[^\w.\- ]/g, '_') || 'download'
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  )
}

/**
 * Sends an exported PDF as a download named after `title`. The PDF is the
 * body, so what the caller should know about it rides in a header — ASCII
 * JSON, read by the SDK's `exportPDF`.
 */
export function sendPdf(res: Response, { pdf, warnings }: ExportResult, title: string, durationMs: number): void {
  setAttachmentHeader(res, `${title || 'template'}.pdf`)
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Length', pdf.length)
  res.setHeader('X-Generation-Time', durationMs.toString())
  if (warnings.length > 0) res.setHeader(EXPORT_WARNINGS_HEADER, JSON.stringify(warnings))
  res.send(pdf)
}
