import { z } from 'zod/v3'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { templateService, exportService } from '../../services/index.js'
import { putPdf } from '../../services/pdfDownloadStore.js'
import { assertOwnsTemplate } from '../../middleware/requireOwnsTemplate.js'
import { objectIdSchema, variableValuesSchema } from '../schemas.js'
import { toolError, errorMessage } from './errors.js'

const DOWNLOAD_TTL_SECONDS = 600

function getApiBaseUrl(): string {
  const url = process.env.PUBLIC_APP_URL
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error('PUBLIC_APP_URL must be set to an absolute http(s) URL')
  }
  return url.replace(/\/$/, '')
}

const inputSchema = {
  templateId: objectIdSchema.describe('_id of the template to export'),
  variableValues: variableValuesSchema
    .optional()
    .describe(
      'Optional map of variable name → value for substitution. Accepts string, boolean, or a list of objects whose properties are strings, booleans or nested lists. An image variable, or an image property of a list item, takes a PNG or JPEG data URL (data:image/png;base64,…). A string variable, or a string property of a list item, may set a max length: a value with more characters fails the export, as an empty required list property does. A list variable, or a list property of a list item, may set a max number of items: a list with more fails the export too.'
    ),
}

const outputSchema = {
  downloadUrl: z.string().describe('Single-use URL to download the exported PDF'),
  filename: z.string().describe('Suggested filename for the PDF'),
  expiresInSeconds: z.number().describe('Lifetime of the download URL'),
}

export function registerExportTemplate(server: McpServer, ownerId: string): void {
  server.registerTool(
    'export_template',
    {
      title: 'Export template to PDF',
      description:
        'Render a template as a PDF and return a single-use download URL valid for 10 minutes. ' +
        'A page can be left out by its condition, or repeated once per item of a list variable: ' +
        'warnings number the pages of the PDF, and a template left with no page fails.',
      inputSchema,
      outputSchema,
    },
    async ({ templateId, variableValues }) => {
      try {
        await assertOwnsTemplate(templateId, ownerId)
        const template = await templateService.getById(templateId)
        const { pdf, warnings } = await exportService.exportToPDF(template, ownerId, {
          variableValues: variableValues ?? {},
        })

        const filename = `${template.title || 'template'}.pdf`
        const token = putPdf(pdf, filename)
        const downloadUrl = `${getApiBaseUrl()}/api/export/download/${token}`

        const structured = {
          downloadUrl,
          filename,
          expiresInSeconds: DOWNLOAD_TTL_SECONDS,
        }

        // Content left out of the PDF, in the text: what a model reads.
        const warningText = warnings.length > 0
          ? `\nWarning — not everything fits:\n${warnings.map(warning => `- ${warning.message}`).join('\n')}`
          : ''

        return {
          content: [
            {
              type: 'text',
              text: `PDF ready: ${downloadUrl}\n(Single-use link, valid ${DOWNLOAD_TTL_SECONDS / 60} minutes.)${warningText}`,
            },
            {
              type: 'resource_link',
              uri: downloadUrl,
              name: filename,
              mimeType: 'application/pdf',
              description: `Exported PDF for "${template.title || templateId}"`,
            },
          ],
          structuredContent: structured,
        }
      } catch (err) {
        return toolError(`Export failed: ${errorMessage(err)}`)
      }
    }
  )
}
