import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerListTemplates } from './listTemplates.js'
import { registerExportTemplate } from './exportTemplate.js'

/** `ownerId` : owner of the MCP session (resolved from the API key). */
export function registerTools(server: McpServer, ownerId: string): void {
  registerListTemplates(server, ownerId)
  registerExportTemplate(server, ownerId)
}
