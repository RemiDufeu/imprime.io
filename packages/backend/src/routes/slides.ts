import { Router } from 'express'
import type { SlideDTO } from '@imprime/common'
import { slideService } from '../services/index.js'

const router = Router()

router.patch('/:id/slides/:slideId', async (req, res) => {
  const data: SlideDTO.Update = req.body
  await slideService.updateShapes(req.params.id, req.params.slideId, data)
  res.status(204).end()
})

router.post('/:id/slides', async (req, res) => {
  await slideService.create(req.params.id)
  res.status(201).end()
})

router.delete('/:id/slides/:slideId', async (req, res) => {
  await slideService.delete(req.params.id, req.params.slideId)
  res.status(204).end()
})

export default router
