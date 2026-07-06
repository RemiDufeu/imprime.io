import { Router } from 'express'
import type { VariableDTO } from '@imprime/common'
import { variableService, presentationService } from '../services/index.js'

const router = Router()

router.post('/:id/variables', async (req, res) => {
  await presentationService.assertOwner(req.params.id, req.user!.id)
  const data: VariableDTO.Create = req.body
  const variables = await variableService.create(req.params.id, data)
  res.status(201).json({ variables })
})

router.patch('/:id/variables/:variableId', async (req, res) => {
  await presentationService.assertOwner(req.params.id, req.user!.id)
  const data: VariableDTO.Update = req.body
  const variables = await variableService.update(req.params.id, req.params.variableId, data)
  res.json({ variables })
})

router.delete('/:id/variables/:variableId', async (req, res) => {
  await presentationService.assertOwner(req.params.id, req.user!.id)
  const variables = await variableService.delete(req.params.id, req.params.variableId)
  res.json({ variables })
})

export default router
