import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerListPresentations } from './listPresentations.js'
import { registerExportPresentation } from './exportPresentation.js'

export function registerTools(server: McpServer): void {
  registerListPresentations(server)
  registerExportPresentation(server)
}
