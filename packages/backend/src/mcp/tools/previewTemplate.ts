import { z } from 'zod/v3'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { getPreviewPath } from '@imprime/common'
import { previewService } from '../../services/index.js'
import { PREVIEW_TTL_SECONDS } from '../../services/PreviewService.js'
import { assertOwnsTemplate } from '../../middleware/requireOwnsTemplate.js'
import { objectIdSchema, variableValuesSchema } from '../schemas.js'
import { toolError, errorMessage } from './errors.js'

// The address users open the app at: a preview is a page of it.
function getAppUrl(): string {
  const url = process.env.PUBLIC_APP_URL
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error('PUBLIC_APP_URL must be set to an absolute http(s) URL')
  }
  return url.replace(/\/$/, '')
}

const inputSchema = {
  templateId: objectIdSchema.describe('_id of the template to preview'),
  variableValues: variableValuesSchema
    .optional()
    .describe(
      'Optional map of variable name → value for substitution. Accepts string, boolean, or a list of objects whose properties are strings, booleans or nested lists. An image variable, or an image property of a list item, takes a PNG or JPEG data URL (data:image/png;base64,…). A string variable, or a string property of a list item, may set a max length: a value with more characters fails, as an empty required list property does. A list variable, or a list property of a list item, may set a max number of items: a list with more fails too.'
    ),
}

const outputSchema = {
  previewUrl: z.string().describe('Page of the Imprime app showing the document, from which the user prints it'),
  expiresAt: z.string().describe('When the preview is deleted, ISO 8601'),
  pageCount: z.number().describe('How many pages the PDF has'),
}

export function registerPreviewTemplate(server: McpServer, ownerId: string): void {
  server.registerTool(
    'preview_template',
    {
      title: 'Preview a template with values',
      description:
        'Draw a template with a set of values, exactly as its PDF would be, and return the link to a page of the ' +
        `Imprime app that shows it — give it to the user: they open it signed in, and print the PDF from there. ` +
        `The preview lasts ${PREVIEW_TTL_SECONDS / 3600} hours and shows the template as it is when opened. ` +
        'A page can be left out by its condition, or repeated once per item of a list variable: warnings number ' +
        'the pages of the PDF, and a template left with no page fails.',
      inputSchema,
      outputSchema,
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ templateId, variableValues }) => {
      try {
        await assertOwnsTemplate(templateId, ownerId)
        const preview = await previewService.create(templateId, ownerId, variableValues ?? {})
        const previewUrl = `${getAppUrl()}${getPreviewPath(preview._id)}`

        const structured = {
          previewUrl,
          expiresAt: preview.expiresAt.toISOString(),
          pageCount: preview.pageCount,
        }

        // Content left out of the PDF, in the text: what a model reads.
        const warningText = preview.warnings.length > 0
          ? `\nWarning — not everything fits:\n${preview.warnings.map(warning => `- ${warning.message}`).join('\n')}`
          : ''

        return {
          content: [
            {
              type: 'text',
              text: `Preview ready, ${preview.pageCount} page${preview.pageCount > 1 ? 's' : ''}: ${previewUrl}\n` +
                `(Opens in Imprime for its owner, signed in, until ${structured.expiresAt}; the PDF is printed from there.)${warningText}`,
            },
            {
              type: 'resource_link',
              uri: previewUrl,
              name: 'Preview',
              mimeType: 'text/html',
              description: 'Imprime page showing the document, with a button to print its PDF',
            },
          ],
          structuredContent: structured,
        }
      } catch (err) {
        return toolError(`Preview failed: ${errorMessage(err)}`)
      }
    }
  )
}
