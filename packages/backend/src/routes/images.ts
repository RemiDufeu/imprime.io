import { Router } from 'express'
import type { ImageDTO } from '@imprime/common'
import { imageService } from '../services/index.js'

const router = Router()

router.post('/', async (req, res) => {
  const data: ImageDTO.Create = req.body
  const image = await imageService.upload(data)
  res.status(201).json(image)
})

router.get('/:id', async (req, res) => {
  const image = await imageService.getById(req.params.id)
  res.json(image)
})

router.delete('/:id', async (req, res) => {
  await imageService.delete(req.params.id)
  res.json({ message: 'Image deleted successfully' })
})

export default router
