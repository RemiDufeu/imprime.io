import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerTemplateTools } from './templates.js'
import { registerPageTools } from './pages.js'
import { registerVariableTools } from './variables.js'
import { registerShapeTools } from './shapes.js'
import { registerAssetTools } from './assets.js'
import { registerPreviewTemplate } from './previewTemplate.js'

/** `ownerId` : owner of the MCP session (resolved from the API key). */
export function registerTools(server: McpServer, ownerId: string): void {
  registerTemplateTools(server, ownerId)
  registerPageTools(server, ownerId)
  registerVariableTools(server, ownerId)
  registerShapeTools(server, ownerId)
  registerAssetTools(server, ownerId)
  registerPreviewTemplate(server, ownerId)
}
