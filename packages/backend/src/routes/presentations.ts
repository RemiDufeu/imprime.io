import { Router } from 'express'
import type { PresentationDTO } from '@imprime/common'
import { presentationService } from '../services/index.js'
import { requireOwnsPresentation } from '../middleware/requireOwnsPresentation.js'

const router = Router()

router.get('/', async (req, res) => {
  const presentations = await presentationService.list(req.user!.id)
  res.json(presentations)
})

router.get('/:id', requireOwnsPresentation, async (req, res) => {
  const presentation = await presentationService.getById(req.params.id)
  res.json(presentation)
})

router.post('/', async (req, res) => {
  const data: PresentationDTO.Create = req.body
  const presentation = await presentationService.create(data, req.user!.id)
  res.status(201).json(presentation)
})

router.put('/:id', requireOwnsPresentation, async (req, res) => {
  const data: PresentationDTO.Update = req.body
  const presentation = await presentationService.update(req.params.id, data)
  res.json(presentation)
})

router.delete('/:id', requireOwnsPresentation, async (req, res) => {
  await presentationService.delete(req.params.id)
  res.json({ message: 'Presentation deleted successfully' })
})

export default router
