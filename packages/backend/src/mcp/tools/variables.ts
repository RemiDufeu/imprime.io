import { z } from 'zod/v3'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { variableService } from '../../services/index.js'
import { assertOwnsTemplate } from '../../middleware/requireOwnsTemplate.js'
import { objectIdSchema, variableItemFieldSchema, variableTypeField, variableValueSchema } from '../schemas.js'
import { toolError, errorMessage, textResult } from './errors.js'

const templateIdField = objectIdSchema.describe('_id of the template')
const nameField = z.string().min(1)
  .describe('Unique within the template: the key its value is given under at export')
const limitField = z.number().int().positive()

const defaultDescription =
  'Value drawn when an export gives none: a string, a boolean, a PNG or JPEG data URL for an image, or a list of ' +
  'objects for an object-list'
const requiredDescription = 'Every export must give a value; the default does not stand in for it'
const maxLengthDescription = 'string only: most characters a value may have; a longer one fails the export'
const maxItemsDescription = 'object-list only: most items a value may have; a longer list fails the export'
const itemFieldsDescription =
  'object-list only: the properties of each item, which repeats and runs read through itemPath'

export function registerVariableTools(server: McpServer, ownerId: string): void {
  server.registerTool(
    'create_variable',
    {
      title: 'Create a variable',
      description:
        'Declare a variable on a template, and return it with its _id — which shapes, conditions and repeats refer ' +
        'to. Values are given by name at export.',
      inputSchema: {
        templateId: templateIdField,
        name: nameField,
        type: variableTypeField,
        default: variableValueSchema.optional().describe(defaultDescription),
        required: z.boolean().optional().describe(requiredDescription),
        maxLength: limitField.optional().describe(maxLengthDescription),
        maxItems: limitField.optional().describe(maxItemsDescription),
        itemFields: z.array(variableItemFieldSchema).optional().describe(itemFieldsDescription),
      },
      outputSchema: {
        variableId: z.string().describe('_id of the new variable, which shapes refer to'),
        name: z.string().describe('Its name, which values are given under at export'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ templateId, ...data }) => {
      try {
        await assertOwnsTemplate(templateId, ownerId)
        const variables = await variableService.create(templateId, data)
        const created = variables.find(variable => variable.name === data.name)
        if (!created) return toolError('Failed to create the variable: it was not found once saved')
        return {
          ...textResult(`Variable created:\n${JSON.stringify(created, null, 2)}`),
          structuredContent: { variableId: created._id, name: created.name },
        }
      } catch (err) {
        return toolError(`Failed to create the variable: ${errorMessage(err)}`)
      }
    }
  )

  server.registerTool(
    'update_variable',
    {
      title: 'Update a variable',
      description:
        'Change a variable\'s declaration. A field left out is kept; changing the type drops the default unless ' +
        'one is given. Shapes refer to it by _id, so renaming it breaks none of them.',
      inputSchema: {
        templateId: templateIdField,
        variableId: objectIdSchema.describe('_id of the variable'),
        name: nameField.optional(),
        type: variableTypeField.optional(),
        default: variableValueSchema.nullable().optional().describe(`${defaultDescription}. null removes it`),
        required: z.boolean().optional().describe(requiredDescription),
        maxLength: limitField.nullable().optional().describe(`${maxLengthDescription}. null removes it`),
        maxItems: limitField.nullable().optional().describe(`${maxItemsDescription}. null removes it`),
        itemFields: z.array(variableItemFieldSchema).optional()
          .describe(`${itemFieldsDescription}. Replaces them all; [] declares none`),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ templateId, variableId, ...data }) => {
      try {
        await assertOwnsTemplate(templateId, ownerId)
        const variables = await variableService.update(templateId, variableId, data)
        const updated = variables.find(variable => variable._id === variableId)
        return textResult(`Variable updated:\n${JSON.stringify(updated, null, 2)}`)
      } catch (err) {
        return toolError(`Failed to update the variable: ${errorMessage(err)}`)
      }
    }
  )

  server.registerTool(
    'delete_variable',
    {
      title: 'Delete a variable',
      description: 'Delete a variable no shape, condition or repeat refers to any more.',
      inputSchema: {
        templateId: templateIdField,
        variableId: objectIdSchema.describe('_id of the variable'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ templateId, variableId }) => {
      try {
        await assertOwnsTemplate(templateId, ownerId)
        await variableService.delete(templateId, variableId)
        return textResult(`Variable ${variableId} deleted.`)
      } catch (err) {
        return toolError(`Failed to delete the variable: ${errorMessage(err)}`)
      }
    }
  )
}
