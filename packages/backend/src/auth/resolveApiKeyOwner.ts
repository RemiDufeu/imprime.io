import { auth } from './auth.js'

export async function resolveApiKeyOwner(key: string): Promise<string | null> {
  if (!key) return null
  const result = await auth.api.verifyApiKey({ body: { key } })
  return result?.valid && result.key ? result.key.referenceId : null
}
