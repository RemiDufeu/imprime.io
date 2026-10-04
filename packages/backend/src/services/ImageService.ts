import { ImageModel } from '../models/Image.js'
import { SlideModel } from '../models/Slide.js'
import { isObjectIdString } from '../models/mappers.js'
import { IMAGE_MIME_TYPES, type ImageDTO, type ImageMimeType } from '@imprime/common'
import { AppError, NotFoundError, ValidationError } from './errors.js'

// How much image data one user may keep, orphans included until they expire
// (ORPHAN_GRACE_SECONDS). One upload is capped by the JSON body limit.
const MAX_IMAGE_BYTES_PER_OWNER = 500 * 1024 * 1024

// The bytes each accepted format starts with. Keyed by every type the API
// takes, so a format added to IMAGE_MIME_TYPES cannot be accepted unchecked.
const IMAGE_SIGNATURES: Record<ImageMimeType, readonly number[]> = {
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/jpeg': [0xff, 0xd8, 0xff],
}

// `data:image/png;base64,` before the data — what the editor sends. The SDK
// sends bare base64. Both are stored as sent: the export reads either.
const DATA_URL_PREFIX = /^data:([^;,]*)[^,]*;base64,/i
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

const imageNotFound = () => new NotFoundError('Image not found', 'IMAGE_NOT_FOUND')

// Clients write JPEG's type both ways.
function normalizeMimeType(value: string): string {
  const type = value.trim().toLowerCase()
  return type === 'image/jpg' ? 'image/jpeg' : type
}

function sniffImageType(head: Buffer): ImageMimeType | undefined {
  return IMAGE_MIME_TYPES.find(type => IMAGE_SIGNATURES[type].every((byte, i) => head[i] === byte))
}

interface UploadedImage {
  mimeType: ImageMimeType
  size: number
}

/**
 * Reads the format from the bytes rather than trusting the declared type, so
 * an image accepted here is one the export draws as the editor shows it (see
 * IMAGE_MIME_TYPES). The declared type, and a data URL's, must agree with it.
 */
function parseImage(upload: ImageDTO.Create | undefined): UploadedImage {
  if (!upload || typeof upload.data !== 'string' || !upload.data || typeof upload.mimeType !== 'string') {
    throw new ValidationError('Missing required fields: data, mimeType')
  }

  const prefix = DATA_URL_PREFIX.exec(upload.data)
  // Base64 is often wrapped over several lines; the export strips them too.
  const base64 = (prefix ? upload.data.slice(prefix[0].length) : upload.data).replace(/\s/g, '')
  if (!BASE64.test(base64)) {
    throw new ValidationError('Image data must be base64, or a base64 data URL', 'IMAGE_DATA_INVALID')
  }

  // The longest signature is 8 bytes: 12 base64 characters decode to 9.
  const mimeType = sniffImageType(Buffer.from(base64.slice(0, 12), 'base64'))
  if (!mimeType) {
    throw new ValidationError('Only PNG and JPEG images are supported', 'IMAGE_TYPE_UNSUPPORTED')
  }
  for (const declared of [upload.mimeType, prefix?.[1]]) {
    if (declared !== undefined && normalizeMimeType(declared) !== mimeType) {
      throw new ValidationError(`The image is ${mimeType}, not "${declared}"`, 'IMAGE_TYPE_MISMATCH')
    }
  }

  return { mimeType, size: Buffer.byteLength(base64, 'base64') }
}

/**
 * Images belong to the user who uploaded them: every read, delete and
 * reference count is scoped by `ownerId`, which the caller passes — the
 * authenticated user, or a presentation's owner.
 */
export class ImageService {
  public async upload(data: ImageDTO.Create, ownerId: string): Promise<ImageDTO.Response> {
    const { mimeType, size } = parseImage(data)
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
      mimeType,
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
