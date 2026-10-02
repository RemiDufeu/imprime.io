/**
 * Font Catalog
 *
 * The fonts a run can be drawn with: the built-in families shipped in
 * `src/assets/fonts/`, plus the families an account imported. Both renderers
 * register the same files under the same names and resolve a run through
 * `resolveFontFace`, so the editor and the PDF pick the same face.
 */

import type { FontDTO, FontVariant } from './types.js'

export const FONT_VARIANTS: readonly FontVariant[] = ['regular', 'bold', 'italic', 'boldItalic']

// Largest file an imported face may have, in bytes. Faces are uploaded one per
// request: 4 MB base64-encodes to about 5.4 MB, inside the API's 10 MB body
// limit, and four faces fit MongoDB's 16 MB document limit.
export const MAX_FONT_FILE_SIZE = 4 * 1024 * 1024

// Weight and style each variant is registered with — `FontFace` descriptors in
// the editor, `Font.register` options in the export.
export const FONT_VARIANT_STYLE: Record<FontVariant, { fontWeight: 'normal' | 'bold'; fontStyle: 'normal' | 'italic' }> = {
  regular: { fontWeight: 'normal', fontStyle: 'normal' },
  bold: { fontWeight: 'bold', fontStyle: 'normal' },
  italic: { fontWeight: 'normal', fontStyle: 'italic' },
  boldItalic: { fontWeight: 'bold', fontStyle: 'italic' },
}

type FontFiles = { regular: string } & Partial<Record<Exclude<FontVariant, 'regular'>, string>>

/**
 * Built-in families and the file of each face they provide, in
 * `src/assets/fonts/`. A face left out is not drawn by synthesis on either
 * side: the run falls back to the closest face the family has.
 */
export const BUILTIN_FONTS = {
  'Roboto': {
    regular: 'Roboto-Regular.ttf',
    bold: 'Roboto-Bold.ttf',
    italic: 'Roboto-Italic.ttf',
    boldItalic: 'Roboto-BoldItalic.ttf',
  },
  'Comic Neue': {
    regular: 'ComicNeue-Regular.ttf',
    bold: 'ComicNeue-Bold.ttf',
    italic: 'ComicNeue-Italic.ttf',
    boldItalic: 'ComicNeue-BoldItalic.ttf',
  },
  'Courier Prime': {
    regular: 'CourierPrime-Regular.ttf',
    bold: 'CourierPrime-Bold.ttf',
    italic: 'CourierPrime-Italic.ttf',
    boldItalic: 'CourierPrime-BoldItalic.ttf',
  },
  'Anton': {
    regular: 'Anton-Regular.ttf',
  },
  'Open Sans': {
    regular: 'OpenSans-Regular.ttf',
    bold: 'OpenSans-Bold.ttf',
    italic: 'OpenSans-Italic.ttf',
    boldItalic: 'OpenSans-BoldItalic.ttf',
  },
  'Crimson Text': {
    regular: 'CrimsonText-Regular.otf',
    bold: 'CrimsonText-Bold.otf',
    italic: 'CrimsonText-Italic.otf',
    boldItalic: 'CrimsonText-BoldItalic.otf',
  },
  'Merriweather': {
    regular: 'Merriweather-Regular.ttf',
    bold: 'Merriweather-Bold.ttf',
    italic: 'Merriweather-Italic.ttf',
    boldItalic: 'Merriweather-BoldItalic.ttf',
  },
} as const satisfies Record<string, FontFiles>

export type BuiltinFontFamily = keyof typeof BUILTIN_FONTS

export const BUILTIN_FONT_FAMILIES = Object.keys(BUILTIN_FONTS) as BuiltinFontFamily[]

// Family of a run with no `fontFamily`, or one the catalog does not know.
export const DEFAULT_FONT: BuiltinFontFamily = 'Roboto'

// Built-in families are matched case-insensitively here, so an import cannot
// shadow one under a different case.
export function isBuiltinFontFamily(family: string): boolean {
  const key = family.trim().toLowerCase()
  return BUILTIN_FONT_FAMILIES.some(builtin => builtin.toLowerCase() === key)
}

/**
 * Name an imported family is registered under in both renderers. Unique across
 * accounts, which the family name is not, and changed by every face update so
 * neither renderer keeps drawing a replaced file from its cache.
 */
export function importedFontFamilyName(font: Pick<FontDTO.Response, '_id' | 'version'>): string {
  return `imprime-font-${font._id}-${font.version}`
}

export interface FontCatalogEntry {
  // Name runs store in `fontFamily`.
  family: string
  // Name the renderers registered the faces under.
  registeredFamily: string
  variants: readonly FontVariant[]
  imported: boolean
}

// Keyed by `family`.
export type FontCatalog = ReadonlyMap<string, FontCatalogEntry>

/**
 * The built-in families followed by an account's imported ones. An imported
 * family never shadows a built-in one: the backend refuses the name.
 */
export function createFontCatalog(imported: readonly FontDTO.Response[] = []): FontCatalog {
  const catalog = new Map<string, FontCatalogEntry>()

  for (const family of BUILTIN_FONT_FAMILIES) {
    const files: FontFiles = BUILTIN_FONTS[family]
    catalog.set(family, {
      family,
      registeredFamily: family,
      variants: FONT_VARIANTS.filter(variant => files[variant] !== undefined),
      imported: false,
    })
  }

  for (const font of imported) {
    if (catalog.has(font.family)) continue
    catalog.set(font.family, {
      family: font.family,
      registeredFamily: importedFontFamilyName(font),
      variants: FONT_VARIANTS.filter(variant => font.faces[variant] !== undefined),
      imported: true,
    })
  }

  return catalog
}
