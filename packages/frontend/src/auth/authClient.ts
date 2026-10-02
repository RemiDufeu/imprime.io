import { createAuthClient } from 'better-auth/react'
import { adminClient } from 'better-auth/client/plugins'
import { apiKeyClient } from '@better-auth/api-key/client'
import { AUTH_BASE } from '../config'

export const authClient = createAuthClient({
  baseURL: AUTH_BASE,
  plugins: [apiKeyClient(), adminClient()],
})

export const { signIn, signUp, signOut, useSession } = authClient

/**
 * Whether the signed-in user manages the instance (fonts, settings). Only
 * decides what the UI shows: the API checks the role itself.
 */
export function isAdmin(user: { role?: string | null } | undefined): boolean {
  return user?.role === 'admin'
}
