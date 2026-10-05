import { Router } from 'express'
import type { PageDTO } from '@imprime/common'
import { pageService } from '../services/index.js'
import { requireOwnsTemplate } from '../middleware/requireOwnsTemplate.js'

const router = Router()

router.patch('/:id/pages/:pageId', requireOwnsTemplate, async (req, res) => {
  const data: PageDTO.Update = req.body
  await pageService.updateShapes(req.params.id, req.user!.id, req.params.pageId, data)
  res.status(204).end()
})

router.post('/:id/pages', requireOwnsTemplate, async (req, res) => {
  const data: PageDTO.Create = req.body ?? {}
  const page = await pageService.create(req.params.id, req.user!.id, data)
  res.status(201).json(page)
})

router.delete('/:id/pages/:pageId', requireOwnsTemplate, async (req, res) => {
  await pageService.delete(req.params.id, req.user!.id, req.params.pageId)
  res.status(204).end()
})

export default router
