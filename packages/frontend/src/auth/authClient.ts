import { createAuthClient } from 'better-auth/react'
import { apiKeyClient } from '@better-auth/api-key/client'

const API_BASE_URL = `${import.meta.env.VITE_API_URL}/api` || 'http://localhost:3001/api'

export const authClient = createAuthClient({
  baseURL: `${API_BASE_URL.replace(/\/$/, '')}/auth`,
  plugins: [apiKeyClient()],
})

export const { signIn, signUp, signOut, useSession } = authClient
