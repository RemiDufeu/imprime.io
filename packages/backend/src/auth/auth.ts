import '../loadEnv.js'
import { betterAuth } from 'better-auth'
import { mongodbAdapter } from 'better-auth/adapters/mongodb'
import { apiKey } from '@better-auth/api-key'
import type { EnabledAuthProviders } from '@imprime/common'
import { authDb, authMongoClient } from '../config/authDb.js'

interface ProviderCreds {
  clientId: string
  clientSecret: string
}

/** Retourne les identifiants OAuth seulement si les deux sont présents. */
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

/**
 * Instance Better Auth (commune aux deux éditions).
 *
 * Providers sociaux activés conditionnellement : on peut développer avec un seul
 * (ex. GitHub). Plugin `apiKey` pour l'accès programmatique via le SDK.
 */
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3001',
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [process.env.CORS_ORIGIN || 'http://localhost:5173'],
  database: mongodbAdapter(authDb, { client: authMongoClient }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  socialProviders: {
    ...(google ? { google } : {}),
    ...(github ? { github } : {}),
    ...(microsoft ? { microsoft } : {}),
  },
  plugins: [apiKey()],
})
