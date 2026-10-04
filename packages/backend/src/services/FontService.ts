import mongoose from 'mongoose'
import { create as parseFont } from 'fontkit'
import { FONT_VARIANTS, MAX_FONT_FILE_SIZE, MAX_FONT_FILE_SIZE_MB, isBuiltinFontFamily } from '@imprime/common'
import type { FontDTO, FontVariant } from '@imprime/common'
import { FontModel, type IFontFace } from '../models/Font.js'
import { FontFileModel } from '../models/FontFile.js'
import { fontCreateToModel, fontFileCreateToModel, fontToDTO, toObjectId } from '../models/mappers.js'
import { ConflictError, NotFoundError, ValidationError } from './errors.js'

const MAX_FAMILY_LENGTH = 64

const fontNotFound = () => new NotFoundError('Font not found', 'FONT_NOT_FOUND')

const familyConflict = () =>
  new ConflictError('A font with this name already exists', 'FONT_FAMILY_EXISTS')

function isDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000
}

// An id that is not an ObjectId cannot name a font; answering 404 rather than
// letting the cast fail keeps the response the same as for any unknown font.
function parseFontId(fontId: string): mongoose.Types.ObjectId {
  if (!mongoose.isValidObjectId(fontId)) throw fontNotFound()
  return toObjectId(fontId)
}

function parseFamily(value: unknown): string {
  const family = typeof value === 'string' ? value.trim() : ''
  if (!family) {
    throw new ValidationError('Font name is required', 'FONT_FAMILY_REQUIRED')
  }
  if (family.length > MAX_FAMILY_LENGTH) {
    throw new ValidationError(`Font name must be at most ${MAX_FAMILY_LENGTH} characters`, 'FONT_FAMILY_TOO_LONG')
  }
  if (isBuiltinFontFamily(family)) {
    throw new ValidationError(`"${family}" is a built-in font`, 'FONT_FAMILY_RESERVED')
  }
  return family
}

export function parseFontVariant(value: string): FontVariant {
  const variant = FONT_VARIANTS.find(v => v === value)
  if (!variant) {
    throw new ValidationError(`Unknown font variant "${value}"`, 'FONT_VARIANT_INVALID')
  }
  return variant
}

interface UploadedFace {
  data: Buffer
  face: IFontFace
}

/**
 * Decodes an uploaded face and checks it with fontkit, the parser react-pdf
 * draws with, so a file accepted here is one the export can embed. Only
 * TrueType and OpenType are accepted: the formats the editor and the export
 * both load from the same bytes.
 */
function parseFontFile(upload: FontDTO.FaceUpload | undefined): UploadedFace {
  if (!upload || typeof upload.data !== 'string' || !upload.data) {
    throw new ValidationError('Missing font file data', 'FONT_FILE_REQUIRED')
  }

  const data = Buffer.from(upload.data, 'base64')
  if (data.length > MAX_FONT_FILE_SIZE) {
    throw new ValidationError(`Font file exceeds ${MAX_FONT_FILE_SIZE_MB} MB`, 'FONT_FILE_TOO_LARGE')
  }

  const unsupported = () =>
    new ValidationError('Only TrueType (.ttf) and OpenType (.otf) fonts are supported', 'FONT_FILE_UNSUPPORTED')

  let isUsable: boolean
  try {
    const font = parseFont(data)
    // fontkit reports OpenType files as 'TTF' too. Reading the glyph count
    // parses a table, which a truncated file fails.
    isUsable = font.type === 'TTF' && font.numGlyphs > 0
  } catch {
    throw unsupported()
  }
  if (!isUsable) throw unsupported()

  return {
    data,
    face: {
      size: data.length,
      originalName: typeof upload.originalName === 'string' ? upload.originalName : undefined,
    },
  }
}

// An imported family with the files of its faces, as the export registers it.
// `files` is null for a font the caller already registered: not fetched.
export interface FontWithFiles {
  font: FontDTO.Response
  files: Partial<Record<FontVariant, Buffer>> | null
}

/**
 * The font families imported into the instance, shared by every user. Reads
 * are open to any authenticated caller; the routes that write are behind
 * `requireAdmin`, and the service trusts them.
 *
 * A font's metadata lives in `Font`, each face's file in its own `FontFile`.
 * Without transactions, writes are ordered so a font never lists a face whose
 * file is missing; a failure can at worst leave an unreachable file behind.
 */
export class FontService {
  public async list(): Promise<FontDTO.Response[]> {
    const fonts = await FontModel.find().sort({ familyKey: 1 })
    return fonts.map(fontToDTO)
  }

  public async create(data: FontDTO.Create): Promise<FontDTO.Response> {
    const family = parseFamily(data?.family)
    const regular = parseFontFile(data?.regular)

    const exists = await FontModel.exists({ familyKey: family.toLowerCase() })
    if (exists) {
      throw familyConflict()
    }

    let font
    try {
      font = await FontModel.create(fontCreateToModel(family, regular.face))
    } catch (err) {
      if (isDuplicateKey(err)) throw familyConflict()
      throw err
    }

    // The font needs its id before its file can point at it; if the file
    // cannot be stored, the font is taken back out.
    try {
      await FontFileModel.create(fontFileCreateToModel(font._id, 'regular', regular.data))
    } catch (err) {
      await FontModel.deleteOne({ _id: font._id })
      throw err
    }
    return fontToDTO(font)
  }

  public async setFace(fontId: string, variant: string, upload: FontDTO.FaceUpload): Promise<FontDTO.Response> {
    const id = parseFontId(fontId)
    const face = parseFontVariant(variant)
    const uploaded = parseFontFile(upload)

    if (!(await FontModel.exists({ _id: id }))) {
      throw fontNotFound()
    }

    // The file before the metadata that lists it.
    await FontFileModel.updateOne(
      { fontId: id, variant: face },
      { $set: fontFileCreateToModel(id, face, uploaded.data) },
      { upsert: true }
    )
    const font = await FontModel.findOneAndUpdate(
      { _id: id },
      { $set: { [`faces.${face}`]: uploaded.face }, $inc: { version: 1 } },
      { new: true }
    )
    if (!font) {
      throw fontNotFound()
    }
    return fontToDTO(font)
  }

  public async deleteFace(fontId: string, variant: string): Promise<FontDTO.Response> {
    const id = parseFontId(fontId)
    const face = parseFontVariant(variant)
    if (face === 'regular') {
      throw new ValidationError('The regular face cannot be removed; delete the font instead', 'FONT_REGULAR_REQUIRED')
    }

    // The metadata before the file: a face no longer listed is never read.
    const font = await FontModel.findOneAndUpdate(
      { _id: id },
      { $unset: { [`faces.${face}`]: 1 }, $inc: { version: 1 } },
      { new: true }
    )
    if (!font) {
      throw fontNotFound()
    }
    await FontFileModel.deleteOne({ fontId: id, variant: face })
    return fontToDTO(font)
  }

  public async getFaceData(fontId: string, variant: string): Promise<FontDTO.FaceData> {
    const id = parseFontId(fontId)
    const face = parseFontVariant(variant)

    const file = await FontFileModel.findOne({ fontId: id, variant: face })
    if (!file) {
      throw new NotFoundError('Font face not found', 'FONT_FACE_NOT_FOUND')
    }
    return { data: file.data.toString('base64') }
  }

  // Text using the family, in any presentation, is left as is: both renderers
  // draw an unknown family in the default font, and re-importing the name
  // brings it back.
  public async delete(fontId: string): Promise<void> {
    const id = parseFontId(fontId)
    const result = await FontModel.deleteOne({ _id: id })
    if (result.deletedCount === 0) {
      throw fontNotFound()
    }

    // Best effort: an orphaned file is unreachable once its font is gone.
    try {
      await FontFileModel.deleteMany({ fontId: id })
    } catch (error) {
      console.error(`Failed to delete the files of font ${fontId}:`, error)
    }
  }

  /**
   * The imported families among `families`, with their files. Names that are
   * built-in or unknown are not imported fonts and are skipped. A face whose
   * file is missing is left out, as is a font without its regular file, so the
   * export never asks react-pdf for a face it was not given.
   *
   * Files are fetched only for the fonts `isRegistered` does not know: a
   * version, once registered, never changes, and files run to megabytes.
   */
  public async getForExport(
    families: readonly string[],
    isRegistered: (font: FontDTO.Response) => boolean = () => false
  ): Promise<FontWithFiles[]> {
    if (families.length === 0) return []

    const fonts = (await FontModel.find({ family: { $in: families } })).map(fontToDTO)
    if (fonts.length === 0) return []
    const toFetch = fonts.filter(font => !isRegistered(font))

    const files = toFetch.length
      ? await FontFileModel.find({ fontId: { $in: toFetch.map(font => toObjectId(font._id)) } })
      : []
    const filesByFont = new Map<string, Partial<Record<FontVariant, Buffer>>>()
    for (const file of files) {
      const key = file.fontId.toString()
      filesByFont.set(key, { ...filesByFont.get(key), [file.variant]: file.data })
    }

    return fonts.flatMap((dto): FontWithFiles[] => {
      if (!toFetch.includes(dto)) return [{ font: dto, files: null }]
      const available = filesByFont.get(dto._id) ?? {}
      const files: Partial<Record<FontVariant, Buffer>> = {}
      const faces: Partial<FontDTO.Response['faces']> = {}
      for (const variant of FONT_VARIANTS) {
        const data = available[variant]
        const face = dto.faces[variant]
        if (data && face) {
          files[variant] = data
          faces[variant] = face
        }
      }
      return faces.regular ? [{ font: { ...dto, faces: { ...faces, regular: faces.regular } }, files }] : []
    })
  }
}
