import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { templateService } from '../../services/index.js'
import { toolError, errorMessage } from './errors.js'

export function registerListTemplates(server: McpServer, ownerId: string): void {
  server.registerTool(
    'list_templates',
    {
      title: 'List templates',
      description: 'List all templates available in the Imprime backend.',
    },
    async () => {
      try {
        const templates = await templateService.list(ownerId)
        return {
          content: [{ type: 'text', text: JSON.stringify(templates, null, 2) }],
        }
      } catch (err) {
        return toolError(`Failed to list templates: ${errorMessage(err)}`)
      }
    }
  )
}
