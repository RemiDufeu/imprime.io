/**
 * Image formats
 *
 * The formats an uploaded image may be in: those the editor and the export
 * both draw from the same bytes. The browser shows any image; react-pdf only
 * PNG, JPEG and a subset of SVG, and leaves anything else out of the PDF with
 * no error. The API refuses other formats; the editor redraws them as PNG
 * before uploading.
 */

export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg'] as const

export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number]

export function isImageMimeType(value: string): value is ImageMimeType {
  return IMAGE_MIME_TYPES.some(type => type === value)
}
