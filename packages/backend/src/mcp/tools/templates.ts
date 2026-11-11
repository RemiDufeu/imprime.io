import { z } from 'zod/v3'
import type { PageSize } from '@imprime/common'
import { createPageNumberBox, DEFAULT_PAGE_SIZE, PAGE_FORMATS } from '@imprime/common'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { templateFileService, templateService } from '../../services/index.js'
import { assertOwnsTemplate } from '../../middleware/requireOwnsTemplate.js'
import {
  formatIssues,
  objectIdSchema,
  pageFormatSchema,
  pageNumberingChangeSchema,
  pageSizeSchema,
  templateCodeSchema,
  textShapeSchema,
} from '../schemas.js'
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
      description: 'List your templates, most recently changed first: _id, title, code (when set) and page size.',
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
        code: templateCodeSchema.optional().describe(
          'A code an integration prints the template by instead of its _id (POST /api/export/code/{code}/pdf), ' +
          'unique among your templates. Unset has none'
        ),
      },
      outputSchema: {
        templateId: z.string().describe('_id of the new template'),
        pageId: z.string().describe('_id of its blank page'),
        pageSize: z.object({ width: z.number(), height: z.number() }).describe('Size of every page'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ title, format, pageSize, code }) => {
      try {
        if (format !== undefined && pageSize !== undefined) {
          return toolError('Give a format or a pageSize, not both')
        }
        const size: PageSize | undefined = format !== undefined
          ? PAGE_FORMATS.find(candidate => candidate.id === format)?.size
          : pageSize
        const template = await templateService.create({ title, pageSize: size, code }, ownerId)
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
    'duplicate_template',
    {
      title: 'Duplicate a template',
      description:
        'Make a copy of a template — pages, variables, page numbering — every part under a new _id, showing the ' +
        'same images: to start a variant from it without touching it. Returns the copy\'s _id and its pages\'.',
      inputSchema: {
        templateId: objectIdSchema.describe('_id of the template to copy'),
        title: z.string().min(1).optional().describe('Unset is the source\'s title with " (copy)"'),
        code: templateCodeSchema.optional()
          .describe('The copy\'s code, unique among your templates. Unset is none: the source\'s is taken'),
      },
      outputSchema: {
        templateId: z.string().describe('_id of the copy'),
        pageIds: z.array(z.string()).describe('_id of each of its pages, in order'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ templateId, title, code }) => {
      try {
        await assertOwnsTemplate(templateId, ownerId)
        const copy = await templateFileService.duplicate(templateId, ownerId, { title, code })
        const created = { templateId: copy._id, pageIds: copy.pages.map(page => page._id) }
        return {
          ...textResult(`Template "${copy.title}" created as a copy:\n${JSON.stringify(created, null, 2)}`),
          structuredContent: created,
        }
      } catch (err) {
        return toolError(`Failed to duplicate the template: ${errorMessage(err)}`)
      }
    }
  )

  server.registerTool(
    'update_template',
    {
      title: 'Update a template',
      description:
        'Change a template\'s title, its code, or both; what is left out is kept. Its page size is chosen once, at creation.',
      inputSchema: {
        templateId: objectIdSchema.describe('_id of the template'),
        title: z.string().min(1).optional().describe('The new title'),
        code: templateCodeSchema.nullable().optional().describe(
          'The new code, unique among your templates; null removes it'
        ),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ templateId, title, code }) => {
      try {
        if (title === undefined && code === undefined) return toolError('Give a title, a code, or both')
        await assertOwnsTemplate(templateId, ownerId)
        const template = await templateService.update(templateId, { title, code })
        const codeText = template.code !== undefined ? `code ${template.code}` : 'no code'
        return textResult(`Template ${template._id}: "${template.title}", ${codeText}.`)
      } catch (err) {
        return toolError(`Failed to update the template: ${errorMessage(err)}`)
      }
    }
  )

  server.registerTool(
    'set_page_numbering',
    {
      title: 'Number the pages',
      description:
        'The way to put page numbers on a template — whenever numbering, pagination or "page X of Y" is asked for. ' +
        'One text box, the template\'s, drawn over every page of the PDF at the same place, as a slide number is, ' +
        'its number counted in the PDF. { "pageNumbering": {} } numbers the pages at the bottom right; the fields ' +
        'given then change the numbering, the rest kept; null removes it. Leave it off one page with update_page\'s ' +
        'hidePageNumber. Returns the box.',
      inputSchema: {
        templateId: objectIdSchema.describe('_id of the template'),
        pageNumbering: pageNumberingChangeSchema.nullable()
          .describe('What to change of the numbering — {} turns it on as it is, or as the default; null removes it'),
      },
      outputSchema: {
        numbered: z.boolean().describe('Whether the pages are numbered now'),
        box: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional()
          .describe('Where the box is, in page units'),
        skipFirstPage: z.boolean().optional().describe('Whether the first page goes without it'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ templateId, pageNumbering }) => {
      try {
        await assertOwnsTemplate(templateId, ownerId)
        if (pageNumbering === null) {
          await templateService.update(templateId, { pageNumbering: null })
          return {
            ...textResult(`Pages of ${templateId} no longer numbered.`),
            structuredContent: { numbered: false },
          }
        }

        // The change applied to the box there is: the template's, or the
        // default one. Fields the change leaves out come back undefined from
        // the partial schema, and must not overwrite the box's.
        const template = await templateService.getById(templateId)
        const current = template.pageNumbering
        const changes = Object.fromEntries(
          Object.entries(pageNumbering.box ?? {}).filter(([, value]) => value !== undefined)
        )
        const parsed = textShapeSchema.safeParse({
          ...(current?.box ?? createPageNumberBox(template.pageSize)),
          ...changes,
          type: 'text',
        })
        if (!parsed.success) {
          return toolError(`The box would not be a valid text shape:\n${formatIssues(parsed.error).join('\n')}`)
        }
        const skipFirstPage = pageNumbering.skipFirstPage ?? current?.skipFirstPage
        await templateService.update(templateId, {
          pageNumbering: { box: parsed.data, ...(skipFirstPage !== undefined ? { skipFirstPage } : {}) },
        })

        const { x, y, width, height } = parsed.data
        const box = { x, y, width, height }
        return {
          ...textResult(
            `Pages of ${templateId} numbered: box at (${x}, ${y}), ${width}×${height}` +
            `${skipFirstPage ? ', not on the first page' : ''}. The user sees the numbers on preview_template's page.`
          ),
          structuredContent: { numbered: true, box, ...(skipFirstPage !== undefined ? { skipFirstPage } : {}) },
        }
      } catch (err) {
        return toolError(`Failed to set the page numbering: ${errorMessage(err)}`)
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
