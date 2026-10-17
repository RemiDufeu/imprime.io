import express, { Router } from 'express'
import type { TemplateDTO } from '@imprime/common'
import { templateService, templateFileService } from '../services/index.js'
import { requireOwnsTemplate } from '../middleware/requireOwnsTemplate.js'
import { setAttachmentHeader } from './attachments.js'

// Where a template file is posted. Its body is parsed here, once the caller is
// authenticated — `server.ts` leaves this path to it — and may be larger than
// any other: the file carries its images, as base64.
export const TEMPLATE_IMPORT_PATH = '/api/templates/import'
const TEMPLATE_FILE_LIMIT = '50mb'

const router = Router()

router.get('/', async (req, res) => {
  const templates = await templateService.list(req.user!.id)
  res.json(templates)
})

router.get('/:id', requireOwnsTemplate, async (req, res) => {
  const template = await templateService.getById(req.params.id)
  res.json(template)
})

router.post('/', async (req, res) => {
  const data: TemplateDTO.Create = req.body
  const template = await templateService.create(data, req.user!.id)
  res.status(201).json(template)
})

// The body is a template file, as `GET /:id/file` writes one.
router.post('/import', express.json({ limit: TEMPLATE_FILE_LIMIT }), async (req, res) => {
  const template = await templateFileService.importFile(req.body, req.user!.id)
  res.status(201).json(template)
})

router.get('/:id/file', requireOwnsTemplate, async (req, res) => {
  const file = await templateFileService.exportFile(req.params.id, req.user!.id)
  setAttachmentHeader(res, `${file.title || 'template'}.imprime.json`)
  res.json(file)
})

router.put('/:id', requireOwnsTemplate, async (req, res) => {
  const data: TemplateDTO.Update = req.body
  const template = await templateService.update(req.params.id, data)
  res.json(template)
})

router.delete('/:id', requireOwnsTemplate, async (req, res) => {
  await templateService.delete(req.params.id)
  res.json({ message: 'Template deleted successfully' })
})

export default router
