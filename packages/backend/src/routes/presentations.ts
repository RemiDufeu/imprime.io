import { Router } from 'express'
import type { PresentationDTO } from '@imprime/common'
import { presentationService } from '../services/index.js'

const router = Router()

router.get('/', async (req, res) => {
  const presentations = await presentationService.list()
  res.json(presentations)
})

router.get('/:id', async (req, res) => {
  const presentation = await presentationService.getById(req.params.id)
  res.json(presentation)
})

router.post('/', async (req, res) => {
  const data: PresentationDTO.Create = req.body
  const presentation = await presentationService.create(data)
  res.status(201).json(presentation)
})

router.put('/:id', async (req, res) => {
  const data: PresentationDTO.Update = req.body
  const presentation = await presentationService.update(req.params.id, data)
  res.json(presentation)
})

router.delete('/:id', async (req, res) => {
  await presentationService.delete(req.params.id)
  res.json({ message: 'Presentation deleted successfully' })
})

export default router
