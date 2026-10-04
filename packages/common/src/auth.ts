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
 * What the consent page asks the signed-in user to allow, read on the server
 * from the pending authorization — never from the page's URL, which anyone
 * can write.
 */
export interface OAuthConsentRequest {
  // The name the application registered with, which anyone may choose; null
  // when it gave none.
  clientName: string | null
  // Where the access goes once allowed: the redirect URI's origin, or the
  // whole URI for an application's own scheme ("vscode://…").
  redirectTo: string
  // Asks to keep access (`offline_access`): renewable for up to 7 days.
  keepsAccess: boolean
}

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
