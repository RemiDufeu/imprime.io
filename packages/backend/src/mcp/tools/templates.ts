import { z } from 'zod/v3'
import type { PageSize } from '@imprime/common'
import { DEFAULT_PAGE_SIZE, PAGE_FORMATS } from '@imprime/common'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { templateService } from '../../services/index.js'
import { assertOwnsTemplate } from '../../middleware/requireOwnsTemplate.js'
import { objectIdSchema, pageFormatSchema, pageSizeSchema } from '../schemas.js'
import { toolError, errorMessage, textResult } from './errors.js'

const IMAGE_DATA_URL = /^data:image\/(png|jpeg);base64,/i

// An image default — a variable's, or an image property's in a list default —
// is a data URL of up to several megabytes, of no use to an agent reading the
// template: it is told the image is there.
function elideImageDataUrls(_key: string, value: unknown): unknown {
  return typeof value === 'string' && IMAGE_DATA_URL.test(value)
    ? `<image data URL, ${value.length} characters>`
    : value
}

const formatList = PAGE_FORMATS.map(format => `${format.id} (${format.size.width} × ${format.size.height})`).join(', ')

export function registerTemplateTools(server: McpServer, ownerId: string): void {
  server.registerTool(
    'list_templates',
    {
      title: 'List templates',
      description: 'List your templates, most recently changed first: _id, title and page size.',
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const templates = await templateService.list(ownerId)
        return textResult(JSON.stringify(templates, null, 2))
      } catch (err) {
        return toolError(`Failed to list templates: ${errorMessage(err)}`)
      }
    }
  )

  server.registerTool(
    'get_template',
    {
      title: 'Get a template',
      description:
        'Read a whole template: its page size, its variables (with their _id, which shapes refer to) and each page ' +
        'with its condition, repeat and full shape tree — the JSON set_page_shapes takes back. Image data URLs ' +
        'in variable defaults are shortened to a placeholder: never write one back.',
      inputSchema: { templateId: objectIdSchema.describe('_id of the template') },
      annotations: { readOnlyHint: true },
    },
    async ({ templateId }) => {
      try {
        await assertOwnsTemplate(templateId, ownerId)
        const template = await templateService.getById(templateId)
        return textResult(JSON.stringify(template, elideImageDataUrls))
      } catch (err) {
        return toolError(`Failed to read the template: ${errorMessage(err)}`)
      }
    }
  )

  server.registerTool(
    'create_template',
    {
      title: 'Create a template',
      description:
        'Create an empty template with one blank page, and return its _id and the page\'s. Every page of a template ' +
        `has the same size, in the units its shapes are placed in. Formats: ${formatList}.`,
      inputSchema: {
        title: z.string().min(1).optional().describe('Unset is "Untitled Template"'),
        format: pageFormatSchema.optional().describe(
          `One of the formats; unset (with no pageSize) is ${DEFAULT_PAGE_SIZE.width} × ${DEFAULT_PAGE_SIZE.height}`
        ),
        pageSize: pageSizeSchema.optional().describe('A custom page size, instead of a format'),
      },
      outputSchema: {
        templateId: z.string().describe('_id of the new template'),
        pageId: z.string().describe('_id of its blank page'),
        pageSize: z.object({ width: z.number(), height: z.number() }).describe('Size of every page'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ title, format, pageSize }) => {
      try {
        if (format !== undefined && pageSize !== undefined) {
          return toolError('Give a format or a pageSize, not both')
        }
        const size: PageSize | undefined = format !== undefined
          ? PAGE_FORMATS.find(candidate => candidate.id === format)?.size
          : pageSize
        const template = await templateService.create({ title, pageSize: size }, ownerId)
        const created = { templateId: template._id, pageId: template.pages[0]._id, pageSize: template.pageSize }
        return {
          ...textResult(`Template "${template.title}" created:\n${JSON.stringify(created, null, 2)}`),
          structuredContent: created,
        }
      } catch (err) {
        return toolError(`Failed to create the template: ${errorMessage(err)}`)
      }
    }
  )

  server.registerTool(
    'rename_template',
    {
      title: 'Rename a template',
      description: 'Change a template\'s title. Its page size is chosen once, at creation.',
      inputSchema: {
        templateId: objectIdSchema.describe('_id of the template'),
        title: z.string().min(1).describe('The new title'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ templateId, title }) => {
      try {
        await assertOwnsTemplate(templateId, ownerId)
        const template = await templateService.update(templateId, { title })
        return textResult(`Template ${template._id} renamed "${template.title}".`)
      } catch (err) {
        return toolError(`Failed to rename the template: ${errorMessage(err)}`)
      }
    }
  )

  server.registerTool(
    'delete_template',
    {
      title: 'Delete a template',
      description: 'Delete a template with its pages, variables and the images only it shows. This cannot be undone.',
      inputSchema: { templateId: objectIdSchema.describe('_id of the template') },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ templateId }) => {
      try {
        await assertOwnsTemplate(templateId, ownerId)
        await templateService.delete(templateId)
        return textResult(`Template ${templateId} deleted.`)
      } catch (err) {
        return toolError(`Failed to delete the template: ${errorMessage(err)}`)
      }
    }
  )
}
