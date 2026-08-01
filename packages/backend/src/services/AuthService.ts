import { betterAuth } from 'better-auth'
import { mongodbAdapter } from 'better-auth/adapters/mongodb'
import { mcp } from 'better-auth/plugins'
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

function buildAuth(mailer: MailerService) {
  const google = creds(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  const github = creds(process.env.GITHUB_CLIENT_ID, process.env.GITHUB_CLIENT_SECRET)
  const microsoftBase = creds(
    process.env.MICROSOFT_CLIENT_ID,
    process.env.MICROSOFT_CLIENT_SECRET,
  )
  const microsoft = microsoftBase
    ? { ...microsoftBase, tenantId: process.env.MICROSOFT_TENANT_ID || 'common' }
    : undefined

  const enabledProviders: EnabledAuthProviders = {
    emailPassword: true,
    google: Boolean(google),
    github: Boolean(github),
    microsoft: Boolean(microsoft),
  }

  const requireEmailVerification = process.env.REQUIRE_EMAIL_VERIFICATION === 'true'

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
    plugins: [
      apiKey(),
      mcp({
        loginPage: '/login',
      }),
    ],
  })

  return { instance, enabledProviders }
}

type BetterAuthInstance = ReturnType<typeof buildAuth>['instance']

export class AuthService {
  public readonly instance: BetterAuthInstance
  public readonly enabledProviders: EnabledAuthProviders

  constructor(mailer: MailerService) {
    const { instance, enabledProviders } = buildAuth(mailer)
    this.instance = instance
    this.enabledProviders = enabledProviders
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
