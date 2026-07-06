import type { AuthUser } from '@imprime/common'

declare global {
  namespace Express {
    interface Request {
      /** Utilisateur authentifié, posé par le middleware `requireAuth`. */
      user?: AuthUser
    }
  }
}

export {}
