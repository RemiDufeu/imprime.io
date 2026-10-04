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
  updateUser(userId: string, data: { role: string }): Promise<unknown>
}

/**
 * Makes the account of ADMIN_EMAIL the administrator once its address is
 * verified: at each sign-in, with a password or through single sign-on, and
 * at startup. An unverified one is only a claim to the address — whoever
 * typed it at sign-up — and is never promoted.
 *
 * The account is created by the server (`resetAdminPassword`, which marks the
 * address verified: the operator vouches for it) or by a provider vouching for
 * the address; a password sign-up with it is refused (`user.create.before`).
 *
 * The role then lives in the database: changing ADMIN_EMAIL demotes no one,
 * `demoteOtherAdmins` does (`npm run admin:demote-others`).
 */
async function promoteIfAdminAddress(store: UserStore, user: User, adminEmail: string | undefined): Promise<boolean> {
  if (!adminEmail || user.email.toLowerCase() !== adminEmail || !user.emailVerified) return false
  if (!hasAdminRole(user)) await store.updateUser(user.id, { role: ADMIN_ROLE })
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

/**
 * Whether Microsoft vouches for the address of an account: its `email` claim
 * is whatever the directory holds, which a tenant's administrators — or, in a
 * shared tenant, anyone — may set to any address. The optional claim
 * `xms_edov` (email domain owner verified) is true only when the address's
 * domain is verified by the tenant the account lives in, or Microsoft checked
 * the mailbox itself (personal accounts). It is absent unless the app
 * registration asks for it, and comes as a boolean or as a string.
 */
function microsoftVouchesForEmail(profile: Record<string, unknown>): boolean {
  const claim = profile.xms_edov
  return claim === true || claim === 1 || claim === '1' || (typeof claim === 'string' && claim.toLowerCase() === 'true')
}

// When an account cannot be created, an OAuth callback turns the message into
// its `error` parameter, spaces replaced: the sign-in page reads these back as
// their codes.
const domainNotAllowed = () =>
  new APIError('FORBIDDEN', { code: 'EMAIL_DOMAIN_NOT_ALLOWED', message: 'Email domain not allowed' })
const addressNotVerified = () =>
  new APIError('FORBIDDEN', { code: 'ADDRESS_NOT_VERIFIED', message: 'Address not verified' })
const adminAddressReserved = () =>
  new APIError('FORBIDDEN', { code: 'ADMIN_ADDRESS_RESERVED', message: 'This address is reserved for the administrator' })

/**
 * The header better-auth reads the client's address from, for its rate
 * limits. `server.ts` overwrites it on every request with the address Express
 * resolved, so that a client cannot pick its own as it could with
 * X-Forwarded-For.
 */
export const CLIENT_IP_HEADER = 'x-imprime-client-ip'

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
//
// `proveAddress` runs when someone shows they hold an account's mailbox
// (`AuthService.proveAddress`).
function buildAuth(
  mailer: MailerService,
  adminEmail: string | undefined,
  settings: AuthSettings,
  proveAddress: (userId: string) => Promise<void>,
) {
  const { google, github } = settings.sso
  const microsoft = settings.sso.microsoft
    ? {
        ...settings.sso.microsoft,
        tenantId: settings.sso.microsoft.tenantId || 'common',
        // Whatever the tenant: in the organisation's own, its administrators
        // can still give an account any address, and a guest's comes from
        // elsewhere. Without `xms_edov`, better-auth's own reading stands,
        // which only Microsoft's rarely sent verified_* claims satisfy.
        mapProfileToUser: (profile: Record<string, unknown>) =>
          microsoftVouchesForEmail(profile) ? { emailVerified: true } : {},
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
    advanced: {
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
    emailAndPassword: {
      enabled: true,
      // Only new password accounts: single sign-on still creates its own.
      disableSignUp: passwordPolicy !== 'open',
      requireEmailVerification,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 15 * 60,
      // A new password closes every session, whoever opened them.
      revokeSessionsOnPasswordReset: true,
      // Following the reset link proves the mailbox, like a verification link.
      onPasswordReset: async ({ user }: { user: User }) => {
        if (!user.emailVerified) await proveAddress(user.id)
      },
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
            // Runs before the session the link opens, which it leaves alone;
            // one already open in that browser is closed with the others.
            afterEmailVerification: async (user: User) => {
              await proveAddress(user.id)
            },
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
              // Created by the server itself (`resetAdminPassword`), without
              // a request; otherwise only by a provider vouching for the
              // address. A password sign-up is anyone's claim to it, and
              // would be promoted once a verification link — sent to the
              // administrator, who might follow it — verifies it.
              if (ctx && !fromProvider) throw adminAddressReserved()
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

  return { instance, enabledProviders, allowedDomains, nodeHandler: toNodeHandler(instance) }
}

type BuiltAuth = ReturnType<typeof buildAuth>
type BetterAuthInstance = BuiltAuth['instance']

export class AuthService {
  private readonly adminEmail = configuredAdminEmail()
  private built: BuiltAuth

  constructor(private readonly mailer: MailerService) {
    // Replaced at startup by the stored settings (`SettingsService.load`),
    // before the server takes a request.
    this.built = this.build({
      requireEmailVerification: false,
      passwordPolicy: 'open',
      allowedDomains: [],
      sso: {},
    })
  }

  private build(settings: AuthSettings): BuiltAuth {
    return buildAuth(this.mailer, this.adminEmail, settings, (userId) => this.proveAddress(userId))
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
    this.built = this.build(settings)
  }

  /**
   * Someone just showed they hold the mailbox of `userId`'s address, by
   * following a verification or a password reset link: the address is marked
   * verified, and whatever was set up while it was not — by whoever signed up
   * with it, perhaps not its owner — is dropped: sessions, API keys and MCP
   * tokens. Without this, signing up first with someone else's address and
   * making a key would keep a way into their account once they claim it.
   */
  private async proveAddress(userId: string): Promise<void> {
    const { internalAdapter } = await this.instance.$context
    await internalAdapter.updateUser(userId, { emailVerified: true })
    await this.revokeAccess(userId)
  }

  /**
   * Closes every way into the account but its password and its providers:
   * sessions, API keys, and the tokens MCP clients got through OAuth.
   */
  private async revokeAccess(userId: string): Promise<void> {
    const { adapter, internalAdapter } = await this.instance.$context
    await internalAdapter.deleteUserSessions(userId)
    // The api-key plugin's model; `referenceId` is the owner's user id.
    await adapter.deleteMany({ model: 'apikey', where: [{ field: 'referenceId', value: userId }] })
    // The mcp plugin's model.
    await adapter.deleteMany({ model: 'oauthAccessToken', where: [{ field: 'userId', value: userId }] })
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
   * and the way the administrator's account is first created: gives the
   * account of ADMIN_EMAIL this password — creating the account if there is
   * none — with its role and a verified address, since the operator vouches
   * for it. Everything else that opened the account is revoked (sessions, API
   * keys, MCP tokens): it may be someone else's way in, the reason the
   * command was run.
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
    await this.revokeAccess(user.id)
    return { email, outcome: 'updated' }
  }

  /**
   * Makes the account of ADMIN_EMAIL the only administrator, for whoever runs
   * the server (`scripts/demoteOtherAdmins.ts`): the role stays in the
   * database, so a former ADMIN_EMAIL keeps it until this runs. The accounts
   * demoted are signed out, so the access rules apply to them from their next
   * sign-in. API keys are left alone.
   */
  public async demoteOtherAdmins(): Promise<{
    adminEmail: string
    adminExists: boolean
    // False while the account's address is unverified: nobody is administrator.
    adminPromoted: boolean
    demoted: string[]
  }> {
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
    const adminPromoted = found ? await promoteIfAdminAddress(internalAdapter, found.user, adminEmail) : false
    return { adminEmail, adminExists: Boolean(found), adminPromoted, demoted }
  }

  /** Read from the database, so it holds for API keys as for sessions. */
  public async isAdmin(userId: string): Promise<boolean> {
    const { internalAdapter } = await this.instance.$context
    return hasAdminRole(await internalAdapter.findUserById(userId))
  }

  /**
   * Gives the account of ADMIN_EMAIL its role at startup, so that it need not
   * sign in again after the variable changes, and says how to create it while
   * it has none, or how to claim it while its address is unverified. Run
   * once, once the auth database is connected.
   */
  public async promoteConfiguredAdmin(): Promise<void> {
    if (!this.adminEmail) {
      console.warn('ADMIN_EMAIL is not set: nobody becomes administrator of this instance.')
      return
    }
    const { internalAdapter } = await this.instance.$context
    const found = await internalAdapter.findUserByEmail(this.adminEmail)
    if (!found) {
      console.warn(`${this.adminEmail} has no account yet: create it with \`npm run admin:reset-password\`, or sign in with a single sign-on provider that vouches for the address.`)
      return
    }
    const wasAdmin = hasAdminRole(found.user)
    if (!(await promoteIfAdminAddress(internalAdapter, found.user, this.adminEmail))) {
      console.warn(`The account of ${this.adminEmail} has an unverified address, so it is not made administrator: \`npm run admin:reset-password\` claims it.`)
      return
    }
    if (!wasAdmin) console.log(`Admin role given to ${this.adminEmail} (ADMIN_EMAIL)`)
  }

  /**
   * Whether `userId` may still use the instance outside a session — API keys,
   * MCP tokens — which the session hooks never see: under the domain list as
   * at sign-in, administrators exempt.
   */
  private async isAllowedWithoutSession(userId: string): Promise<boolean> {
    const { internalAdapter } = await this.instance.$context
    const user = await internalAdapter.findUserById(userId)
    if (!user) return false
    return hasAdminRole(user) || isAddressAllowed(user, this.built.allowedDomains)
  }

  public async resolveApiKeyOwner(key: string): Promise<string | null> {
    if (!key) return null
    const result = await this.instance.api.verifyApiKey({ body: { key } })
    const ownerId = result?.valid && result.key ? result.key.referenceId : null
    return ownerId && (await this.isAllowedWithoutSession(ownerId)) ? ownerId : null
  }

  public async resolveMcpBearerOwner(bearerToken: string): Promise<string | null> {
    if (!bearerToken) return null
    const headers = new Headers({ authorization: `Bearer ${bearerToken}` })
    const session = await this.instance.api.getMcpSession({ headers })
    const ownerId = session?.userId ?? null
    return ownerId && (await this.isAllowedWithoutSession(ownerId)) ? ownerId : null
  }
}
