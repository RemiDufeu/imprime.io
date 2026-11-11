import { Router } from 'express'
import type { AccessSettingsDTO, EmailSettingsDTO, SsoSettingsDTO } from '@imprime/common'
import { settingsService } from '../services/index.js'
import { requireAdmin } from '../middleware/requireAdmin.js'

// The instance's settings: admins only, reads included, since they say how
// the instance reaches its users' mailboxes.
const router = Router()

router.get('/email', requireAdmin, async (_req, res) => {
  const settings = await settingsService.getEmail()
  res.json(settings)
})

router.put('/email', requireAdmin, async (req, res) => {
  const data: EmailSettingsDTO.Update = req.body
  const settings = await settingsService.updateEmail(data)
  res.json(settings)
})

router.post('/email/test', requireAdmin, async (req, res) => {
  const data: EmailSettingsDTO.TestRequest = req.body
  await settingsService.sendTestEmail(data)
  res.status(204).end()
})

router.get('/access', requireAdmin, async (_req, res) => {
  const settings = await settingsService.getAccess()
  res.json(settings)
})

router.put('/access', requireAdmin, async (req, res) => {
  const data: AccessSettingsDTO.Update = req.body
  const settings = await settingsService.updateAccess(data)
  res.json(settings)
})

router.get('/sso', requireAdmin, async (_req, res) => {
  const settings = await settingsService.getSso()
  res.json(settings)
})

router.put('/sso/:provider', requireAdmin, async (req, res) => {
  const data: SsoSettingsDTO.ProviderUpdate = req.body
  const status = await settingsService.setSsoProvider(req.params.provider, data)
  res.json(status)
})

router.delete('/sso/:provider', requireAdmin, async (req, res) => {
  const status = await settingsService.removeSsoProvider(req.params.provider)
  res.json(status)
})

export default router
