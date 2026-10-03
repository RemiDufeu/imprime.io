import { ImageModel } from '../models/Image.js'
import type { ImageDTO, Shape } from '@imprime/common'
import { isContainerShape } from '@imprime/common'
import { NotFoundError, ValidationError } from './errors.js'

// Every image a shape tree shows, containers included.
export function collectImageIds(shapes: Shape[]): string[] {
  const ids: string[] = []
  for (const shape of shapes) {
    if (shape.type === 'image') {
      if (shape.imageId) ids.push(shape.imageId)
    } else if (isContainerShape(shape)) {
      ids.push(...collectImageIds(shape.children))
    }
  }
  return ids
}

export class ImageService {
  public async upload(data: ImageDTO.Create): Promise<ImageDTO.Response> {
    if (!data.data || !data.mimeType) {
      throw new ValidationError('Missing required fields: data, mimeType')
    }

    const size = Math.ceil((data.data.length * 3) / 4)

    const image = new ImageModel({
      data: data.data,
      mimeType: data.mimeType,
      originalName: data.originalName,
      size,
    })

    await image.save()

    return {
      _id: image._id.toString(),
      mimeType: image.mimeType,
      originalName: image.originalName,
      size: image.size,
      createdAt: image.createdAt,
    }
  }

  public async getById(id: string): Promise<ImageDTO.ResponseWithData> {
    const image = await ImageModel.findById(id)
    if (!image) {
      throw new NotFoundError('Image not found')
    }

    return {
      _id: image._id.toString(),
      data: image.data,
      mimeType: image.mimeType,
      originalName: image.originalName,
      size: image.size,
      createdAt: image.createdAt,
    }
  }

  public async delete(id: string): Promise<void> {
    const image = await ImageModel.findByIdAndDelete(id)
    if (!image) {
      throw new NotFoundError('Image not found')
    }
  }

  // No slide shows these any more: start their grace period. An image already
  // orphaned keeps its original date.
  public async markOrphaned(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    await ImageModel.updateMany(
      { _id: { $in: ids }, orphanedAt: { $exists: false } },
      { $set: { orphanedAt: new Date() } }
    )
  }

  // A slide shows these again (an undo, a restored slide): keep them.
  public async markReferenced(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    await ImageModel.updateMany(
      { _id: { $in: ids }, orphanedAt: { $exists: true } },
      { $unset: { orphanedAt: 1 } }
    )
  }

  public async deleteMany(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0
    const result = await ImageModel.deleteMany({ _id: { $in: ids } })
    return result.deletedCount
  }
}
