/**
 * Image formats
 *
 * The formats an uploaded image may be in: those the editor and the export
 * both draw from the same bytes. The browser shows any image; react-pdf only
 * PNG, JPEG and a subset of SVG, and leaves anything else out of the PDF with
 * no error. The API refuses other formats; the editor redraws them as PNG
 * before uploading.
 */

import type { Shape } from './types.js'
import { isContainerShape } from './types.js'

export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg'] as const

export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number]

export function isImageMimeType(value: string): value is ImageMimeType {
  return IMAGE_MIME_TYPES.some(type => type === value)
}

/**
 * A stored image's data as a data URL, which both renderers draw. The API
 * stores data as sent: a data URL from the editor, bare base64 from the SDK,
 * either possibly wrapped over several lines.
 */
export function toImageDataUrl(data: string, mimeType: string): string {
  const clean = data.replace(/\s/g, '')
  return clean.startsWith('data:') ? clean : `data:${mimeType};base64,${clean}`
}

// Every uploaded image a shape tree shows, containers included, in tree
// order and repeated as often as shown. A box bound to a variable keeps no
// `imageId` of its own (the editor's picker clears it).
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

// `data:image/png;base64,` before the data.
const DATA_URL_PREFIX = /^data:([^;,]*)[^,]*;base64,/i

/**
 * The declared type and the base64 data of a data URL — what an image
 * variable holds. Undefined for anything else. Nothing is decoded or checked:
 * each side decodes base64 its own way, then reads the bytes with
 * `readImageInfo`.
 */
export function splitDataUrl(value: string): { mimeType: string; base64: string } | undefined {
  const prefix = DATA_URL_PREFIX.exec(value)
  if (!prefix) return undefined
  return { mimeType: prefix[1].trim().toLowerCase(), base64: value.slice(prefix[0].length).replace(/\s/g, '') }
}

// ============================================
// Natural size
//
// Read from the bytes by the server at upload and at export, and by the editor
// for an image variable's default: the same reader on both sides, so the box
// lays the image out from the same numbers (getImageLayout).
// ============================================

export interface ImageSize {
  width: number
  height: number
}

export interface ImageInfo extends ImageSize {
  mimeType: ImageMimeType
}

// The bytes each accepted format starts with. Keyed by every accepted type, so
// a format added to IMAGE_MIME_TYPES cannot be accepted unchecked.
const IMAGE_SIGNATURES: Record<ImageMimeType, readonly number[]> = {
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/jpeg': [0xff, 0xd8, 0xff],
}

export function sniffImageType(bytes: Uint8Array): ImageMimeType | undefined {
  return IMAGE_MIME_TYPES.find(type => IMAGE_SIGNATURES[type].every((byte, i) => bytes[i] === byte))
}

const ascii = (bytes: Uint8Array, start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end))

// The IHDR chunk comes first, right after the signature.
function readPngSize(bytes: Uint8Array): ImageSize | undefined {
  if (bytes.length < 24 || ascii(bytes, 12, 16) !== 'IHDR') return undefined
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: data.getUint32(16), height: data.getUint32(20) }
}

// The orientation tag (0x0112) of an APP1 segment's EXIF data, between
// `start` and `end`. Only IFD0 holds it.
function readExifOrientation(bytes: Uint8Array, start: number, end: number): number | undefined {
  if (start + 14 > end || ascii(bytes, start, start + 6) !== 'Exif\0\0') return undefined
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tiff = start + 6
  const order = ascii(bytes, tiff, tiff + 2)
  if (order !== 'II' && order !== 'MM') return undefined
  const littleEndian = order === 'II'
  const ifd = tiff + data.getUint32(tiff + 4, littleEndian)
  if (ifd + 2 > end) return undefined
  const count = data.getUint16(ifd, littleEndian)
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12
    if (entry + 12 > end) return undefined
    if (data.getUint16(entry, littleEndian) === 0x0112) return data.getUint16(entry + 8, littleEndian)
  }
  return undefined
}

// The first frame header's size, walking the marker segments up to the image
// data. An EXIF orientation of 5 to 8 turns the image a quarter: its width and
// height are swapped, as react-pdf and the browser both draw it. react-pdf
// reads the orientation again, with its own parser, to rotate the pixels
// (@react-pdf/image, pdfkit): the two must agree on what a JPEG says.
function readJpegSize(bytes: Uint8Array): ImageSize | undefined {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let size: ImageSize | undefined
  let orientation = 1
  let offset = 2 // after SOI
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1]
    if (marker === 0xff) { offset++; continue } // fill byte
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) { offset += 2; continue } // no length
    if (marker === 0xda) break // start of scan: the image data follows
    const end = Math.min(bytes.length, offset + 2 + data.getUint16(offset + 2))
    const payload = offset + 4
    // SOF0 to SOF15, except DHT, JPG and DAC, which share the range.
    if (!size && marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (payload + 5 > end) return undefined
      size = { width: data.getUint16(payload + 3), height: data.getUint16(payload + 1) }
    } else if (marker === 0xe1) {
      orientation = readExifOrientation(bytes, payload, end) ?? orientation
    }
    offset = end
  }
  if (!size) return undefined
  return orientation > 4 ? { width: size.height, height: size.width } : size
}

const IMAGE_SIZE_READERS: Record<ImageMimeType, (bytes: Uint8Array) => ImageSize | undefined> = {
  'image/png': readPngSize,
  'image/jpeg': readJpegSize,
}

// The natural size of an image of type `mimeType`, as displayed. Undefined
// when the header cannot be read or names no pixels: a damaged file.
export function readImageSize(bytes: Uint8Array, mimeType: ImageMimeType): ImageSize | undefined {
  const size = IMAGE_SIZE_READERS[mimeType](bytes)
  return size && size.width > 0 && size.height > 0 ? size : undefined
}

// The format, read from the bytes, and the natural size of an image: what an
// image must have to be drawn. Undefined for anything else.
export function readImageInfo(bytes: Uint8Array): ImageInfo | undefined {
  const mimeType = sniffImageType(bytes)
  const size = mimeType && readImageSize(bytes, mimeType)
  return mimeType && size ? { mimeType, ...size } : undefined
}
