import { Router } from 'express'
import type { TemplateDTO } from '@imprime/common'
import { templateService } from '../services/index.js'
import { requireOwnsTemplate } from '../middleware/requireOwnsTemplate.js'

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
