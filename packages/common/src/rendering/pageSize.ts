import type { PageSize } from '../types.js'

// The size of every template made before formats existed — still the size of
// one created without asking for any.
export const DEFAULT_PAGE_SIZE: PageSize = { width: 1920, height: 1080 }

export type PageFormatId = 'a4-portrait' | 'a4-landscape' | '16:9'

export interface PageFormat {
  id: PageFormatId
  label: string
  size: PageSize
}

// The sizes offered when a template is created; any other is a custom size.
// A4 is drawn at 150 dpi, so that DEFAULT_FONT_SIZE comes out near 11.5 pt
// once the page is printed on A4.
export const PAGE_FORMATS: readonly PageFormat[] = [
  { id: 'a4-portrait', label: 'A4 portrait', size: { width: 1240, height: 1754 } },
  { id: 'a4-landscape', label: 'A4 landscape', size: { width: 1754, height: 1240 } },
  { id: '16:9', label: '16:9', size: DEFAULT_PAGE_SIZE },
]

// Bounds of either side of a page. The upper one is PDF's own limit on a page
// side, 14 400 points, since one unit is one point in the export.
export const MIN_PAGE_DIMENSION = 100
export const MAX_PAGE_DIMENSION = 14400

// The only definition of an acceptable page size: the API refuses anything
// else, and the editor offers nothing else.
export function isValidPageSize(size: unknown): size is PageSize {
  if (typeof size !== 'object' || size === null || !('width' in size) || !('height' in size)) return false
  return isValidPageDimension(size.width) && isValidPageDimension(size.height)
}

function isValidPageDimension(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
    && value >= MIN_PAGE_DIMENSION && value <= MAX_PAGE_DIMENSION
}

// The preset `size` is exactly, if any.
export function findPageFormat(size: PageSize): PageFormat | undefined {
  return PAGE_FORMATS.find(f => f.size.width === size.width && f.size.height === size.height)
}
