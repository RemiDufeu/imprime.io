/**
 * Authenticated user as exposed to application layers (set by the auth
 * middleware on `req.user`). Shared between backend and frontend.
 */
export interface AuthUser {
  id: string
}

/** The single sign-on providers an instance's admins can configure. */
export const SSO_PROVIDERS = ['google', 'github', 'microsoft'] as const
export type SsoProvider = (typeof SSO_PROVIDERS)[number]

/**
 * Who may use an email and a password, set by the instance's admins:
 * - 'open': anyone signs up and signs in with one;
 * - 'existing': no new password accounts, existing ones keep signing in;
 * - 'admins': only administrators sign in with one, everyone else through
 *   single sign-on.
 */
export const PASSWORD_POLICIES = ['open', 'existing', 'admins'] as const
export type PasswordPolicy = (typeof PASSWORD_POLICIES)[number]

/**
 * Auth providers enabled on the server, exposed to the UI so it only shows
 * the options that are actually available.
 */
export interface EnabledAuthProviders {
  emailPassword: boolean
  // Decides whether the sign-in page offers sign-up, and whether it shows the
  // password form to everyone or to administrators only.
  passwordPolicy: PasswordPolicy
  google: boolean
  github: boolean
  microsoft: boolean
  requireEmailVerification: boolean
  passwordReset: boolean
}
