import { TemplateModel } from '../models/Template.js'
import { PageModel, collectImageIds } from '../models/Page.js'
import { VariableDataModel } from '../models/VariableData.js'
import { isObjectIdString, pageCreateToModel, pageToDTO, pageUpdateToModel, toObjectId } from '../models/mappers.js'
import type { Shape, Page, PageDTO } from '@imprime/common'
import { isContainerShape } from '@imprime/common'
import type { Types } from 'mongoose'
import type { ImageService } from './ImageService.js'
import { touchTemplate } from './TemplateService.js'
import { ConflictError, NotFoundError, ValidationError } from './errors.js'

const pageIdTaken = () => new ConflictError('Page id already in use', 'PAGE_ID_TAKEN')

function isDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000
}

export class PageService {
  constructor(private imageService: ImageService) { }

  // `ownerId` owns the template (the route checked it): the images its
  // shapes keep or release are that user's only.
  async create(templateId: string, ownerId: string, data: PageDTO.Create = {}): Promise<Page> {
    const template = await TemplateModel.findById(templateId).select('_id')
    if (!template) {
      throw new NotFoundError('Template not found', 'TEMPLATE_NOT_FOUND')
    }
    if (data.order !== undefined && !Number.isInteger(data.order)) {
      throw new ValidationError('order must be an integer')
    }
    if (data.shapes !== undefined && !Array.isArray(data.shapes)) {
      throw new ValidationError('shapes must be an array')
    }
    if (data._id !== undefined) {
      if (!isObjectIdString(data._id)) {
        throw new ValidationError('Invalid page id', 'INVALID_PAGE_ID')
      }
      if (await PageModel.exists({ _id: toObjectId(data._id) })) {
        throw pageIdTaken()
      }
    }

    const shapes = data.shapes ?? []
    await this.assertVariableReferences(template._id, shapes)

    const siblings = await PageModel.find({ templateId: template._id })
      .sort({ order: 1 })
      .select('_id order')
    const position = Math.max(0, Math.min(data.order ?? siblings.length, siblings.length))

    const page = await PageModel.create({
      ...pageCreateToModel(template._id, position, shapes),
      ...(data._id !== undefined ? { _id: toObjectId(data._id) } : {}),
    }).catch((err: unknown) => {
      // The id was free a moment ago: a concurrent restore took it.
      throw isDuplicateKey(err) ? pageIdTaken() : err
    })

    // Dense orders, with a gap at `position` for the new page. Rewriting them
    // all also repairs the duplicates a count-based order used to leave behind
    // after a deletion.
    const renumbered = siblings
      .map((sibling, index) => ({ sibling, order: index < position ? index : index + 1 }))
      .filter(({ sibling, order }) => sibling.order !== order)
    if (renumbered.length) {
      await PageModel.bulkWrite(renumbered.map(({ sibling, order }) => ({
        updateOne: { filter: { _id: sibling._id }, update: { order } },
      })))
    }

    try {
      await this.imageService.markReferenced(collectImageIds(shapes), ownerId)
    } catch (error) {
      console.error('Failed to keep the images of a restored page:', error)
    }

    await touchTemplate(template._id)
    return pageToDTO(page)
  }

  async updateShapes(
    templateId: string,
    ownerId: string,
    pageId: string,
    data: PageDTO.Update
  ): Promise<void> {
    const page = await PageModel.findOne({
      _id: toObjectId(pageId),
      templateId: toObjectId(templateId),
    })
    if (!page) {
      throw new NotFoundError('Page not found', 'PAGE_NOT_FOUND')
    }

    await this.assertVariableReferences(page.templateId, data.shapes)

    const previousImageIds = collectImageIds(page.shapes)
    Object.assign(page, pageUpdateToModel(data))
    await page.save()
    await touchTemplate(page.templateId)

    // After the save, so this page no longer counts as showing what it
    // dropped. Released, not deleted: the editor can undo the removal.
    const imageIds = collectImageIds(data.shapes)
    const kept = new Set(imageIds)
    try {
      await this.imageService.release(previousImageIds.filter(id => !kept.has(id)), ownerId)
      await this.imageService.markReferenced(imageIds, ownerId)
    } catch (error) {
      console.error('Failed to update image references:', error)
    }
  }

  async delete(templateId: string, ownerId: string, pageId: string): Promise<void> {
    const page = await PageModel.findOne({
      _id: toObjectId(pageId),
      templateId: toObjectId(templateId),
    })
    if (!page) {
      throw new NotFoundError('Page not found', 'PAGE_NOT_FOUND')
    }

    await page.deleteOne()
    await touchTemplate(page.templateId)

    // Released rather than deleted, so restoring the page shows them again.
    try {
      await this.imageService.release(collectImageIds(page.shapes), ownerId)
    } catch (error) {
      console.error('Failed to release the images of a deleted page:', error)
    }
  }

  /**
   * Fills `imageIds` on pages saved before the field existed, which image
   * reference checks would otherwise miss. Run at startup; a no-op once every
   * page has it.
   */
  async indexImageReferences(): Promise<number> {
    const pages = await PageModel.find({ imageIds: { $exists: false } }).select('shapes')
    if (pages.length === 0) return 0
    await PageModel.bulkWrite(pages.map(page => ({
      updateOne: {
        filter: { _id: page._id },
        update: { $set: { imageIds: [...new Set(collectImageIds(page.shapes))] } },
      },
    })))
    return pages.length
  }

  private async assertVariableReferences(templateId: Types.ObjectId, shapes: Shape[]): Promise<void> {
    if (shapes.length === 0) return
    const variables = await VariableDataModel.find({ templateId }).select('_id')
    const validVariableIds = new Set(variables.map(v => v._id.toString()))

    const errors = this.validateVariableReferences(shapes, validVariableIds)
    if (errors.length) {
      throw new ValidationError('Invalid variable references', undefined, errors)
    }
  }

  private validateVariableReferences(shapes: Shape[], validVariableIds: Set<string>): string[] {
    const errors: string[] = []
    shapes.forEach((shape, shapeIndex) => {
      if (shape.type === 'text') {
        shape.paragraphes?.forEach((paragraph, paraIndex) => {
          paragraph.children?.forEach((child, childIndex) => {
            if ('type' in child && child.type === 'variable') {
              if (!validVariableIds.has(child.variableId)) {
                errors.push(
                  `Invalid variable reference in shape ${shapeIndex}, paragraph ${paraIndex}, child ${childIndex}: ` +
                  `variableId "${child.variableId}" does not exist in this template`
                )
              }
            }
          })
        })
      } else if (isContainerShape(shape)) {
        errors.push(...this.validateVariableReferences(shape.children, validVariableIds))
      }
    })
    return errors
  }
}
