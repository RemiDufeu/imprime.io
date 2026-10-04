import { Router } from 'express'
import type { FontDTO } from '@imprime/common'
import { fontService } from '../services/index.js'
import { requireAdmin } from '../middleware/requireAdmin.js'

// The instance's fonts: any user reads them to draw text, only admins change
// them.
const router = Router()

router.get('/', async (_req, res) => {
  const fonts = await fontService.list()
  res.json(fonts)
})

router.get('/:id/faces/:variant', async (req, res) => {
  const face = await fontService.getFaceData(req.params.id, req.params.variant)
  res.json(face)
})

router.post('/', requireAdmin, async (req, res) => {
  const data: FontDTO.Create = req.body
  const font = await fontService.create(data)
  res.status(201).json(font)
})

router.put('/:id/faces/:variant', requireAdmin, async (req, res) => {
  const data: FontDTO.FaceUpload = req.body
  const font = await fontService.setFace(req.params.id, req.params.variant, data)
  res.json(font)
})

router.delete('/:id/faces/:variant', requireAdmin, async (req, res) => {
  const font = await fontService.deleteFace(req.params.id, req.params.variant)
  res.json(font)
})

router.delete('/:id', requireAdmin, async (req, res) => {
  await fontService.delete(req.params.id)
  res.json({ message: 'Font deleted successfully' })
})

export default router
