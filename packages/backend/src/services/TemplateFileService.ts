import { Types } from 'mongoose'
import type { PageRepeat, Shape, Template, TemplateFileDTO, VisibilityCondition } from '@imprime/common'
import {
  collectImageIds,
  isContainerShape,
  rebindVariables,
  TEMPLATE_FILE_FORMAT,
  TEMPLATE_FILE_VERSION,
} from '@imprime/common'
// The domain's zod mirror, which lives with the MCP tools: a file is checked
// with the same schemas as an agent's writes.
import { formatIssues, templateFileSchema } from '../mcp/schemas.js'
import type { TemplateService } from './TemplateService.js'
import type { PageService } from './PageService.js'
import type { VariableService } from './VariableService.js'
import type { ImageService } from './ImageService.js'
import { ValidationError } from './errors.js'

// `shapes` with each image id passed through `rebind`: a box whose image is
// not in the map is left empty.
function rebindImages(shapes: Shape[], rebind: Map<string, string>): Shape[] {
  return shapes.map(shape => {
    if (isContainerShape(shape)) return { ...shape, children: rebindImages(shape.children, rebind) }
    if (shape.type !== 'image' || shape.imageId === undefined) return shape
    return { ...shape, imageId: rebind.get(shape.imageId) }
  })
}

// A page's own binding, its variable passed through `rebind`.
function rebindBinding<T extends VisibilityCondition | PageRepeat>(
  binding: T | undefined,
  rebind: (variableId: string) => string
): T | undefined {
  if (!binding?.variableId) return binding
  return { ...binding, variableId: rebind(binding.variableId) }
}

/**
 * Templates as files: written out whole, images included, and read back as a
 * new template of the importer's.
 */
export class TemplateFileService {
  constructor(
    private templateService: TemplateService,
    private pageService: PageService,
    private variableService: VariableService,
    private imageService: ImageService,
  ) { }

  /** `ownerId` owns the template: only their images go into the file. */
  public async exportFile(id: string, ownerId: string): Promise<TemplateFileDTO.File> {
    const template = await this.templateService.getById(id)

    const imageIds = new Set(template.pages.flatMap(page => collectImageIds(page.shapes)))
    const images: Record<string, TemplateFileDTO.FileImage> = {}
    for (const imageId of imageIds) {
      try {
        const image = await this.imageService.getById(imageId, ownerId)
        images[imageId] = { data: image.data, mimeType: image.mimeType, originalName: image.originalName }
      } catch (error) {
        // Deleted since it was placed: the box imports empty, as it exports.
        console.error(`Image ${imageId} left out of the template file:`, error)
      }
    }

    return {
      format: TEMPLATE_FILE_FORMAT,
      version: TEMPLATE_FILE_VERSION,
      title: template.title,
      ...(template.code !== undefined ? { code: template.code } : {}),
      pageSize: template.pageSize,
      ...(template.pageNumbering ? { pageNumbering: template.pageNumbering } : {}),
      variables: template.variableData,
      pages: template.pages.map(page => ({
        shapes: page.shapes,
        ...(page.visibleWhen ? { visibleWhen: page.visibleWhen } : {}),
        ...(page.repeat ? { repeat: page.repeat } : {}),
        ...(page.hidePageNumber ? { hidePageNumber: true } : {}),
      })),
      images,
    }
  }

  /**
   * A new template of `ownerId`'s from a file, every part of it under a new
   * id: images, variables, pages. Each goes through its service's own checks;
   * one refused undoes the whole import. The file's code is the template's:
   * one another of the owner's templates has refuses the import (409).
   */
  public async importFile(input: unknown, ownerId: string): Promise<Template> {
    const parsed = templateFileSchema.safeParse(input)
    if (!parsed.success) {
      throw new ValidationError(
        `Not an Imprime template file of version ${TEMPLATE_FILE_VERSION}`,
        'INVALID_TEMPLATE_FILE',
        formatIssues(parsed.error)
      )
    }
    const file = parsed.data

    // Refused, before anything is written, when the code is taken.
    const template = await this.templateService.create(
      { title: file.title, pageSize: file.pageSize, code: file.code },
      ownerId
    )
    const uploadedImageIds: string[] = []
    try {
      const imageIds = new Map<string, string>()
      for (const [fileId, image] of Object.entries(file.images)) {
        const uploaded = await this.imageService.upload(image, ownerId)
        uploadedImageIds.push(uploaded._id)
        imageIds.set(fileId, uploaded._id)
      }

      // Created under the ids the pages are rebound to. A reference to a
      // variable the file does not declare is kept, and refused by the page.
      const variableIds = new Map(file.variables.map(variable => [variable._id, new Types.ObjectId().toString()]))
      const rebindVariable = (variableId: string) => variableIds.get(variableId) ?? variableId
      for (const { _id, ...variable } of file.variables) {
        await this.variableService.create(template._id, { ...variable, _id: rebindVariable(_id) })
      }

      if (file.pageNumbering) {
        const box = rebindVariables(file.pageNumbering.box, rebindVariable, () => '')
        // Rebinding keeps a shape's type: the check only tells the compiler.
        if (box.type === 'text') {
          await this.templateService.update(template._id, { pageNumbering: { ...file.pageNumbering, box } })
        }
      }

      // The template's blank page takes the first page's place.
      for (const [index, filePage] of file.pages.entries()) {
        const bindings = {
          visibleWhen: rebindBinding(filePage.visibleWhen, rebindVariable),
          repeat: rebindBinding(filePage.repeat, rebindVariable),
          ...(filePage.hidePageNumber ? { hidePageNumber: true } : {}),
        }
        let pageId: string
        if (index === 0) {
          pageId = template.pages[0]._id
          if (bindings.visibleWhen || bindings.repeat || bindings.hidePageNumber) {
            await this.pageService.update(template._id, ownerId, pageId, bindings)
          }
        } else {
          pageId = (await this.pageService.create(template._id, ownerId, bindings))._id
        }

        const shapes = rebindImages(filePage.shapes, imageIds)
          .map(shape => rebindVariables(shape, rebindVariable, () => ''))
        // The agents' write path: ids filled, groups laid out, duplicates
        // and unknown images refused.
        await this.pageService.editShapes(template._id, ownerId, pageId, () => shapes)
      }
    } catch (error) {
      await this.discard(template._id, uploadedImageIds, ownerId)
      throw error
    }

    return await this.templateService.getById(template._id)
  }

  // What a failed import wrote: the template, and the images uploaded for it
  // — those its pages do not show yet included.
  private async discard(templateId: string, imageIds: string[], ownerId: string): Promise<void> {
    try {
      await this.templateService.delete(templateId)
      if (imageIds.length) await this.imageService.deleteUnused(imageIds, ownerId)
    } catch (error) {
      console.error('Failed to clean up after a failed import:', error)
    }
  }
}
