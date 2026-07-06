import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerListPresentations } from './listPresentations.js'
import { registerExportPresentation } from './exportPresentation.js'

/** `ownerId` : utilisateur propriétaire de la session MCP (résolu depuis la clé d'API). */
export function registerTools(server: McpServer, ownerId: string): void {
  registerListPresentations(server, ownerId)
  registerExportPresentation(server, ownerId)
}
