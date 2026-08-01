import { createAuthClient } from 'better-auth/react'
import { apiKeyClient } from '@better-auth/api-key/client'
import { AUTH_BASE } from '../config'

export const authClient = createAuthClient({
  baseURL: AUTH_BASE,
  plugins: [apiKeyClient()],
})

export const { signIn, signUp, signOut, useSession } = authClient
