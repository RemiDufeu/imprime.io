import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { presentationService } from '../../services/index.js'
import { toolError, errorMessage } from './errors.js'

export function registerListPresentations(server: McpServer): void {
  server.registerTool(
    'list_presentations',
    {
      title: 'List presentations',
      description: 'List all presentations available in the Imprime backend.',
    },
    async () => {
      try {
        const presentations = await presentationService.list()
        return {
          content: [{ type: 'text', text: JSON.stringify(presentations, null, 2) }],
        }
      } catch (err) {
        return toolError(`Failed to list presentations: ${errorMessage(err)}`)
      }
    }
  )
}
