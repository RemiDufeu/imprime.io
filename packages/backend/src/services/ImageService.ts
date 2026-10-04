import { ImageModel } from '../models/Image.js'
import { SlideModel } from '../models/Slide.js'
import { isObjectIdString } from '../models/mappers.js'
import type { ImageDTO } from '@imprime/common'
import { AppError, NotFoundError, ValidationError } from './errors.js'

// How much image data one user may keep, orphans included until they expire
// (ORPHAN_GRACE_SECONDS). One upload is capped by the JSON body limit.
const MAX_IMAGE_BYTES_PER_OWNER = 500 * 1024 * 1024
const IMAGE_MIME_TYPE = /^image\/[a-z0-9.+-]+$/i

const imageNotFound = () => new NotFoundError('Image not found', 'IMAGE_NOT_FOUND')

/**
 * Images belong to the user who uploaded them: every read, delete and
 * reference count is scoped by `ownerId`, which the caller passes — the
 * authenticated user, or a presentation's owner.
 */
export class ImageService {
  public async upload(data: ImageDTO.Create, ownerId: string): Promise<ImageDTO.Response> {
    if (typeof data?.data !== 'string' || !data.data || typeof data.mimeType !== 'string') {
      throw new ValidationError('Missing required fields: data, mimeType')
    }
    if (!IMAGE_MIME_TYPE.test(data.mimeType)) {
      throw new ValidationError(`"${data.mimeType}" is not an image type`, 'IMAGE_TYPE_INVALID')
    }

    const size = Math.ceil((data.data.length * 3) / 4)
    if (await this.storedBytes(ownerId) + size > MAX_IMAGE_BYTES_PER_OWNER) {
      throw new AppError(
        `Image storage is full (${MAX_IMAGE_BYTES_PER_OWNER / 1024 / 1024} MB): remove images from your slides, or delete presentations`,
        413,
        'IMAGE_QUOTA_EXCEEDED',
      )
    }

    const image = new ImageModel({
      ownerId,
      data: data.data,
      mimeType: data.mimeType,
      originalName: typeof data.originalName === 'string' ? data.originalName : undefined,
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

  // Someone else's image is not found, as one that does not exist.
  public async getById(id: string, ownerId: string): Promise<ImageDTO.ResponseWithData> {
    if (!isObjectIdString(id)) throw imageNotFound()
    const image = await ImageModel.findOne({ _id: id, ownerId })
    if (!image) throw imageNotFound()

    return {
      _id: image._id.toString(),
      data: image.data,
      mimeType: image.mimeType,
      originalName: image.originalName,
      size: image.size,
      createdAt: image.createdAt,
    }
  }

  public async delete(id: string, ownerId: string): Promise<void> {
    if (!isObjectIdString(id)) throw imageNotFound()
    const image = await ImageModel.findOneAndDelete({ _id: id, ownerId })
    if (!image) throw imageNotFound()
  }

  private async storedBytes(ownerId: string): Promise<number> {
    const [total] = await ImageModel.aggregate<{ bytes: number }>([
      { $match: { ownerId } },
      { $group: { _id: null, bytes: { $sum: '$size' } } },
    ])
    return total?.bytes ?? 0
  }

  // Of `ids`, those no slide shows any more — on any presentation, since a
  // duplicated or pasted image shape keeps its image. Read after the write
  // that removed them, so that slide already counts as not showing them.
  private async unused(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return []
    const used = new Set(await SlideModel.distinct('imageIds', { imageIds: { $in: ids } }))
    return [...new Set(ids)].filter(id => !used.has(id))
  }

  // These left a slide of `ownerId`'s. Those no slide shows any more start
  // their grace period (ORPHAN_GRACE_SECONDS) rather than being deleted: the
  // editor can undo the removal. An image already orphaned keeps its
  // original date. Ids a slide holds are anyone's to write: only the owner's
  // own images are touched.
  public async release(ids: string[], ownerId: string): Promise<void> {
    const unused = await this.unused(ids)
    if (unused.length === 0) return
    await ImageModel.updateMany(
      { _id: { $in: unused }, ownerId, orphanedAt: { $exists: false } },
      { $set: { orphanedAt: new Date() } }
    )
  }

  // A slide of `ownerId`'s shows these: keep them. Run for every image of
  // every saved tree, not only the new ones, so a release that raced a later
  // save is undone.
  public async markReferenced(ids: string[], ownerId: string): Promise<void> {
    if (ids.length === 0) return
    await ImageModel.updateMany(
      { _id: { $in: ids }, ownerId, orphanedAt: { $exists: true } },
      { $unset: { orphanedAt: 1 } }
    )
  }

  // Deleted now, without a grace period: their presentation, `ownerId`'s, is
  // gone. Those another presentation shows are kept.
  public async deleteUnused(ids: string[], ownerId: string): Promise<number> {
    const unused = await this.unused(ids)
    if (unused.length === 0) return 0
    const result = await ImageModel.deleteMany({ _id: { $in: unused }, ownerId })
    return result.deletedCount
  }
}
