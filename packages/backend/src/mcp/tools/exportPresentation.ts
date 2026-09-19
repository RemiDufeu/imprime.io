import { z } from 'zod/v3'
import type { VariableItem, VariableValueType } from '@imprime/common'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { presentationService, exportService } from '../../services/index.js'
import { putPdf } from '../../services/pdfDownloadStore.js'
import { assertOwnsPresentation } from '../../middleware/requireOwnsPresentation.js'
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
  presentationId: z.string().describe('ID of the presentation to export'),
  variableValues: variableValuesSchema
    .optional()
    .describe(
      'Optional map of variable name → value for substitution. Accepts string, boolean, or a list of objects whose properties are strings, booleans or nested lists'
    ),
}

const outputSchema = {
  downloadUrl: z.string().describe('Single-use URL to download the exported PDF'),
  filename: z.string().describe('Suggested filename for the PDF'),
  expiresInSeconds: z.number().describe('Lifetime of the download URL'),
}

export function registerExportPresentation(server: McpServer, ownerId: string): void {
  server.registerTool(
    'export_presentation',
    {
      title: 'Export presentation to PDF',
      description:
        'Render a presentation as a PDF and return a single-use download URL valid for 10 minutes.',
      inputSchema,
      outputSchema,
    },
    // Widening variableValues pushes the same inference past the limit a second
    // time, now on the handler argument: without the annotation the params come
    // back as implicit `any`, with it the instantiation blows up. Same upstream
    // issue as the directive above. `@ts-expect-error` rather than `@ts-ignore`
    // so the recheck is the compiler's job: this fails the build the day the SDK
    // stops triggering it, instead of silently outliving its reason.
    // @ts-expect-error TS2589 — see comment above
    async ({
      presentationId,
      variableValues,
    }: {
      presentationId: string
      variableValues?: Record<string, VariableValueType>
    }) => {
      try {
        await assertOwnsPresentation(presentationId, ownerId)
        const presentation = await presentationService.getById(presentationId)
        const pdfBuffer = await exportService.exportToPDF(presentation, {
          variableValues: variableValues ?? {},
        })

        const filename = `${presentation.title || 'presentation'}.pdf`
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
