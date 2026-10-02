import { betterAuth, type User } from 'better-auth'
import { mongodbAdapter } from 'better-auth/adapters/mongodb'
import { admin, mcp } from 'better-auth/plugins'
import { apiKey } from '@better-auth/api-key'
import type { EnabledAuthProviders } from '@imprime/common'
import { authDb, authMongoClient } from '../config/authDb.js'
import type { MailerService } from './MailerService.js'

interface ProviderCreds {
  clientId: string
  clientSecret: string
}

function creds(clientId?: string, clientSecret?: string): ProviderCreds | undefined {
  return clientId && clientSecret ? { clientId, clientSecret } : undefined
}

function trustedOrigins(): string[] {
  return (
    process.env.CORS_ORIGIN?.split(',')
      .map((o) => o.trim())
      .filter(Boolean) ?? []
  )
}

const ADMIN_ROLE = 'admin'

// Lower-cased addresses from ADMIN_EMAILS (comma-separated).
function configuredAdminEmails(): Set<string> {
  return new Set(
    process.env.ADMIN_EMAILS?.split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean) ?? [],
  )
}

function hasAdminRole(user: User | null): boolean {
  return user !== null && 'role' in user && user.role === ADMIN_ROLE
}

// The part of better-auth's internal adapter promotion needs.
interface UserStore {
  findUserById(userId: string): Promise<User | null>
  updateUser(userId: string, data: { role: string }): Promise<unknown>
}

/**
 * Gives the admin role to `user` if ADMIN_EMAILS lists its address. The role
 * then lives in the database: taking an address out of the list demotes no one.
 *
 * In production the address must be verified — by email or by an SSO
 * provider — or whoever registered it first, not necessarily its owner, would
 * become admin. Elsewhere it is trusted as is, so a local instance without
 * SMTP can have an admin.
 */
async function promoteIfConfiguredAdmin(
  store: UserStore,
  user: User | null,
  adminEmails: ReadonlySet<string>,
): Promise<'promoted' | 'unverified' | 'skipped'> {
  if (!user || hasAdminRole(user) || !adminEmails.has(user.email.toLowerCase())) return 'skipped'
  if (!user.emailVerified && process.env.NODE_ENV === 'production') return 'unverified'

  await store.updateUser(user.id, { role: ADMIN_ROLE })
  return 'promoted'
}

function buildAuth(mailer: MailerService) {
  const adminEmails = configuredAdminEmails()

  const google = creds(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  const github = creds(process.env.GITHUB_CLIENT_ID, process.env.GITHUB_CLIENT_SECRET)
  const microsoftBase = creds(
    process.env.MICROSOFT_CLIENT_ID,
    process.env.MICROSOFT_CLIENT_SECRET,
  )
  const microsoft = microsoftBase
    ? { ...microsoftBase, tenantId: process.env.MICROSOFT_TENANT_ID || 'common' }
    : undefined

  const requireEmailVerification = process.env.REQUIRE_EMAIL_VERIFICATION === 'true'
  const passwordResetEnabled = mailer.isConfigured

  const enabledProviders: EnabledAuthProviders = {
    emailPassword: true,
    google: Boolean(google),
    github: Boolean(github),
    microsoft: Boolean(microsoft),
    requireEmailVerification,
    passwordReset: passwordResetEnabled,
  }

  if (requireEmailVerification && !mailer.isConfigured) {
    throw new Error(
      'REQUIRE_EMAIL_VERIFICATION=true requires SMTP configuration (SMTP_HOST, SMTP_FROM, ...).',
    )
  }

  const instance = betterAuth({
    baseURL: process.env.PUBLIC_APP_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    trustedOrigins: trustedOrigins(),
    database: mongodbAdapter(authDb, { client: authMongoClient }),
    emailAndPassword: {
      enabled: true,
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
    ...(requireEmailVerification
      ? {
          emailVerification: {
            sendOnSignUp: true,
            autoSignInAfterVerification: true,
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
    ...(requireEmailVerification
      ? {
          account: {
            accountLinking: {
              enabled: true,
              trustedProviders: ['google', 'github', 'microsoft'],
            },
          },
        }
      : {}),
    databaseHooks: {
      session: {
        create: {
          after: async (session, ctx) => {
            if (!ctx) return
            // A failed promotion must not fail the sign-in; the next one retries.
            try {
              const store = ctx.context.internalAdapter
              await promoteIfConfiguredAdmin(store, await store.findUserById(session.userId), adminEmails)
            } catch (error) {
              console.error('Failed to apply ADMIN_EMAILS on sign-in:', error)
            }
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

  return { instance, enabledProviders, adminEmails }
}

type BetterAuthInstance = ReturnType<typeof buildAuth>['instance']

export class AuthService {
  public readonly instance: BetterAuthInstance
  public readonly enabledProviders: EnabledAuthProviders
  private readonly adminEmails: ReadonlySet<string>

  constructor(mailer: MailerService) {
    const { instance, enabledProviders, adminEmails } = buildAuth(mailer)
    this.instance = instance
    this.enabledProviders = enabledProviders
    this.adminEmails = adminEmails
  }

  /** Read from the database, so it holds for API keys as for sessions. */
  public async isAdmin(userId: string): Promise<boolean> {
    const { internalAdapter } = await this.instance.$context
    return hasAdminRole(await internalAdapter.findUserById(userId))
  }

  /**
   * Promotes the ADMIN_EMAILS accounts that already exist, so an admin signed
   * in before the address was listed does not have to sign in again. Run once
   * at startup, once the auth database is connected.
   */
  public async promoteConfiguredAdmins(): Promise<void> {
    const { internalAdapter } = await this.instance.$context
    for (const email of this.adminEmails) {
      const found = await internalAdapter.findUserByEmail(email)
      const outcome = await promoteIfConfiguredAdmin(internalAdapter, found?.user ?? null, this.adminEmails)
      if (outcome === 'promoted') console.log(`Admin role given to ${email} (ADMIN_EMAILS)`)
      if (outcome === 'unverified') console.warn(`ADMIN_EMAILS: ${email} is not verified, not promoted`)
    }
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
