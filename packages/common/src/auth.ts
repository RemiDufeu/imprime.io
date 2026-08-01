/**
 * Authenticated user as exposed to application layers (set by the auth
 * middleware on `req.user`). Shared between backend and frontend.
 */
export interface AuthUser {
  id: string
}

/**
 * Auth providers enabled on the server, exposed to the UI so it only shows
 * the options that are actually available.
 */
export interface EnabledAuthProviders {
  emailPassword: boolean
  google: boolean
  github: boolean
  microsoft: boolean
}
