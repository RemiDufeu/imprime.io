import { createAuthClient } from 'better-auth/react'
import { apiKeyClient } from '@better-auth/api-key/client'

export const authClient = createAuthClient({
  baseURL: `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/auth`,
  plugins: [apiKeyClient()],
})

export const { signIn, signUp, signOut, useSession } = authClient
