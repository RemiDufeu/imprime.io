import { z } from 'zod/v3'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { presentationService, exportService } from '../../services/index.js'
import { putPdf } from '../../services/pdfDownloadStore.js'
import { toolError, errorMessage } from './errors.js'

const DOWNLOAD_TTL_SECONDS = 600

function getApiBaseUrl(): string {
  const url = process.env.VITE_API_URL
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error(
      'VITE_API_URL must be set to an absolute http(s) URL (e.g. https://imrime.io/api) to enable MCP PDF downloads'
    )
  }
  return url.replace(/\/$/, '')
}

const inputSchema = {
  presentationId: z.string().describe('ID of the presentation to export'),
  variableValues: z
    .record(z.string())
    .optional()
    .describe('Optional map of variable id → value for substitution'),
}

const outputSchema = {
  downloadUrl: z.string().describe('Single-use URL to download the exported PDF'),
  filename: z.string().describe('Suggested filename for the PDF'),
  expiresInSeconds: z.number().describe('Lifetime of the download URL'),
}

export function registerExportPresentation(server: McpServer): void {
  // Known regression in @modelcontextprotocol/sdk ≥1.23 (Zod v4 support):
  // registerTool's generic inference triggers TS2589 when both inputSchema
  // and outputSchema are provided. Recheck this directive after SDK upgrades.
  // https://github.com/modelcontextprotocol/typescript-sdk/issues/1180
  // @ts-ignore TS2589 — see comment above
  server.registerTool(
    'export_presentation',
    {
      title: 'Export presentation to PDF',
      description:
        'Render a presentation as a PDF and return a single-use download URL valid for 10 minutes.',
      inputSchema,
      outputSchema,
    },
    async ({ presentationId, variableValues }) => {
      try {
        const presentation = await presentationService.getById(presentationId)
        const pdfBuffer = await exportService.exportToPDF(presentation, {
          variableValues: variableValues ?? {},
        })

        const filename = `${presentation.title || 'presentation'}.pdf`
        const token = putPdf(pdfBuffer, filename)
        const downloadUrl = `${getApiBaseUrl()}/export/download/${token}`

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
              description: `Exported PDF for "${presentation.title || presentationId}"`,
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
