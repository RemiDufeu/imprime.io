import { z } from 'zod/v3'
import type { Shape } from '@imprime/common'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { pageService } from '../../services/index.js'
import { withShapeIds } from '../../services/PageService.js'
import { ValidationError } from '../../services/errors.js'
import { assertOwnsTemplate } from '../../middleware/requireOwnsTemplate.js'
import { formatIssues, isRemovableShapeField, objectIdSchema, shapeSchema } from '../schemas.js'
import { findShape, getShape, insertShapes, outlineShapes, removeShapes, replaceShape } from '../shapeTree.js'
import { toolError, errorMessage, textResult } from './errors.js'

const templateIdField = objectIdSchema.describe('_id of the template')
const pageIdField = objectIdSchema.describe('_id of the page')
const shapeListField = z.array(shapeSchema)

// The fields of `current` the patch sets, without those it nulls, checked as a
// whole: a patch is valid when the shape it leaves is.
function patchShape(current: Shape, patch: Record<string, unknown>): Shape {
  for (const key of ['id', 'type'] as const) {
    if (key in patch && patch[key] !== current[key]) {
      throw new ValidationError(`A shape's ${key} cannot change: delete it and add another`, 'SHAPE_KEY_FIXED')
    }
  }
  const fixed = Object.keys(patch).filter(key => patch[key] === null && !isRemovableShapeField(current.type, key))
  if (fixed.length) {
    throw new ValidationError('These fields can be changed, not removed', 'INVALID_SHAPE', fixed)
  }
  // Built from entries, so that a key such as "__proto__" is an own field
  // the schema refuses rather than the object's prototype.
  const merged = new Map<string, unknown>(Object.entries(current))
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) merged.delete(key)
    else merged.set(key, value)
  }
  const parsed = shapeSchema.safeParse(Object.fromEntries(merged))
  if (!parsed.success) {
    throw new ValidationError('The patch leaves an invalid shape', 'INVALID_SHAPE', formatIssues(parsed.error))
  }
  return parsed.data
}

// The shapes `ids` name in `tree`, as written.
function pickShapes(tree: Shape[], ids: string[]): Shape[] {
  return ids.flatMap(id => findShape(tree, id) ?? [])
}

export function registerShapeTools(server: McpServer, ownerId: string): void {
  server.registerTool(
    'set_page_shapes',
    {
      title: 'Set a page\'s shapes',
      description:
        'Replace every shape of a page with this tree — to draw a page in one call, or write back a page read with ' +
        'get_template. Groups with a layout are laid out as the editor does. Returns the outline of the page: each ' +
        'shape\'s id, type and box.',
      inputSchema: {
        templateId: templateIdField,
        pageId: pageIdField,
        shapes: shapeListField.describe('The page\'s shapes, back to front'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ templateId, pageId, shapes }) => {
      try {
        await assertOwnsTemplate(templateId, ownerId)
        const written = await pageService.editShapes(templateId, ownerId, pageId, () => shapes)
        return textResult(written.length ? `Page ${pageId}:\n${outlineShapes(written)}` : `Page ${pageId} is empty.`)
      } catch (err) {
        return toolError(`Failed to set the shapes: ${errorMessage(err)}`)
      }
    }
  )

  server.registerTool(
    'add_shapes',
    {
      title: 'Add shapes',
      description:
        'Add shapes to a page, or inside one of its groups, keeping those already there. Returns the outline of the ' +
        'shapes added, with their ids.',
      inputSchema: {
        templateId: templateIdField,
        pageId: pageIdField,
        shapes: shapeListField.min(1).describe('The shapes to add, back to front'),
        parentId: z.string().min(1).optional()
          .describe('id of the group to add them in, positioned relative to it. Unset is the page itself'),
        index: z.number().int().nonnegative().optional()
          .describe('0-based place among the parent\'s children, which sets their stacking. Unset is in front'),
      },
      outputSchema: {
        shapeIds: z.array(z.string()).describe('ids of the shapes added, in order (not those of their children)'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ templateId, pageId, shapes, parentId, index }) => {
      try {
        await assertOwnsTemplate(templateId, ownerId)
        // Ids given here rather than by the service, to find the shapes again.
        const added = withShapeIds(shapes)
        const shapeIds = added.map(shape => shape.id)
        const written = await pageService.editShapes(templateId, ownerId, pageId,
          current => insertShapes(current, parentId ?? null, added, index))
        return {
          ...textResult(`Added:\n${outlineShapes(pickShapes(written, shapeIds))}`),
          structuredContent: { shapeIds },
        }
      } catch (err) {
        return toolError(`Failed to add the shapes: ${errorMessage(err)}`)
      }
    }
  )

  server.registerTool(
    'update_shape',
    {
      title: 'Update a shape',
      description:
        'Change some fields of one shape, anywhere in a page\'s tree; the others are kept. The patch takes the ' +
        'fields of set_page_shapes\' shapes — a group\'s children replaced whole, a text\'s paragraphes too. ' +
        'Returns the outline of the shape.',
      inputSchema: {
        templateId: templateIdField,
        pageId: pageIdField,
        shapeId: z.string().min(1).describe('id of the shape'),
        patch: z.record(z.unknown())
          .describe('Fields to set, as in a shape of set_page_shapes; null removes an optional field ' +
            '(a required one, such as a group\'s children, can only be set). Its id and type cannot change'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async ({ templateId, pageId, shapeId, patch }) => {
      try {
        await assertOwnsTemplate(templateId, ownerId)
        const written = await pageService.editShapes(templateId, ownerId, pageId,
          current => replaceShape(current, shapeId, patchShape(getShape(current, shapeId), patch)))
        return textResult(outlineShapes(pickShapes(written, [shapeId])))
      } catch (err) {
        return toolError(`Failed to update the shape: ${errorMessage(err)}`)
      }
    }
  )

  server.registerTool(
    'delete_shapes',
    {
      title: 'Delete shapes',
      description: 'Delete shapes from a page, anywhere in its tree; a group goes with its children.',
      inputSchema: {
        templateId: templateIdField,
        pageId: pageIdField,
        shapeIds: z.array(z.string().min(1)).min(1).describe('ids of the shapes'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    async ({ templateId, pageId, shapeIds }) => {
      try {
        await assertOwnsTemplate(templateId, ownerId)
        const written = await pageService.editShapes(templateId, ownerId, pageId,
          current => removeShapes(current, shapeIds))
        return textResult(`Deleted ${shapeIds.length} shape(s). Page ${pageId}:\n${outlineShapes(written) || '(empty)'}`)
      } catch (err) {
        return toolError(`Failed to delete the shapes: ${errorMessage(err)}`)
      }
    }
  )
}
