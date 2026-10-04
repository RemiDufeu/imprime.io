import { Router } from 'express'
import { authService } from '../services/index.js'

// What the OAuth consent page shows: the pending authorization, to the user it
// was asked of only.
const router = Router()

router.get('/:consentCode', async (req, res) => {
  const consent = await authService.getOAuthConsent(req.params.consentCode, req.user!.id)
  res.json(consent)
})

export default router
