import '../loadEnv.js'
import { betterAuth } from 'better-auth'
import { mongodbAdapter } from 'better-auth/adapters/mongodb'
import { apiKey } from '@better-auth/api-key'
import type { EnabledAuthProviders } from '@imprime/common'
import { authDb, authMongoClient } from '../config/authDb.js'
import { isSmtpConfigured, sendMail } from '../mailer/index.js'

interface ProviderCreds {
  clientId: string
  clientSecret: string
}

// Return OAuth credential if both clientId and clientSecret are present
function creds(clientId?: string, clientSecret?: string): ProviderCreds | undefined {
  return clientId && clientSecret ? { clientId, clientSecret } : undefined
}

const google = creds(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
const github = creds(process.env.GITHUB_CLIENT_ID, process.env.GITHUB_CLIENT_SECRET)
const microsoftBase = creds(process.env.MICROSOFT_CLIENT_ID, process.env.MICROSOFT_CLIENT_SECRET)
const microsoft = microsoftBase
  ? { ...microsoftBase, tenantId: process.env.MICROSOFT_TENANT_ID || 'common' }
  : undefined

export const enabledAuthProviders: EnabledAuthProviders = {
  emailPassword: true,
  google: Boolean(google),
  github: Boolean(github),
  microsoft: Boolean(microsoft),
}

const requireEmailVerification = process.env.REQUIRE_EMAIL_VERIFICATION === 'true'

if (requireEmailVerification && !isSmtpConfigured) {
  throw new Error(
    'REQUIRE_EMAIL_VERIFICATION=true requires SMTP configuration (SMTP_HOST, SMTP_FROM, ...).',
  )
}

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3001',
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [process.env.CORS_ORIGIN || 'http://localhost:5173'],
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
            await sendMail({
              to: user.email,
              subject: 'Vérifiez votre adresse email',
              text: `Bonjour${user.name ? ' ' + user.name : ''},\n\nCliquez sur le lien suivant pour vérifier votre adresse email :\n${url}\n`,
              html: `<p>Bonjour${user.name ? ' ' + user.name : ''},</p><p>Cliquez sur le lien suivant pour vérifier votre adresse email :</p><p><a href="${url}">${url}</a></p>`,
            })
          },
        },
      }
    : {}),
  socialProviders: {
    ...(google ? { google } : {}),
    ...(github ? { github } : {}),
    ...(microsoft ? { microsoft } : {}),
  },
  plugins: [apiKey()],
})
