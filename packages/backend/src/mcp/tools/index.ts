import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerListPresentations } from './listPresentations.js'
import { registerExportPresentation } from './exportPresentation.js'

/** `ownerId` : owner of the MCP session (resolved from the API key). */
export function registerTools(server: McpServer, ownerId: string): void {
  registerListPresentations(server, ownerId)
  registerExportPresentation(server, ownerId)
}
