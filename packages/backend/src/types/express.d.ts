import type { AuthUser } from '@imprime/common'

declare global {
  namespace Express {
    interface Request {
      /** Authenticated user, set by the `requireAuth` middleware. */
      user?: AuthUser
    }
  }
}

export {}
