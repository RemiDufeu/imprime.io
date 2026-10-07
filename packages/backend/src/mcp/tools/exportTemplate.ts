import { z } from 'zod/v3'
import type { VariableItem, VariableValueType } from '@imprime/common'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { templateService, exportService } from '../../services/index.js'
import { putPdf } from '../../services/pdfDownloadStore.js'
import { assertOwnsTemplate } from '../../middleware/requireOwnsTemplate.js'
import { toolError, errorMessage } from './errors.js'

const DOWNLOAD_TTL_SECONDS = 600

function getApiBaseUrl(): string {
  const url = process.env.PUBLIC_APP_URL
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error('PUBLIC_APP_URL must be set to an absolute http(s) URL')
  }
  return url.replace(/\/$/, '')
}

// Hand-written mirror of VariableValueType from @imprime/common: `common` has
// no zod dependency to generate it from, so a change to that union has to be
// repeated here — nothing makes the compiler ask for it. Annotating against the
// domain type is the closest thing to a guard: a drift shows up as an assignment
// error on this line.
const variableItemSchema: z.ZodType<VariableItem> = z.lazy(() =>
  z.record(z.union([z.string(), z.boolean(), z.array(variableItemSchema)]))
)

// Annotated flat so registerTool's generic inference never unfolds the
// recursion above — left inline it compounds the TS2589 noted below.
const variableValuesSchema: z.ZodType<Record<string, VariableValueType>> = z.record(
  z.union([z.string(), z.boolean(), z.array(variableItemSchema)])
)

const inputSchema = {
  templateId: z.string().describe('ID of the template to export'),
  variableValues: variableValuesSchema
    .optional()
    .describe(
      'Optional map of variable name → value for substitution. Accepts string, boolean, or a list of objects whose properties are strings, booleans or nested lists. An image variable, or an image property of a list item, takes a PNG or JPEG data URL (data:image/png;base64,…)'
    ),
}

const outputSchema = {
  downloadUrl: z.string().describe('Single-use URL to download the exported PDF'),
  filename: z.string().describe('Suggested filename for the PDF'),
  expiresInSeconds: z.number().describe('Lifetime of the download URL'),
}

export function registerExportTemplate(server: McpServer, ownerId: string): void {
  // Known regression in @modelcontextprotocol/sdk ≥1.23 (Zod v4 support):
  // registerTool's generic inference triggers TS2589 when both inputSchema
  // and outputSchema are provided. Recheck this directive after SDK upgrades.
  // https://github.com/modelcontextprotocol/typescript-sdk/issues/1180
  server.registerTool(
    'export_template',
    {
      title: 'Export template to PDF',
      description:
        'Render a template as a PDF and return a single-use download URL valid for 10 minutes.',
      inputSchema,
      outputSchema,
    },
    // TS reports the error on the handler, not on the call — keep the directive here.
    // @ts-expect-error TS2589 — see comment above
    async ({
      templateId,
      variableValues,
    }: {
      templateId: string
      variableValues?: Record<string, VariableValueType>
    }) => {
      try {
        await assertOwnsTemplate(templateId, ownerId)
        const template = await templateService.getById(templateId)
        const pdfBuffer = await exportService.exportToPDF(template, ownerId, {
          variableValues: variableValues ?? {},
        })

        const filename = `${template.title || 'template'}.pdf`
        const token = putPdf(pdfBuffer, filename)
        const downloadUrl = `${getApiBaseUrl()}/api/export/download/${token}`

        const structured = {
          downloadUrl,
          filename,
          expiresInSeconds: DOWNLOAD_TTL_SECONDS,
        }

        return {
          content: [
            {
              type: 'text',
              text: `PDF ready: ${downloadUrl}\n(Single-use link, valid ${DOWNLOAD_TTL_SECONDS / 60} minutes.)`,
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
