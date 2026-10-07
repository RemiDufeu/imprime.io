import { ImageModel } from '../models/Image.js'
import { PageModel } from '../models/Page.js'
import { isObjectIdString } from '../models/mappers.js'
import {
  readImageInfo,
  readImageSize,
  sniffImageType,
  splitDataUrl,
  toImageDataUrl,
  type ImageDTO,
  type ImageMimeType,
  type ImageSize,
} from '@imprime/common'
import { AppError, NotFoundError, ValidationError } from './errors.js'

// How much image data one user may keep, orphans included until they expire
// (ORPHAN_GRACE_SECONDS). One upload is capped by the JSON body limit.
const MAX_IMAGE_BYTES_PER_OWNER = 500 * 1024 * 1024

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

const imageNotFound = () => new NotFoundError('Image not found', 'IMAGE_NOT_FOUND')

// Clients write JPEG's type both ways.
function normalizeMimeType(value: string): string {
  const type = value.trim().toLowerCase()
  return type === 'image/jpg' ? 'image/jpeg' : type
}

interface UploadedImage extends ImageSize {
  mimeType: ImageMimeType
  size: number
}

/**
 * Reads the format from the bytes rather than trusting the declared type, so
 * an image accepted here is one the export draws as the editor shows it (see
 * IMAGE_MIME_TYPES). The declared type, and a data URL's, must agree with it.
 * `data` is a data URL — what the editor sends — or bare base64 — what the SDK
 * sends. Both are stored as sent: the export reads either.
 */
function parseImage(upload: ImageDTO.Create | undefined): UploadedImage {
  if (!upload || typeof upload.data !== 'string' || !upload.data || typeof upload.mimeType !== 'string') {
    throw new ValidationError('Missing required fields: data, mimeType')
  }

  const dataUrl = splitDataUrl(upload.data)
  // Base64 is often wrapped over several lines; the export strips them too.
  const base64 = dataUrl ? dataUrl.base64 : upload.data.replace(/\s/g, '')
  if (!BASE64.test(base64)) {
    throw new ValidationError('Image data must be base64, or a base64 data URL', 'IMAGE_DATA_INVALID')
  }

  const bytes = Buffer.from(base64, 'base64')
  const mimeType = sniffImageType(bytes)
  if (!mimeType) {
    throw new ValidationError('Only PNG and JPEG images are supported', 'IMAGE_TYPE_UNSUPPORTED')
  }
  for (const declared of [upload.mimeType, dataUrl?.mimeType]) {
    if (declared !== undefined && normalizeMimeType(declared) !== mimeType) {
      throw new ValidationError(`The image is ${mimeType}, not "${declared}"`, 'IMAGE_TYPE_MISMATCH')
    }
  }

  // Both renderers lay the image out from this size (getImageLayout): one
  // that cannot be read is refused rather than stored with a guess.
  const pixels = readImageSize(bytes, mimeType)
  if (!pixels) {
    throw new ValidationError('The image size cannot be read: the file is damaged', 'IMAGE_SIZE_UNREADABLE')
  }

  return { mimeType, size: bytes.length, ...pixels }
}

// An image held as a data URL — an image variable's value — as it is drawn.
export interface DataUrlImage extends ImageSize {
  dataUrl: string
}

/**
 * `value` as an image the export can draw: a data URL of a PNG or JPEG whose
 * size can be read. Undefined for anything else. The bytes decide the type:
 * the URL is rewritten with theirs, since react-pdf decodes by the declared
 * one — and the editor rewrites it the same way (frontend `readImageDataUrl`),
 * so both draw the same thing from a URL that declares the wrong type.
 */
export function readImageDataUrl(value: string): DataUrlImage | undefined {
  const dataUrl = splitDataUrl(value)
  if (!dataUrl || !BASE64.test(dataUrl.base64)) return undefined
  const info = readImageInfo(Buffer.from(dataUrl.base64, 'base64'))
  if (!info) return undefined
  return { dataUrl: toImageDataUrl(dataUrl.base64, info.mimeType), width: info.width, height: info.height }
}

/**
 * Images belong to the user who uploaded them: every read, delete and
 * reference count is scoped by `ownerId`, which the caller passes — the
 * authenticated user, or a template's owner.
 */
export class ImageService {
  public async upload(data: ImageDTO.Create, ownerId: string): Promise<ImageDTO.Response> {
    const { mimeType, size, width, height } = parseImage(data)
    if (await this.storedBytes(ownerId) + size > MAX_IMAGE_BYTES_PER_OWNER) {
      throw new AppError(
        `Image storage is full (${MAX_IMAGE_BYTES_PER_OWNER / 1024 / 1024} MB): remove images from your pages, or delete templates`,
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
      width,
      height,
    })

    await image.save()

    return {
      _id: image._id.toString(),
      mimeType: image.mimeType,
      originalName: image.originalName,
      size: image.size,
      width: image.width,
      height: image.height,
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
      width: image.width,
      height: image.height,
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

  // Of `ids`, those no page shows any more — on any template, since a
  // duplicated or pasted image shape keeps its image. Read after the write
  // that removed them, so that page already counts as not showing them.
  private async unused(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return []
    const used = new Set(await PageModel.distinct('imageIds', { imageIds: { $in: ids } }))
    return [...new Set(ids)].filter(id => !used.has(id))
  }

  // These left a page of `ownerId`'s. Those no page shows any more start
  // their grace period (ORPHAN_GRACE_SECONDS) rather than being deleted: the
  // editor can undo the removal. An image already orphaned keeps its
  // original date. Ids a page holds are anyone's to write: only the owner's
  // own images are touched.
  public async release(ids: string[], ownerId: string): Promise<void> {
    const unused = await this.unused(ids)
    if (unused.length === 0) return
    await ImageModel.updateMany(
      { _id: { $in: unused }, ownerId, orphanedAt: { $exists: false } },
      { $set: { orphanedAt: new Date() } }
    )
  }

  // A page of `ownerId`'s shows these: keep them. Run for every image of
  // every saved tree, not only the new ones, so a release that raced a later
  // save is undone.
  public async markReferenced(ids: string[], ownerId: string): Promise<void> {
    if (ids.length === 0) return
    await ImageModel.updateMany(
      { _id: { $in: ids }, ownerId, orphanedAt: { $exists: true } },
      { $unset: { orphanedAt: 1 } }
    )
  }

  // Deleted now, without a grace period: their template, `ownerId`'s, is
  // gone. Those another template shows are kept.
  public async deleteUnused(ids: string[], ownerId: string): Promise<number> {
    const unused = await this.unused(ids)
    if (unused.length === 0) return 0
    const result = await ImageModel.deleteMany({ _id: { $in: unused }, ownerId })
    return result.deletedCount
  }
}
