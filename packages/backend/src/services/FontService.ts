import mongoose from 'mongoose'
import { create as parseFont } from 'fontkit'
import { FONT_VARIANTS, MAX_FONT_FILE_SIZE, isBuiltinFontFamily } from '@imprime/common'
import type { FontDTO, FontVariant } from '@imprime/common'
import { FontModel, type IFontFile } from '../models/Font.js'
import { fontCreateToModel, fontToDTO } from '../models/mappers.js'
import { ConflictError, NotFoundError, ValidationError } from './errors.js'

const MAX_FAMILY_LENGTH = 64

// Projection leaving out every face's file, for reads that only need metadata.
const WITHOUT_FILE_DATA = FONT_VARIANTS.map(variant => `-faces.${variant}.data`).join(' ')

const fontNotFound = () => new NotFoundError('Font not found', 'FONT_NOT_FOUND')

const familyConflict = () =>
  new ConflictError('A font with this name already exists', 'FONT_FAMILY_EXISTS')

function isDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000
}

// An id that is not an ObjectId cannot name a font; answering 404 rather than
// letting the cast fail keeps the response the same as for any unknown font.
function fontFilter(fontId: string): { _id: string } {
  if (!mongoose.isValidObjectId(fontId)) throw fontNotFound()
  return { _id: fontId }
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

/**
 * Decodes an uploaded face and checks it with fontkit, the parser react-pdf
 * draws with, so a file accepted here is one the export can embed. Only
 * TrueType and OpenType are accepted: the formats the editor and the export
 * both load from the same bytes.
 */
function parseFontFile(upload: FontDTO.FaceUpload | undefined): IFontFile {
  if (!upload || typeof upload.data !== 'string' || !upload.data) {
    throw new ValidationError('Missing font file data', 'FONT_FILE_REQUIRED')
  }

  const data = Buffer.from(upload.data, 'base64')
  if (data.length > MAX_FONT_FILE_SIZE) {
    throw new ValidationError('Font file exceeds 4 MB', 'FONT_FILE_TOO_LARGE')
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
    size: data.length,
    originalName: typeof upload.originalName === 'string' ? upload.originalName : undefined,
  }
}

// An imported family with the files of its faces, as the export registers it.
export interface FontWithFiles {
  font: FontDTO.Response
  files: Partial<Record<FontVariant, Buffer>>
}

/**
 * The font families imported into the instance, shared by every user. Reads
 * are open to any authenticated caller; the routes that write are behind
 * `requireAdmin`, and the service trusts them.
 */
export class FontService {
  public async list(): Promise<FontDTO.Response[]> {
    const fonts = await FontModel.find().select(WITHOUT_FILE_DATA).sort({ familyKey: 1 })
    return fonts.map(fontToDTO)
  }

  public async create(data: FontDTO.Create): Promise<FontDTO.Response> {
    const family = parseFamily(data?.family)
    const regular = parseFontFile(data?.regular)

    const exists = await FontModel.exists({ familyKey: family.toLowerCase() })
    if (exists) {
      throw familyConflict()
    }

    try {
      const font = await FontModel.create(fontCreateToModel(family, regular))
      return fontToDTO(font)
    } catch (err) {
      if (isDuplicateKey(err)) throw familyConflict()
      throw err
    }
  }

  public async setFace(fontId: string, variant: string, upload: FontDTO.FaceUpload): Promise<FontDTO.Response> {
    const filter = fontFilter(fontId)
    const face = parseFontVariant(variant)
    const file = parseFontFile(upload)

    const font = await FontModel.findOneAndUpdate(
      filter,
      { $set: { [`faces.${face}`]: file }, $inc: { version: 1 } },
      { new: true }
    ).select(WITHOUT_FILE_DATA)
    if (!font) {
      throw fontNotFound()
    }
    return fontToDTO(font)
  }

  public async deleteFace(fontId: string, variant: string): Promise<FontDTO.Response> {
    const filter = fontFilter(fontId)
    const face = parseFontVariant(variant)
    if (face === 'regular') {
      throw new ValidationError('The regular face cannot be removed; delete the font instead', 'FONT_REGULAR_REQUIRED')
    }

    const font = await FontModel.findOneAndUpdate(
      filter,
      { $unset: { [`faces.${face}`]: 1 }, $inc: { version: 1 } },
      { new: true }
    ).select(WITHOUT_FILE_DATA)
    if (!font) {
      throw fontNotFound()
    }
    return fontToDTO(font)
  }

  public async getFaceData(fontId: string, variant: string): Promise<FontDTO.FaceData> {
    const filter = fontFilter(fontId)
    const face = parseFontVariant(variant)

    const font = await FontModel.findOne(filter).select(`faces.${face}`)
    const file = font?.faces[face]
    if (!file) {
      throw new NotFoundError('Font face not found', 'FONT_FACE_NOT_FOUND')
    }
    return { data: file.data.toString('base64') }
  }

  // Text using the family, in any presentation, is left as is: both renderers
  // draw an unknown family in the default font, and re-importing the name
  // brings it back.
  public async delete(fontId: string): Promise<void> {
    const result = await FontModel.deleteOne(fontFilter(fontId))
    if (result.deletedCount === 0) {
      throw fontNotFound()
    }
  }

  /**
   * The imported families among `families`, with their files. Names that are
   * built-in or unknown are not imported fonts and are skipped.
   */
  public async getForExport(families: readonly string[]): Promise<FontWithFiles[]> {
    if (families.length === 0) return []

    const fonts = await FontModel.find({ family: { $in: families } })
    return fonts.map(doc => {
      const files: FontWithFiles['files'] = {}
      for (const variant of FONT_VARIANTS) {
        const file = doc.faces[variant]
        if (file) files[variant] = file.data
      }
      return { font: fontToDTO(doc), files }
    })
  }
}
