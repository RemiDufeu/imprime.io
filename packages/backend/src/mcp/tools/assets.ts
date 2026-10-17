import { z } from 'zod/v3'
import { createFontCatalog, splitDataUrl } from '@imprime/common'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { fontService, imageService } from '../../services/index.js'
import { objectIdSchema } from '../schemas.js'
import { toolError, errorMessage, textResult } from './errors.js'

export function registerAssetTools(server: McpServer, ownerId: string): void {
  server.registerTool(
    'list_fonts',
    {
      title: 'List fonts',
      description:
        'List the font families a text run can use, by the name its fontFamily takes, with the faces each one ' +
        'has: a run asking for bold or italic in a family without that face is drawn with its closest one.',
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const catalog = createFontCatalog(await fontService.list())
        const lines = [...catalog.values()].map(entry =>
          `- ${entry.family}${entry.category ? ` (${entry.category})` : ' (imported)'}: ${entry.variants.join(', ')}`
        )
        return textResult(lines.join('\n'))
      } catch (err) {
        return toolError(`Failed to list the fonts: ${errorMessage(err)}`)
      }
    }
  )

  server.registerTool(
    'upload_image',
    {
      title: 'Upload an image',
      description:
        'Store a PNG or JPEG image, and return its _id and size in pixels: an image shape shows it through ' +
        'imageId. An image that changes from one export to the next is an image variable instead.',
      inputSchema: {
        dataUrl: z.string().regex(/^data:image\/(png|jpeg);base64,/, 'A PNG or JPEG data URL')
          .describe('The image as a data URL: data:image/png;base64,… or data:image/jpeg;base64,…'),
        name: z.string().min(1).optional().describe('File name, kept for reference'),
      },
      outputSchema: {
        imageId: z.string().describe('_id of the image, for an image shape\'s imageId'),
        width: z.number().describe('Width in pixels'),
        height: z.number().describe('Height in pixels'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ dataUrl, name }) => {
      try {
        const split = splitDataUrl(dataUrl)
        if (!split) return toolError('Failed to upload the image: not a data URL')
        const image = await imageService.upload({ data: dataUrl, mimeType: split.mimeType, originalName: name }, ownerId)
        return {
          ...textResult(`Image ${image._id} stored: ${image.width} × ${image.height} px, ${image.mimeType}.`),
          structuredContent: { imageId: image._id, width: image.width, height: image.height },
        }
      } catch (err) {
        return toolError(`Failed to upload the image: ${errorMessage(err)}`)
      }
    }
  )

  server.registerTool(
    'get_image',
    {
      title: 'Get an image\'s size',
      description:
        'The natural size of one of your uploaded images — an image shape\'s imageId — and its type: what an image ' +
        'box needs to keep the image\'s proportions. Not its data.',
      inputSchema: { imageId: objectIdSchema.describe('_id of the image') },
      outputSchema: {
        imageId: z.string(),
        width: z.number().describe('Width in pixels'),
        height: z.number().describe('Height in pixels'),
        mimeType: z.string(),
        size: z.number().describe('Size in bytes'),
        name: z.string().optional().describe('File name it was uploaded with'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ imageId }) => {
      try {
        // Someone else's image is not found, as one that does not exist.
        const image = await imageService.getById(imageId, ownerId)
        const info = {
          imageId: image._id,
          width: image.width,
          height: image.height,
          mimeType: image.mimeType,
          size: image.size,
          ...(image.originalName ? { name: image.originalName } : {}),
        }
        return {
          ...textResult(`Image ${image._id}: ${image.width}×${image.height} px, ${image.mimeType}.`),
          structuredContent: info,
        }
      } catch (err) {
        return toolError(`Failed to read the image: ${errorMessage(err)}`)
      }
    }
  )
}
