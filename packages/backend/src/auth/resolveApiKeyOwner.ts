import { auth } from './auth.js'

/**
 * Vérifie une clé d'API et retourne l'id de l'utilisateur propriétaire, ou `null`.
 * Utilisé hors contexte Express (ex. transport MCP) pour authentifier par clé.
 */
export async function resolveApiKeyOwner(key: string): Promise<string | null> {
  if (!key) return null
  const result = await auth.api.verifyApiKey({ body: { key } })
  return result?.valid && result.key ? result.key.referenceId : null
}
