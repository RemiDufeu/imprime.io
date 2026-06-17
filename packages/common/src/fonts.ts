/**
 * Font Configuration
 * Shared between frontend and backend
 */

/**
 * List of available fonts
 * These fonts must have corresponding font files in src/assets/fonts/
 */
export const AVAILABLE_FONTS = [
  'Roboto',
  'Comic Neue',
  'Courier Prime',
  'Anton',
  'Open Sans',
  'Crimson Text',
  'Merriweather',
] as const

/**
 * Default font
 */
export const DEFAULT_FONT = 'Roboto'

/**
 * Font file mappings
 * Maps font family names to their file names (without extension)
 */
export const FONT_FILES = {
  'Roboto': {
    regular: 'Roboto-Regular',
    bold: 'Roboto-Bold',
    italic: 'Roboto-Italic',
    boldItalic: 'Roboto-BoldItalic',
  },
  'Comic Neue': {
    regular: 'ComicNeue-Regular',
    bold: 'ComicNeue-Bold',
    italic: 'ComicNeue-Italic',
    boldItalic: 'ComicNeue-BoldItalic',
  },
  'Courier Prime': {
    regular: 'CourierPrime-Regular',
    bold: 'CourierPrime-Bold',
    italic: 'CourierPrime-Italic',
    boldItalic: 'CourierPrime-BoldItalic',
  },
  'Anton': {
    regular: 'Anton-Regular',
    bold: 'Anton-Regular', // Anton only has regular weight
  },
  'Open Sans': {
    regular: 'OpenSans-Regular',
    bold: 'OpenSans-Bold',
    italic: 'OpenSans-Italic',
    boldItalic: 'OpenSans-BoldItalic',
  },
  'Crimson Text': {
    regular: 'CrimsonText-Regular',
    bold: 'CrimsonText-Bold',
    italic: 'CrimsonText-Italic',
    boldItalic: 'CrimsonText-BoldItalic',
  },
  'Merriweather': {
    regular: 'Merriweather-Regular',
    bold: 'Merriweather-Bold',
    italic: 'Merriweather-Italic',
    boldItalic: 'Merriweather-BoldItalic',
  },
} as const

export type FontFamily = typeof AVAILABLE_FONTS[number]

/**
 * Normalize font family - returns font name or default fallback
 */
export function normalizeFontFamily(fontFamily: string | undefined): FontFamily {
  if (!fontFamily) {
    return DEFAULT_FONT
  }

  if (AVAILABLE_FONTS.includes(fontFamily as FontFamily)) {
    return fontFamily as FontFamily
  }

  return DEFAULT_FONT
}

/**
 * Get font file extension for a given font
 */
export function getFontExtension(fontFamily: FontFamily, variant: 'regular' | 'bold' | 'italic' | 'boldItalic' = 'regular'): string {
  // Crimson Text uses .otf, others use .ttf
  if (fontFamily === 'Crimson Text') {
    return 'otf'
  }
  return 'ttf'
}
