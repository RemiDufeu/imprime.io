import { createAuthClient } from 'better-auth/react'
import { apiKeyClient } from '@better-auth/api-key/client'

// L'API est sur VITE_API_URL (…/api) ; Better Auth est monté sous …/api/auth.
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

export const authClient = createAuthClient({
  baseURL: `${API_BASE_URL.replace(/\/$/, '')}/auth`,
  plugins: [apiKeyClient()],
})

export const { signIn, signOut, useSession } = authClient
