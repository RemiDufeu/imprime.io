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

// Largest file an imported face may have. Faces are uploaded one per request:
// 5 MB base64-encodes to about 6.7 MB, inside the API's 10 MB body limit. Each
// is stored in its own document, well under MongoDB's 16 MB limit.
export const MAX_FONT_FILE_SIZE_MB = 5
export const MAX_FONT_FILE_SIZE = MAX_FONT_FILE_SIZE_MB * 1024 * 1024

// Weight and style each variant is registered with — `FontFace` descriptors in
// the editor, `Font.register` options in the export.
export const FONT_VARIANT_STYLE: Record<FontVariant, { fontWeight: 'normal' | 'bold'; fontStyle: 'normal' | 'italic' }> = {
  regular: { fontWeight: 'normal', fontStyle: 'normal' },
  bold: { fontWeight: 'bold', fontStyle: 'normal' },
  italic: { fontWeight: 'normal', fontStyle: 'italic' },
  boldItalic: { fontWeight: 'bold', fontStyle: 'italic' },
}

type FontFiles = { regular: string } & Partial<Record<Exclude<FontVariant, 'regular'>, string>>

// How the font menu groups built-in families (Google Fonts' classification).
export type FontCategory = 'sans-serif' | 'serif' | 'monospace' | 'display' | 'handwriting'

interface BuiltinFont {
  category: FontCategory
  files: FontFiles
}

/**
 * Built-in families: their category and the file of each face they provide,
 * in `src/assets/fonts/` (static TrueType/OpenType instances from Google
 * Fonts; licenses in `licenses/`). A face left out is not drawn by synthesis on
 * either side: the run falls back to the closest face the family has.
 */
export const BUILTIN_FONTS = {
  'Roboto': {
    category: 'sans-serif',
    files: {
      regular: 'Roboto-Regular.ttf',
      bold: 'Roboto-Bold.ttf',
      italic: 'Roboto-Italic.ttf',
      boldItalic: 'Roboto-BoldItalic.ttf',
    },
  },
  'Open Sans': {
    category: 'sans-serif',
    files: {
      regular: 'OpenSans-Regular.ttf',
      bold: 'OpenSans-Bold.ttf',
      italic: 'OpenSans-Italic.ttf',
      boldItalic: 'OpenSans-BoldItalic.ttf',
    },
  },
  'Inter': {
    category: 'sans-serif',
    files: {
      regular: 'Inter-Regular.ttf',
      bold: 'Inter-Bold.ttf',
      italic: 'Inter-Italic.ttf',
      boldItalic: 'Inter-BoldItalic.ttf',
    },
  },
  'Lato': {
    category: 'sans-serif',
    files: {
      regular: 'Lato-Regular.ttf',
      bold: 'Lato-Bold.ttf',
      italic: 'Lato-Italic.ttf',
      boldItalic: 'Lato-BoldItalic.ttf',
    },
  },
  'Montserrat': {
    category: 'sans-serif',
    files: {
      regular: 'Montserrat-Regular.ttf',
      bold: 'Montserrat-Bold.ttf',
      italic: 'Montserrat-Italic.ttf',
      boldItalic: 'Montserrat-BoldItalic.ttf',
    },
  },
  'Noto Sans': {
    category: 'sans-serif',
    files: {
      regular: 'NotoSans-Regular.ttf',
      bold: 'NotoSans-Bold.ttf',
      italic: 'NotoSans-Italic.ttf',
      boldItalic: 'NotoSans-BoldItalic.ttf',
    },
  },
  'Nunito': {
    category: 'sans-serif',
    files: {
      regular: 'Nunito-Regular.ttf',
      bold: 'Nunito-Bold.ttf',
      italic: 'Nunito-Italic.ttf',
      boldItalic: 'Nunito-BoldItalic.ttf',
    },
  },
  'Poppins': {
    category: 'sans-serif',
    files: {
      regular: 'Poppins-Regular.ttf',
      bold: 'Poppins-Bold.ttf',
      italic: 'Poppins-Italic.ttf',
      boldItalic: 'Poppins-BoldItalic.ttf',
    },
  },
  'Raleway': {
    category: 'sans-serif',
    files: {
      regular: 'Raleway-Regular.ttf',
      bold: 'Raleway-Bold.ttf',
      italic: 'Raleway-Italic.ttf',
      boldItalic: 'Raleway-BoldItalic.ttf',
    },
  },
  'Roboto Condensed': {
    category: 'sans-serif',
    files: {
      regular: 'RobotoCondensed-Regular.ttf',
      bold: 'RobotoCondensed-Bold.ttf',
      italic: 'RobotoCondensed-Italic.ttf',
      boldItalic: 'RobotoCondensed-BoldItalic.ttf',
    },
  },
  'Source Sans 3': {
    category: 'sans-serif',
    files: {
      regular: 'SourceSans3-Regular.ttf',
      bold: 'SourceSans3-Bold.ttf',
      italic: 'SourceSans3-Italic.ttf',
      boldItalic: 'SourceSans3-BoldItalic.ttf',
    },
  },
  'Work Sans': {
    category: 'sans-serif',
    files: {
      regular: 'WorkSans-Regular.ttf',
      bold: 'WorkSans-Bold.ttf',
      italic: 'WorkSans-Italic.ttf',
      boldItalic: 'WorkSans-BoldItalic.ttf',
    },
  },
  'Oswald': {
    category: 'sans-serif',
    files: {
      regular: 'Oswald-Regular.ttf',
      bold: 'Oswald-Bold.ttf',
    },
  },
  'Merriweather': {
    category: 'serif',
    files: {
      regular: 'Merriweather-Regular.ttf',
      bold: 'Merriweather-Bold.ttf',
      italic: 'Merriweather-Italic.ttf',
      boldItalic: 'Merriweather-BoldItalic.ttf',
    },
  },
  'Crimson Text': {
    category: 'serif',
    files: {
      regular: 'CrimsonText-Regular.otf',
      bold: 'CrimsonText-Bold.otf',
      italic: 'CrimsonText-Italic.otf',
      boldItalic: 'CrimsonText-BoldItalic.otf',
    },
  },
  'EB Garamond': {
    category: 'serif',
    files: {
      regular: 'EBGaramond-Regular.ttf',
      bold: 'EBGaramond-Bold.ttf',
      italic: 'EBGaramond-Italic.ttf',
      boldItalic: 'EBGaramond-BoldItalic.ttf',
    },
  },
  'Lora': {
    category: 'serif',
    files: {
      regular: 'Lora-Regular.ttf',
      bold: 'Lora-Bold.ttf',
      italic: 'Lora-Italic.ttf',
      boldItalic: 'Lora-BoldItalic.ttf',
    },
  },
  'Noto Serif': {
    category: 'serif',
    files: {
      regular: 'NotoSerif-Regular.ttf',
      bold: 'NotoSerif-Bold.ttf',
      italic: 'NotoSerif-Italic.ttf',
      boldItalic: 'NotoSerif-BoldItalic.ttf',
    },
  },
  'Playfair Display': {
    category: 'serif',
    files: {
      regular: 'PlayfairDisplay-Regular.ttf',
      bold: 'PlayfairDisplay-Bold.ttf',
      italic: 'PlayfairDisplay-Italic.ttf',
      boldItalic: 'PlayfairDisplay-BoldItalic.ttf',
    },
  },
  'Roboto Slab': {
    category: 'serif',
    files: {
      regular: 'RobotoSlab-Regular.ttf',
      bold: 'RobotoSlab-Bold.ttf',
    },
  },
  'Courier Prime': {
    category: 'monospace',
    files: {
      regular: 'CourierPrime-Regular.ttf',
      bold: 'CourierPrime-Bold.ttf',
      italic: 'CourierPrime-Italic.ttf',
      boldItalic: 'CourierPrime-BoldItalic.ttf',
    },
  },
  'Roboto Mono': {
    category: 'monospace',
    files: {
      regular: 'RobotoMono-Regular.ttf',
      bold: 'RobotoMono-Bold.ttf',
      italic: 'RobotoMono-Italic.ttf',
      boldItalic: 'RobotoMono-BoldItalic.ttf',
    },
  },
  'Source Code Pro': {
    category: 'monospace',
    files: {
      regular: 'SourceCodePro-Regular.ttf',
      bold: 'SourceCodePro-Bold.ttf',
      italic: 'SourceCodePro-Italic.ttf',
      boldItalic: 'SourceCodePro-BoldItalic.ttf',
    },
  },
  'Anton': {
    category: 'display',
    files: {
      regular: 'Anton-Regular.ttf',
    },
  },
  'Bebas Neue': {
    category: 'display',
    files: {
      regular: 'BebasNeue-Regular.ttf',
    },
  },
  'Comic Neue': {
    category: 'handwriting',
    files: {
      regular: 'ComicNeue-Regular.ttf',
      bold: 'ComicNeue-Bold.ttf',
      italic: 'ComicNeue-Italic.ttf',
      boldItalic: 'ComicNeue-BoldItalic.ttf',
    },
  },
  'Dancing Script': {
    category: 'handwriting',
    files: {
      regular: 'DancingScript-Regular.ttf',
      bold: 'DancingScript-Bold.ttf',
    },
  },
  'Pacifico': {
    category: 'handwriting',
    files: {
      regular: 'Pacifico-Regular.ttf',
    },
  },
} as const satisfies Record<string, BuiltinFont>

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
 * Name an imported family is registered under in both renderers. Tied to the
 * font's id and version rather than its name, so every face update changes it
 * and neither renderer keeps drawing a replaced file from its cache.
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
  // Set for built-in families; an imported one is not classified.
  category?: FontCategory
  imported: boolean
}

// Keyed by `family`.
export type FontCatalog = ReadonlyMap<string, FontCatalogEntry>

/**
 * The built-in families followed by the instance's imported ones. An imported
 * family never shadows a built-in one: the backend refuses the name.
 */
export function createFontCatalog(imported: readonly FontDTO.Response[] = []): FontCatalog {
  const catalog = new Map<string, FontCatalogEntry>()

  for (const family of BUILTIN_FONT_FAMILIES) {
    const { category, files }: BuiltinFont = BUILTIN_FONTS[family]
    catalog.set(family, {
      family,
      registeredFamily: family,
      variants: FONT_VARIANTS.filter(variant => files[variant] !== undefined),
      category,
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
