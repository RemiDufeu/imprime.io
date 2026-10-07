import type { ImageAlign, ImageCrop, ImageFit, ImageShape } from '../types.js'
import type { ImageSize } from '../images.js'

// Geometry of an image in its box — what frontend SVGImage.tsx and backend
// ExportService both need. Both draw the WHOLE image, stretched to the rect
// `getImageLayout` returns, clipped to the box rounded by
// `getImageCornerRadius`. Neither translates fit, alignment or crop into its
// own vocabulary (SVG's preserveAspectRatio, react-pdf's objectFit), so the
// two cannot place an image differently.

// What a new image box is made with.
export const DEFAULT_IMAGE_FIT: ImageFit = 'contain'
export const DEFAULT_IMAGE_ALIGN: ImageAlign = { horizontal: 'center', vertical: 'middle' }

export const FULL_IMAGE_CROP: ImageCrop = { x: 0, y: 0, width: 1, height: 1 }

export interface ImageRect {
  x: number
  y: number
  width: number
  height: number
}

type ImageBox = Pick<ImageShape, 'x' | 'y' | 'width' | 'height'>

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

// The crop as drawn: inside the image and not empty. Unset, or anything
// written via the API that cannot be drawn, is the whole image.
export function getImageCrop(crop: ImageCrop | undefined): ImageCrop {
  if (!crop || ![crop.x, crop.y, crop.width, crop.height].every(Number.isFinite)) return FULL_IMAGE_CROP
  const x = clamp01(crop.x)
  const y = clamp01(crop.y)
  const width = Math.min(crop.width, 1 - x)
  const height = Math.min(crop.height, 1 - y)
  return width > 0 && height > 0 ? { x, y, width, height } : FULL_IMAGE_CROP
}

// 0 at the start of the axis, 1 at its end, centred for anything else.
const alignFactor = (value: string | undefined, start: string, end: string) =>
  value === start ? 0 : value === end ? 1 : 0.5

/**
 * Where the whole image is drawn, stretched, so that its cropped part lands
 * in the box as `fit` and `align` place it. Same coordinate space as the
 * box. The rect may overflow the box ('cover', or any crop): the caller
 * clips to the box.
 */
export function getImageLayout(
  shape: ImageBox & Pick<ImageShape, 'fit' | 'align' | 'crop'>,
  natural: ImageSize,
): ImageRect {
  const crop = getImageCrop(shape.crop)
  const cropWidth = crop.width * natural.width
  const cropHeight = crop.height * natural.height

  // The size of the cropped part in the box. 'fill' — and an image of no
  // size, which has no proportions to keep — takes the box's.
  let width = shape.width
  let height = shape.height
  if (shape.fit !== 'fill' && cropWidth > 0 && cropHeight > 0) {
    const scaleX = shape.width / cropWidth
    const scaleY = shape.height / cropHeight
    const scale = shape.fit === 'cover' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY)
    width = cropWidth * scale
    height = cropHeight * scale
  }

  // Its place in the box: the same formula for the gap 'contain' leaves and
  // the overflow 'cover' cuts off, where `shape.width - width` is negative.
  const x = shape.x + (shape.width - width) * alignFactor(shape.align?.horizontal, 'left', 'right')
  const y = shape.y + (shape.height - height) * alignFactor(shape.align?.vertical, 'top', 'bottom')

  // From the cropped part out to the whole image.
  const fullWidth = width / crop.width
  const fullHeight = height / crop.height
  return {
    x: x - crop.x * fullWidth,
    y: y - crop.y * fullHeight,
    width: fullWidth,
    height: fullHeight,
  }
}

// At most half the box's shorter side, as react-pdf clamps the radius of the
// clip. SVG would clamp each axis on its own, rounding long sides into
// elliptical corners the PDF does not draw.
export function getImageCornerRadius(shape: ImageBox & Pick<ImageShape, 'cornerRadius'>): number {
  const radius = shape.cornerRadius ?? 0
  if (!Number.isFinite(radius)) return 0
  return Math.max(0, Math.min(radius, shape.width / 2, shape.height / 2))
}

export function getImageOpacity(shape: Pick<ImageShape, 'opacity'>): number {
  return shape.opacity !== undefined && Number.isFinite(shape.opacity) ? clamp01(shape.opacity) : 1
}
