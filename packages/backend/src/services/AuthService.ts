import { betterAuth, type User } from 'better-auth'
import { mongodbAdapter } from 'better-auth/adapters/mongodb'
import { APIError } from 'better-auth/api'
import { symmetricDecrypt, symmetricEncrypt } from 'better-auth/crypto'
import { toNodeHandler } from 'better-auth/node'
import { admin, mcp } from 'better-auth/plugins'
import { apiKey } from '@better-auth/api-key'
import type { EnabledAuthProviders, OAuthConsentRequest, PasswordPolicy, SsoProvider } from '@imprime/common'
import { authDb, authDbSupportsTransactions, authMongoClient } from '../config/authDb.js'
import type { MailerService } from './MailerService.js'
import type { OnboardingService } from './OnboardingService.js'
import { NotFoundError } from './errors.js'

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

function hasAdminRole(user: User | null): boolean {
  return user !== null && 'role' in user && user.role === ADMIN_ROLE
}

// The admin plugin's ban, which it enforces on sessions only. A ban past its
// `banExpires` has lapsed; none means for good.
function isBanned(user: User): boolean {
  if (!('banned' in user) || user.banned !== true) return false
  const expires = 'banExpires' in user ? user.banExpires : null
  return !(expires instanceof Date) || expires.getTime() > Date.now()
}

// An address as better-auth stores it, lower-cased: what the server commands
// look accounts up by.
function normalizedEmail(email: string): string {
  return email.trim().toLowerCase()
}

const noAccount = (email: string) => new Error(`No account uses ${email}: its owner signs up first.`)

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// What better-auth's MCP plugin stores under a consent code while the user
// has not answered (`/mcp/authorize` with `prompt=consent`).
interface PendingAuthorization {
  clientId: string
  redirectURI: string
  userId: string
  scopes: string[]
}

function parsePendingAuthorization(value: string): PendingAuthorization | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return null
  }
  if (!isRecord(parsed)) return null
  const { clientId, redirectURI, userId, scope, requireConsent } = parsed
  if (typeof clientId !== 'string' || typeof redirectURI !== 'string' || typeof userId !== 'string') return null
  // Once answered, the same row holds the code the client exchanges.
  if (requireConsent !== true) return null
  const scopes = Array.isArray(scope) ? scope.filter((s): s is string => typeof s === 'string') : []
  return { clientId, redirectURI, userId, scopes }
}

// "https://claude.ai", or the whole URI when it has no origin to show: an
// application's own scheme, such as "vscode://…".
function redirectTarget(redirectURI: string): string | null {
  try {
    const url = new URL(redirectURI)
    return url.origin !== 'null' ? url.origin : `${url.protocol}//${url.host}${url.pathname}`
  } catch {
    return null
  }
}

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
// (`AuthService.proveAddress`), `accountCreated` once an account is created
// (`AuthService.accountCreated`).
function buildAuth(
  mailer: MailerService,
  settings: AuthSettings,
  proveAddress: (userId: string) => Promise<void>,
  accountCreated: (userId: string) => Promise<void>,
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

  // `firstAccount` changes with the accounts, not the settings: added per
  // request (`AuthService.authProviders`).
  const enabledProviders: Omit<EnabledAuthProviders, 'firstAccount'> = {
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
    // Transactions only where the server takes them: a single mongod refuses
    // every write in one ("Transaction numbers are only allowed on a replica
    // set member or mongos"), so they are off unless it is a replica set.
    database: mongodbAdapter(authDb, { client: authMongoClient, transaction: authDbSupportsTransactions() }),
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
            if (allowedDomains.length === 0) return
            // A provider's unverified address is refused at once; an email
            // sign-up is verified by email afterwards, before it may sign in.
            if (!allowedDomains.includes(domainOf(user.email)) || (fromProvider && !user.emailVerified)) {
              throw domainNotAllowed()
            }
          },
          // However the account was created: a sign-up, a first single
          // sign-on, an administrator. Run once the transaction is committed,
          // and awaited, so the first account is administrator and the
          // account's first page lists the tutorial by the time the sign-up
          // answers; a throw here would fail the sign-up, which
          // `accountCreated` never does.
          after: async (user) => {
            await accountCreated(user.id)
          },
        },
      },
      session: {
        create: {
          // Runs once the credentials were checked, so a refusal tells
          // nothing about an account to whoever does not hold them.
          before: async (session, ctx) => {
            if (!ctx || isAdminRoute(ctx.path)) return
            const user = await ctx.context.internalAdapter.findUserById(session.userId)
            if (!user || hasAdminRole(user)) return

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
      apiKey({ rateLimit: { enabled: false } }),
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
  private built: BuiltAuth

  // Without `onboarding` — the admin commands, which connect the auth database
  // only — a new account starts empty.
  constructor(
    private readonly mailer: MailerService,
    private readonly onboarding?: OnboardingService,
  ) {
    // Replaced at startup by the stored settings (`SettingsService.load`),
    // before the server takes a request — and once the database is connected,
    // which is when it is known to take transactions or not.
    this.built = this.build({
      requireEmailVerification: false,
      passwordPolicy: 'open',
      allowedDomains: [],
      sso: {},
    })
  }

  private build(settings: AuthSettings): BuiltAuth {
    return buildAuth(
      this.mailer,
      settings,
      (userId) => this.proveAddress(userId),
      (userId) => this.accountCreated(userId),
    )
  }

  /** The current instance: read it at each use, it is rebuilt when settings change. */
  public get instance(): BetterAuthInstance {
    return this.built.instance
  }

  /** The providers the current settings enable. */
  public get enabledProviders(): Omit<EnabledAuthProviders, 'firstAccount'> {
    return this.built.enabledProviders
  }

  /** What the sign-in page offers: the settings' providers, and whether no account exists yet. */
  public async authProviders(): Promise<EnabledAuthProviders> {
    return { ...this.built.enabledProviders, firstAccount: await this.hasNoAccount() }
  }

  private async hasNoAccount(): Promise<boolean> {
    const { internalAdapter } = await this.instance.$context
    return (await internalAdapter.countTotalUsers()) === 0
  }

  /**
   * A new account: the first of the instance is its administrator — whoever
   * signs up first on a new instance, as the sign-in page says. After that,
   * the role is given and taken by whoever runs the server (`grantAdmin`,
   * `demoteAdmin`). Then the onboarding copy. Never throws: the account
   * exists already, and a failure here would fail its sign-up.
   */
  private async accountCreated(userId: string): Promise<void> {
    try {
      const { internalAdapter } = await this.instance.$context
      // The only account, this one: two sign-ups at once on a new instance
      // both see two, and neither is made administrator — `npm run admin
      // grant` settles it.
      if ((await internalAdapter.countTotalUsers()) === 1) {
        await internalAdapter.updateUser(userId, { role: ADMIN_ROLE })
        console.log('The first account was made administrator.')
      }
    } catch (error) {
      console.error('Failed to make the first account administrator:', error)
    }
    await this.onboarding?.welcome(userId)
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
   * Gives the admin role to the account with `email`, for whoever runs the
   * server (`npm run admin grant`). The account must exist: its owner signs
   * up first.
   */
  public async grantAdmin(email: string): Promise<{ email: string; changed: boolean }> {
    const { internalAdapter } = await this.instance.$context
    const user = await this.findAccount(email)
    if (hasAdminRole(user)) return { email: user.email, changed: false }
    await internalAdapter.updateUser(user.id, { role: ADMIN_ROLE })
    return { email: user.email, changed: true }
  }

  /**
   * Takes the admin role from the account with `email`, for whoever runs the
   * server (`npm run admin demote`), and signs it out, so the access rules
   * apply to it from its next sign-in. Its API keys keep working, as a user's.
   * Says how many administrators are left: none is allowed, and
   * `grantAdmin` gives the role back.
   */
  public async demoteAdmin(email: string): Promise<{ email: string; changed: boolean; adminsLeft: number }> {
    const { internalAdapter } = await this.instance.$context
    const user = await this.findAccount(email)
    const changed = hasAdminRole(user)
    if (changed) {
      await internalAdapter.updateUser(user.id, { role: DEFAULT_ROLE })
      await internalAdapter.deleteUserSessions(user.id)
    }
    const adminsLeft = await internalAdapter.countTotalUsers([{ field: 'role', value: ADMIN_ROLE }])
    return { email: user.email, changed, adminsLeft }
  }

  /**
   * Gives the account with `email` this password, for whoever runs the server
   * (`npm run admin reset-password`): the way back in without email. Its
   * address is marked verified — the operator vouches for it, and an
   * unverified one could not sign in where verification is required — and
   * everything else that opened the account is revoked: sessions, API keys,
   * MCP tokens, which may be someone else's way in, the reason the command was
   * run. An account made through single sign-on gets a password too.
   */
  public async resetPassword(email: string, password: string): Promise<{ email: string }> {
    const context = await this.instance.$context
    const { internalAdapter } = context
    const found = await internalAdapter.findUserByEmail(normalizedEmail(email), { includeAccounts: true })
    if (!found) throw noAccount(email)

    const { user, accounts } = found
    const hash = await context.password.hash(password)
    if (accounts.some(account => account.providerId === 'credential')) {
      await internalAdapter.updatePassword(user.id, hash)
    } else {
      await internalAdapter.linkAccount({ userId: user.id, providerId: 'credential', accountId: user.id, password: hash })
    }
    await internalAdapter.updateUser(user.id, { emailVerified: true })
    await this.revokeAccess(user.id)
    return { email: user.email }
  }

  private async findAccount(email: string): Promise<User> {
    const { internalAdapter } = await this.instance.$context
    const found = await internalAdapter.findUserByEmail(normalizedEmail(email))
    if (!found) throw noAccount(email)
    return found.user
  }

  /** Read from the database, so it holds for API keys as for sessions. */
  public async isAdmin(userId: string): Promise<boolean> {
    const { internalAdapter } = await this.instance.$context
    return hasAdminRole(await internalAdapter.findUserById(userId))
  }

  /**
   * At startup, on an instance without any account: whoever signs up first
   * becomes its administrator, so the operator is told to do it now. Run once
   * the auth database is connected.
   */
  public async warnIfNoAccount(): Promise<void> {
    if (!(await this.hasNoAccount())) return
    const url = process.env.PUBLIC_APP_URL?.trim() || 'the app'
    console.warn(`No account yet: the first to sign up at ${url} becomes the administrator. Do it now.`)
  }

  /**
   * The authorization `consentCode` awaits, for the consent page: only to
   * `userId`, the user it was asked of, and only while it awaits an answer.
   * The application's name is its own claim; where the access goes is what
   * the user can judge it by.
   */
  public async getOAuthConsent(consentCode: string, userId: string): Promise<OAuthConsentRequest> {
    const notFound = () => new NotFoundError('Authorization request not found or expired', 'OAUTH_CONSENT_NOT_FOUND')
    const { adapter, internalAdapter } = await this.instance.$context
    const verification = await internalAdapter.findVerificationValue(consentCode)
    if (!verification || verification.expiresAt < new Date()) throw notFound()
    const pending = parsePendingAuthorization(verification.value)
    if (!pending || pending.userId !== userId) throw notFound()
    const redirectTo = redirectTarget(pending.redirectURI)
    if (!redirectTo) throw notFound()

    // The mcp plugin's model for registered clients.
    const client = await adapter.findOne<{ name?: string | null }>({
      model: 'oauthApplication',
      where: [{ field: 'clientId', value: pending.clientId }],
    })
    return {
      clientName: client?.name?.trim() || null,
      redirectTo,
      keepsAccess: pending.scopes.includes('offline_access'),
    }
  }

  /**
   * Whether `userId` may still use the instance outside a session — API keys,
   * MCP tokens — which the session hooks and the admin plugin never see: not
   * banned, and under the domain list as at sign-in, administrators exempt.
   */
  private async isAllowedWithoutSession(userId: string): Promise<boolean> {
    const { internalAdapter } = await this.instance.$context
    const user = await internalAdapter.findUserById(userId)
    if (!user || isBanned(user)) return false
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
