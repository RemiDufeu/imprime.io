import { ImageModel } from '../models/Image.js'
import { SlideModel } from '../models/Slide.js'
import type { ImageDTO } from '@imprime/common'
import { NotFoundError, ValidationError } from './errors.js'

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

  // Of `ids`, those no slide shows any more — on any presentation, since a
  // duplicated or pasted image shape keeps its image. Read after the write
  // that removed them, so that slide already counts as not showing them.
  private async unused(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return []
    const used = new Set(await SlideModel.distinct('imageIds', { imageIds: { $in: ids } }))
    return [...new Set(ids)].filter(id => !used.has(id))
  }

  // These left a slide. Those no slide shows any more start their grace
  // period (ORPHAN_GRACE_SECONDS) rather than being deleted: the editor can
  // undo the removal. An image already orphaned keeps its original date.
  public async release(ids: string[]): Promise<void> {
    const unused = await this.unused(ids)
    if (unused.length === 0) return
    await ImageModel.updateMany(
      { _id: { $in: unused }, orphanedAt: { $exists: false } },
      { $set: { orphanedAt: new Date() } }
    )
  }

  // A slide shows these: keep them. Run for every image of every saved tree,
  // not only the new ones, so a release that raced a later save is undone.
  public async markReferenced(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    await ImageModel.updateMany(
      { _id: { $in: ids }, orphanedAt: { $exists: true } },
      { $unset: { orphanedAt: 1 } }
    )
  }

  // Deleted now, without a grace period: their presentation is gone. Those
  // another presentation shows are kept.
  public async deleteUnused(ids: string[]): Promise<number> {
    const unused = await this.unused(ids)
    if (unused.length === 0) return 0
    const result = await ImageModel.deleteMany({ _id: { $in: unused } })
    return result.deletedCount
  }
}
