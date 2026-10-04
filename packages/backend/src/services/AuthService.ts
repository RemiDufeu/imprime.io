import { betterAuth, type User } from 'better-auth'
import { mongodbAdapter } from 'better-auth/adapters/mongodb'
import { APIError } from 'better-auth/api'
import { symmetricDecrypt, symmetricEncrypt } from 'better-auth/crypto'
import { toNodeHandler } from 'better-auth/node'
import { admin, mcp } from 'better-auth/plugins'
import { apiKey } from '@better-auth/api-key'
import type { EnabledAuthProviders, PasswordPolicy, SsoProvider } from '@imprime/common'
import { authDb, authMongoClient } from '../config/authDb.js'
import type { MailerService } from './MailerService.js'

function trustedOrigins(): string[] {
  return (
    process.env.CORS_ORIGIN?.split(',')
      .map((o) => o.trim())
      .filter(Boolean) ?? []
  )
}

const ADMIN_ROLE = 'admin'
// What better-auth's admin plugin gives everyone else.
const DEFAULT_ROLE = 'user'
// better-auth returns 100 users at most when not told otherwise.
const USER_PAGE_SIZE = 200

// The administrator's address, from ADMIN_EMAIL, lower-cased.
function configuredAdminEmail(): string | undefined {
  return process.env.ADMIN_EMAIL?.trim().toLowerCase() || undefined
}

function hasAdminRole(user: User | null): boolean {
  return user !== null && 'role' in user && user.role === ADMIN_ROLE
}

// The part of better-auth's internal adapter promotion needs.
interface UserStore {
  updateUser(userId: string, data: { role: string; emailVerified: boolean }): Promise<unknown>
}

/**
 * Makes the account of ADMIN_EMAIL the administrator, whatever happens: at
 * each sign-in, with a password or through single sign-on, and at startup.
 * Its address counts as verified, since the operator vouched for it by
 * configuring it: a provider confirming the same address is then attached to
 * that account, and email verification never locks the administrator out.
 *
 * Whoever creates that account first gets the role, so it must be signed up
 * with right after the first start — the startup log says so while it has
 * none. A provider cannot create it with an address it does not vouch for
 * (`user.create.before`).
 *
 * The role then lives in the database: changing ADMIN_EMAIL demotes no one,
 * `demoteOtherAdmins` does (`npm run admin:demote-others`).
 */
async function promoteIfAdminAddress(store: UserStore, user: User, adminEmail: string | undefined): Promise<boolean> {
  if (!adminEmail || user.email.toLowerCase() !== adminEmail) return false
  if (!hasAdminRole(user) || !user.emailVerified) {
    await store.updateUser(user.id, { role: ADMIN_ROLE, emailVerified: true })
  }
  return true
}

// A failed promotion does not fail the sign-in: the next one retries.
async function isOrBecomesAdmin(store: UserStore, user: User, adminEmail: string | undefined): Promise<boolean> {
  try {
    if (await promoteIfAdminAddress(store, user, adminEmail)) return true
  } catch (error) {
    console.error('Failed to give ADMIN_EMAIL its role on sign-in:', error)
  }
  return hasAdminRole(user)
}

function domainOf(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1).toLowerCase()
}

/**
 * Whether `user`'s address lets it in under a domain list: any address
 * without one; otherwise a verified address — by its provider or by email —
 * in one of the domains, since an unverified one is only a claim.
 * Administrators are exempt, which is for the caller to check.
 */
export function isAddressAllowed(
  user: { email: string; emailVerified: boolean },
  allowedDomains: readonly string[],
): boolean {
  if (allowedDomains.length === 0) return true
  return user.emailVerified && allowedDomains.includes(domainOf(user.email))
}

// Where a provider signs a user in: its OAuth callback, or sign-in with its ID
// token. Every other route that opens a session goes through a password or an
// emailed link.
function isSingleSignOn(path: string): boolean {
  return path === '/callback/:id' || path === '/sign-in/social'
}

// Run by an administrator for someone else (impersonation, account creation).
function isAdminRoute(path: string): boolean {
  return path.startsWith('/admin/')
}

// Microsoft tenants shared by many organisations, which do not vouch for the
// addresses their accounts give.
const SHARED_MICROSOFT_TENANTS = new Set(['common', 'organizations', 'consumers'])

// When an account cannot be created, an OAuth callback turns the message into
// its `error` parameter, spaces replaced: the sign-in page reads these back as
// their codes.
const domainNotAllowed = () =>
  new APIError('FORBIDDEN', { code: 'EMAIL_DOMAIN_NOT_ALLOWED', message: 'Email domain not allowed' })
const addressNotVerified = () =>
  new APIError('FORBIDDEN', { code: 'ADDRESS_NOT_VERIFIED', message: 'Address not verified' })

/** An OAuth application, its secret decrypted. */
export interface SsoCredentials {
  clientId: string
  clientSecret: string
  // Microsoft only.
  tenantId?: string
}

/** What admins configure about authentication (`SettingsService`). */
export interface AuthSettings {
  requireEmailVerification: boolean
  passwordPolicy: PasswordPolicy
  // Lower-cased; empty admits any domain.
  allowedDomains: readonly string[]
  // A provider is offered while it is present.
  sso: Partial<Record<SsoProvider, SsoCredentials>>
}

// better-auth reads its options once, when the instance is built: settings
// that change at runtime take effect by building a new one
// (`AuthService.applySettings`).
function buildAuth(
  mailer: MailerService,
  adminEmail: string | undefined,
  settings: AuthSettings,
) {
  const { google, github } = settings.sso
  const microsoftTenant = settings.sso.microsoft?.tenantId || 'common'
  const microsoft = settings.sso.microsoft
    ? {
        ...settings.sso.microsoft,
        tenantId: microsoftTenant,
        // In the organisation's own tenant, its administrators manage the
        // addresses, so they are trusted as verified — which the domain list
        // needs, since Microsoft does not say so itself. A shared tenant does
        // not vouch for them: anyone may set any address on an account there.
        ...(SHARED_MICROSOFT_TENANTS.has(microsoftTenant.toLowerCase())
          ? {}
          : { mapProfileToUser: () => ({ emailVerified: true }) }),
      }
    : undefined
  const { passwordPolicy, allowedDomains } = settings

  const mailerConfigured = mailer.isConfigured
  // Verification sends email: never required without a mailer, which
  // `SettingsService` refuses anyway.
  const requireEmailVerification = settings.requireEmailVerification && mailerConfigured
  const passwordResetEnabled = mailerConfigured

  const enabledProviders: EnabledAuthProviders = {
    emailPassword: true,
    passwordPolicy,
    google: Boolean(google),
    github: Boolean(github),
    microsoft: Boolean(microsoft),
    requireEmailVerification,
    passwordReset: passwordResetEnabled,
  }

  const instance = betterAuth({
    baseURL: process.env.PUBLIC_APP_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: trustedOrigins(),
    database: mongodbAdapter(authDb, { client: authMongoClient }),
    emailAndPassword: {
      enabled: true,
      // Only new password accounts: single sign-on still creates its own.
      disableSignUp: passwordPolicy !== 'open',
      requireEmailVerification,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 15 * 60,
      ...(passwordResetEnabled
        ? {
            sendResetPassword: async ({
              user,
              url,
            }: {
              user: { email: string; name?: string }
              url: string
            }) => {
              await mailer.sendPasswordResetEmail(user, url)
            },
          }
        : {}),
    },
    // Defined whenever a mailer is, so an account can ask for a link before
    // verification is required.
    ...(mailerConfigured
      ? {
          emailVerification: {
            sendOnSignUp: requireEmailVerification,
            // An account created while verification was off is refused until
            // verified: sending it a link is what lets it sign in again.
            sendOnSignIn: requireEmailVerification,
            // An emailed link would otherwise be a way in without single
            // sign-on.
            autoSignInAfterVerification: passwordPolicy !== 'admins',
            sendVerificationEmail: async ({
              user,
              url,
            }: {
              user: { email: string; name?: string }
              url: string
            }) => {
              await mailer.sendVerificationEmail(user, url)
            },
          },
        }
      : {}),
    socialProviders: {
      ...(google ? { google } : {}),
      ...(github ? { github } : {}),
      ...(microsoft ? { microsoft } : {}),
    },
    // Account linking stays better-auth's default: a provider's account is
    // attached to an existing one with the same address only when the provider
    // vouches for the address and the existing one is verified. Trusting
    // providers by name would let an account merely claiming someone's
    // address — the administrator's included — take theirs over.
    //
    // The access policy. The administrator is exempt throughout: the way back
    // in when single sign-on fails.
    databaseHooks: {
      user: {
        create: {
          before: async (user, ctx) => {
            if (ctx && isAdminRoute(ctx.path)) return
            const fromProvider = Boolean(ctx && isSingleSignOn(ctx.path))
            if (user.email.toLowerCase() === adminEmail) {
              // The administrator's account, from a provider that does not
              // vouch for the address: someone else claiming it.
              if (fromProvider && !user.emailVerified) throw addressNotVerified()
              return
            }
            if (allowedDomains.length === 0) return
            // A provider's unverified address is refused at once; an email
            // sign-up is verified by email afterwards, before it may sign in.
            if (!allowedDomains.includes(domainOf(user.email)) || (fromProvider && !user.emailVerified)) {
              throw domainNotAllowed()
            }
          },
        },
      },
      session: {
        create: {
          // Runs once the credentials were checked, so a refusal tells
          // nothing about an account to whoever does not hold them.
          before: async (session, ctx) => {
            if (!ctx || isAdminRoute(ctx.path)) return
            const store = ctx.context.internalAdapter
            const user = await store.findUserById(session.userId)
            if (!user || (await isOrBecomesAdmin(store, user, adminEmail))) return

            if (passwordPolicy === 'admins' && !isSingleSignOn(ctx.path)) {
              throw new APIError('FORBIDDEN', {
                code: 'PASSWORD_SIGN_IN_DISABLED',
                message: 'Sign in with single sign-on: passwords are for administrators',
              })
            }
            // `isAddressAllowed`, told apart for the user.
            if (allowedDomains.length > 0 && !allowedDomains.includes(domainOf(user.email))) {
              throw domainNotAllowed()
            }
            if (allowedDomains.length > 0 && !user.emailVerified) throw addressNotVerified()
          },
        },
      },
    },
    plugins: [
      apiKey(),
      admin(),
      mcp({
        loginPage: '/login',
        oidcConfig: {
          loginPage: '/login',
          consentPage: '/oauth/consent',
        },
      }),
    ],
  })

  return { instance, enabledProviders, nodeHandler: toNodeHandler(instance) }
}

type BuiltAuth = ReturnType<typeof buildAuth>
type BetterAuthInstance = BuiltAuth['instance']

export class AuthService {
  private readonly adminEmail = configuredAdminEmail()
  private built: BuiltAuth

  constructor(private readonly mailer: MailerService) {
    // Replaced at startup by the stored settings (`SettingsService.load`),
    // before the server takes a request.
    this.built = buildAuth(mailer, this.adminEmail, {
      requireEmailVerification: false,
      passwordPolicy: 'open',
      allowedDomains: [],
      sso: {},
    })
  }

  /** The current instance: read it at each use, it is rebuilt when settings change. */
  public get instance(): BetterAuthInstance {
    return this.built.instance
  }

  public get enabledProviders(): EnabledAuthProviders {
    return this.built.enabledProviders
  }

  /** Serves `/api/auth/*` with whichever instance is current. */
  public readonly handler: BuiltAuth['nodeHandler'] = (req, res) => this.built.nodeHandler(req, res)

  /**
   * Rebuilds better-auth around the current mailer and these settings.
   * Sessions live in the database, so nobody is signed out; a request already
   * running finishes on the previous instance.
   */
  public applySettings(settings: AuthSettings): void {
    this.built = buildAuth(this.mailer, this.adminEmail, settings)
  }

  /**
   * Where `provider` sends users back after they sign in: the redirect URI to
   * register with it. null without PUBLIC_APP_URL, from which it is built.
   */
  public async ssoCallbackUrl(provider: SsoProvider): Promise<string | null> {
    const { baseURL } = await this.instance.$context
    return baseURL ? `${baseURL}/callback/${provider}` : null
  }

  /**
   * Encrypts a value stored in the database with the auth secret, as
   * better-auth encrypts its own. Changing BETTER_AUTH_SECRET makes it
   * unreadable, unless the old secret stays listed in BETTER_AUTH_SECRETS.
   */
  public async encrypt(value: string): Promise<string> {
    const { secretConfig } = await this.instance.$context
    return symmetricEncrypt({ key: secretConfig, data: value })
  }

  /** Throws when `value` was encrypted with a secret no longer configured. */
  public async decrypt(value: string): Promise<string> {
    const { secretConfig } = await this.instance.$context
    return symmetricDecrypt({ key: secretConfig, data: value })
  }

  /**
   * Signs out every user but the administrators for whom `shouldSignOut`
   * holds, so a tightened access policy applies at once rather than at their
   * next sign-in: better-auth extends a session each time it is used. API keys
   * are left alone. Returns how many users were signed out.
   */
  public async signOutUsers(shouldSignOut: (user: User) => boolean): Promise<number> {
    const { internalAdapter } = await this.instance.$context
    let signedOut = 0
    for (let offset = 0; ; offset += USER_PAGE_SIZE) {
      const users = await internalAdapter.listUsers(USER_PAGE_SIZE, offset, { field: 'createdAt', direction: 'asc' })
      for (const user of users) {
        if (hasAdminRole(user) || !shouldSignOut(user)) continue
        await internalAdapter.deleteUserSessions(user.id)
        signedOut++
      }
      if (users.length < USER_PAGE_SIZE) return signedOut
    }
  }

  /**
   * Break-glass access, for whoever runs the server (`scripts/resetAdminPassword.ts`),
   * when nothing else lets the administrator in: gives the account of
   * ADMIN_EMAIL this password — creating the account if there is none — with
   * its role and a verified address, and signs its sessions out.
   */
  public async resetAdminPassword(password: string): Promise<{ email: string; outcome: 'created' | 'updated' }> {
    const email = this.adminEmail
    if (!email) throw new Error('ADMIN_EMAIL is not set')
    const context = await this.instance.$context
    const { internalAdapter } = context
    const hash = await context.password.hash(password)

    const found = await internalAdapter.findUserByEmail(email, { includeAccounts: true })
    if (!found) {
      const user = await internalAdapter.createUser({ email, name: email.split('@')[0], emailVerified: true })
      await internalAdapter.updateUser(user.id, { role: ADMIN_ROLE })
      await internalAdapter.linkAccount({ userId: user.id, providerId: 'credential', accountId: user.id, password: hash })
      return { email, outcome: 'created' }
    }

    const { user, accounts } = found
    await internalAdapter.updateUser(user.id, { role: ADMIN_ROLE, emailVerified: true })
    if (accounts.some(account => account.providerId === 'credential')) {
      await internalAdapter.updatePassword(user.id, hash)
    } else {
      await internalAdapter.linkAccount({ userId: user.id, providerId: 'credential', accountId: user.id, password: hash })
    }
    await internalAdapter.deleteUserSessions(user.id)
    return { email, outcome: 'updated' }
  }

  /**
   * Makes the account of ADMIN_EMAIL the only administrator, for whoever runs
   * the server (`scripts/demoteOtherAdmins.ts`): the role stays in the
   * database, so a former ADMIN_EMAIL keeps it until this runs. The accounts
   * demoted are signed out, so the access rules apply to them from their next
   * sign-in. API keys are left alone.
   */
  public async demoteOtherAdmins(): Promise<{ adminEmail: string; adminExists: boolean; demoted: string[] }> {
    const adminEmail = this.adminEmail
    if (!adminEmail) throw new Error('ADMIN_EMAIL is not set: nobody would remain administrator')
    const { internalAdapter } = await this.instance.$context

    // All of them before any change: demoting one takes it out of the query
    // being paged through.
    const admins: User[] = []
    for (let offset = 0; ; offset += USER_PAGE_SIZE) {
      const page = await internalAdapter.listUsers(
        USER_PAGE_SIZE, offset, { field: 'createdAt', direction: 'asc' }, [{ field: 'role', value: ADMIN_ROLE }],
      )
      admins.push(...page)
      if (page.length < USER_PAGE_SIZE) break
    }

    const demoted: string[] = []
    for (const admin of admins) {
      if (admin.email.toLowerCase() === adminEmail) continue
      await internalAdapter.updateUser(admin.id, { role: DEFAULT_ROLE })
      await internalAdapter.deleteUserSessions(admin.id)
      demoted.push(admin.email)
    }

    const found = await internalAdapter.findUserByEmail(adminEmail)
    if (found) await promoteIfAdminAddress(internalAdapter, found.user, adminEmail)
    return { adminEmail, adminExists: Boolean(found), demoted }
  }

  /** Read from the database, so it holds for API keys as for sessions. */
  public async isAdmin(userId: string): Promise<boolean> {
    const { internalAdapter } = await this.instance.$context
    return hasAdminRole(await internalAdapter.findUserById(userId))
  }

  /**
   * Gives the account of ADMIN_EMAIL its role at startup, so that it need not
   * sign in again after the variable changes, and warns while it has no
   * account: whoever creates it first becomes the administrator. Run once,
   * once the auth database is connected.
   */
  public async promoteConfiguredAdmin(): Promise<void> {
    if (!this.adminEmail) {
      console.warn('ADMIN_EMAIL is not set: nobody becomes administrator of this instance.')
      return
    }
    const { internalAdapter } = await this.instance.$context
    const found = await internalAdapter.findUserByEmail(this.adminEmail)
    if (!found) {
      console.warn(`${this.adminEmail} has no account yet: whoever signs in first with it becomes the administrator.`)
      return
    }
    const wasAdmin = hasAdminRole(found.user)
    await promoteIfAdminAddress(internalAdapter, found.user, this.adminEmail)
    if (!wasAdmin) console.log(`Admin role given to ${this.adminEmail} (ADMIN_EMAIL)`)
  }

  public async resolveApiKeyOwner(key: string): Promise<string | null> {
    if (!key) return null
    const result = await this.instance.api.verifyApiKey({ body: { key } })
    return result?.valid && result.key ? result.key.referenceId : null
  }

  public async resolveMcpBearerOwner(bearerToken: string): Promise<string | null> {
    if (!bearerToken) return null
    const headers = new Headers({ authorization: `Bearer ${bearerToken}` })
    const session = await this.instance.api.getMcpSession({ headers })
    return session?.userId ?? null
  }
}
