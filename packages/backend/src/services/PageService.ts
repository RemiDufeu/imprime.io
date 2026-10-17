import { TemplateModel } from '../models/Template.js'
import { PageModel } from '../models/Page.js'
import { VariableDataModel } from '../models/VariableData.js'
import { isObjectIdString, pageCreateToModel, pageToDTO, pageUpdateToModel, toObjectId } from '../models/mappers.js'
import type { Shape, Page, PageDTO, PageRepeat, VisibilityCondition } from '@imprime/common'
import { collectImageIds, isContainerShape } from '@imprime/common'
import type { Types } from 'mongoose'
import type { ImageService } from './ImageService.js'
import { touchTemplate } from './TemplateService.js'
import { ConflictError, NotFoundError, ValidationError } from './errors.js'

const pageIdTaken = () => new ConflictError('Page id already in use', 'PAGE_ID_TAKEN')

function isDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000
}

// What a page's condition and repeat point at, as a request may set them.
// null, from an update, removes one: it points at nothing.
interface PageReferences {
  shapes?: Shape[]
  visibleWhen?: VisibilityCondition | null
  repeat?: PageRepeat | null
}

const isOptionalOf = (value: unknown, type: 'string' | 'boolean') => value === undefined || typeof value === type

// The mapper copies only the declared fields of a condition and a repeat; each
// must also have its declared type. The body is typed, not checked: hence the
// `typeof` on values the compiler believes are objects.
function assertPageBindings(data: PageReferences): void {
  const { visibleWhen, repeat } = data
  if (visibleWhen !== undefined && visibleWhen !== null && (
    typeof visibleWhen !== 'object'
    || Array.isArray(visibleWhen)
    || !isOptionalOf(visibleWhen.variableId, 'string')
    || !isOptionalOf(visibleWhen.itemPath, 'string')
    || !isOptionalOf(visibleWhen.negate, 'boolean')
  )) {
    throw new ValidationError(
      'visibleWhen must be an object with an optional variableId, itemPath and negate',
      'INVALID_PAGE_CONDITION'
    )
  }
  if (repeat !== undefined && repeat !== null && (
    typeof repeat !== 'object' || Array.isArray(repeat) || !isOptionalOf(repeat.variableId, 'string')
  )) {
    throw new ValidationError('repeat must be an object with an optional variableId', 'INVALID_PAGE_REPEAT')
  }
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
    assertPageBindings(data)
    if (data._id !== undefined) {
      if (!isObjectIdString(data._id)) {
        throw new ValidationError('Invalid page id', 'INVALID_PAGE_ID')
      }
      if (await PageModel.exists({ _id: toObjectId(data._id) })) {
        throw pageIdTaken()
      }
    }

    const shapes = data.shapes ?? []
    await this.assertVariableReferences(template._id, data)

    const siblings = await PageModel.find({ templateId: template._id })
      .sort({ order: 1 })
      .select('_id order')
    const position = Math.max(0, Math.min(data.order ?? siblings.length, siblings.length))

    const page = await PageModel.create({
      ...pageCreateToModel(template._id, position, data),
      ...(data._id !== undefined ? { _id: toObjectId(data._id) } : {}),
    }).catch((err: unknown) => {
      // The id was free a moment ago: a concurrent restore took it.
      throw isDuplicateKey(err) ? pageIdTaken() : err
    })

    // Dense orders, with a gap at `position` for the new page.
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

  // Each field present replaces the page's; the others are left alone, so a
  // write of the shapes and one of the condition do not undo each other.
  async update(
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
    if (data.shapes !== undefined && !Array.isArray(data.shapes)) {
      throw new ValidationError('shapes must be an array')
    }
    assertPageBindings(data)

    await this.assertVariableReferences(page.templateId, data)

    const previousImageIds = data.shapes !== undefined ? collectImageIds(page.shapes) : []
    Object.assign(page, pageUpdateToModel(data))
    await page.save()
    await touchTemplate(page.templateId)

    if (data.shapes === undefined) return

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

  // That each referenced variable exists, not that it has the type its use
  // needs — as for shapes: a variable's type can change after the write, which
  // the editor warns about (`ReferenceImpactWarning`), and a mismatch fails
  // closed at export (no copy, the page left out).
  private async assertVariableReferences(templateId: Types.ObjectId, page: PageReferences): Promise<void> {
    const shapes = page.shapes ?? []
    if (shapes.length === 0 && !page.visibleWhen?.variableId && !page.repeat?.variableId) return
    const variables = await VariableDataModel.find({ templateId }).select('_id')
    const validVariableIds = new Set(variables.map(v => v._id.toString()))

    const errors: string[] = []
    const checkPageBinding = (field: string, variableId: string | undefined) => {
      if (variableId !== undefined && !validVariableIds.has(variableId)) {
        errors.push(`Invalid variable reference in the page: ${field} "${variableId}" does not exist in this template`)
      }
    }
    checkPageBinding('visibleWhen.variableId', page.visibleWhen?.variableId)
    checkPageBinding('repeat.variableId', page.repeat?.variableId)
    errors.push(...this.validateVariableReferences(shapes, validVariableIds))
    if (errors.length) {
      throw new ValidationError('Invalid variable references', undefined, errors)
    }
  }

  private validateVariableReferences(shapes: Shape[], validVariableIds: Set<string>): string[] {
    const errors: string[] = []
    const checkBinding = (shapeIndex: number, field: string, variableId: string | undefined) => {
      if (variableId !== undefined && !validVariableIds.has(variableId)) {
        errors.push(
          `Invalid variable reference in shape ${shapeIndex}: ` +
          `${field} "${variableId}" does not exist in this template`
        )
      }
    }
    shapes.forEach((shape, shapeIndex) => {
      checkBinding(shapeIndex, 'visibleWhen.variableId', shape.visibleWhen?.variableId)
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
      } else if (shape.type === 'image') {
        if (shape.imageVariable !== undefined && !validVariableIds.has(shape.imageVariable)) {
          errors.push(
            `Invalid variable reference in shape ${shapeIndex}: ` +
            `imageVariable "${shape.imageVariable}" does not exist in this template`
          )
        }
      } else if (isContainerShape(shape)) {
        checkBinding(shapeIndex, 'repeat.variableId', shape.repeat?.variableId)
        errors.push(...this.validateVariableReferences(shape.children, validVariableIds))
      }
    })
    return errors
  }
}
