import { z } from 'zod/v3'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { pageService } from '../../services/index.js'
import { assertOwnsTemplate } from '../../middleware/requireOwnsTemplate.js'
import { objectIdSchema, pageRepeatSchema, visibilityConditionSchema } from '../schemas.js'
import { toolError, errorMessage, textResult } from './errors.js'

const templateIdField = objectIdSchema.describe('_id of the template')
const pageIdField = objectIdSchema.describe('_id of the page')
const positionField = z.number().int().nonnegative()

const conditionDescription =
  'Exported only when this boolean variable holds — checked copy by copy on a repeated page, where itemPath ' +
  'reads a property of the copy\'s item. The editor shows the page whatever it says'
const repeatDescription =
  'Exported once per item of this object-list variable, in its place: its shapes read the item\'s properties ' +
  'through itemPath. The editor shows one copy'

export function registerPageTools(server: McpServer, ownerId: string): void {
  server.registerTool(
    'add_page',
    {
      title: 'Add a page',
      description: 'Add a blank page to a template, and return its _id. Draw on it with set_page_shapes.',
      inputSchema: {
        templateId: templateIdField,
        position: positionField.optional()
          .describe('0-based place among the pages; the pages from there on move down one. Unset is the end'),
        visibleWhen: visibilityConditionSchema.optional().describe(conditionDescription),
        repeat: pageRepeatSchema.optional().describe(repeatDescription),
      },
      outputSchema: {
        pageId: z.string().describe('_id of the new page'),
        position: z.number().describe('Its 0-based place among the pages'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ templateId, position, visibleWhen, repeat }) => {
      try {
        await assertOwnsTemplate(templateId, ownerId)
        const page = await pageService.create(templateId, ownerId, { order: position, visibleWhen, repeat })
        return {
          ...textResult(`Page ${page._id} added at position ${page.order}.`),
          structuredContent: { pageId: page._id, position: page.order },
        }
      } catch (err) {
        return toolError(`Failed to add the page: ${errorMessage(err)}`)
      }
    }
  )

  server.registerTool(
    'update_page',
    {
      title: 'Set a page\'s condition or repeat',
      description: 'Set or remove the condition and the repeat of a page. A field left out is kept as it is.',
      inputSchema: {
        templateId: templateIdField,
        pageId: pageIdField,
        visibleWhen: visibilityConditionSchema.nullable().optional()
          .describe(`${conditionDescription}. null removes it`),
        repeat: pageRepeatSchema.nullable().optional().describe(`${repeatDescription}. null removes it`),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ templateId, pageId, visibleWhen, repeat }) => {
      try {
        await assertOwnsTemplate(templateId, ownerId)
        await pageService.update(templateId, ownerId, pageId, { visibleWhen, repeat })
        return textResult(`Page ${pageId} updated.`)
      } catch (err) {
        return toolError(`Failed to update the page: ${errorMessage(err)}`)
      }
    }
  )

  server.registerTool(
    'move_page',
    {
      title: 'Move a page',
      description: 'Move a page to another place among its template\'s pages.',
      inputSchema: {
        templateId: templateIdField,
        pageId: pageIdField,
        position: positionField.describe('0-based place to move it to; past the end is the end'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ templateId, pageId, position }) => {
      try {
        await assertOwnsTemplate(templateId, ownerId)
        const pageIds = await pageService.move(templateId, pageId, position)
        return textResult(`Pages, in order: ${pageIds.join(', ')}`)
      } catch (err) {
        return toolError(`Failed to move the page: ${errorMessage(err)}`)
      }
    }
  )

  server.registerTool(
    'delete_page',
    {
      title: 'Delete a page',
      description: 'Delete a page and its shapes. A template keeps at least one page. This cannot be undone.',
      inputSchema: { templateId: templateIdField, pageId: pageIdField },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ templateId, pageId }) => {
      try {
        await assertOwnsTemplate(templateId, ownerId)
        await pageService.delete(templateId, ownerId, pageId)
        return textResult(`Page ${pageId} deleted.`)
      } catch (err) {
        return toolError(`Failed to delete the page: ${errorMessage(err)}`)
      }
    }
  )
}
