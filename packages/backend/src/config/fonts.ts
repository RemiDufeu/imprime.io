import { Font } from '@react-pdf/renderer'
import { AVAILABLE_FONTS, DEFAULT_FONT, FONT_FILES, type FontFamily } from '@imprime/common'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Font Configuration for @react-pdf/renderer
 *
 * SIMPLE RULES:
 * - Only locally downloaded fonts are used
 * - NO font substitution (Arial stays Arial, not replaced by Roboto)
 * - Fallback is ALWAYS from @imprime/common
 */

// Flag to track if fonts have been registered
let fontsRegistered = false

// Re-export from common for convenience
export { AVAILABLE_FONTS, DEFAULT_FONT }

/**
 * Register fonts from common/assets/fonts
 * Fonts are registered with their ACTUAL names (not substitutes)
 */
function registerCustomFonts(): void {
  if (fontsRegistered) return

  // Resolve fonts directory. Works both in dev (tsx from src/config/) and
  // when bundled by esbuild into dist/server.js (depth differs by one).
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.resolve(here, '../../../common/src/assets/fonts'), // dev: src/config/
    path.resolve(here, '../../common/src/assets/fonts'),    // bundled: dist/
  ]
  const resolved = candidates.find(p => existsSync(p)) ?? candidates[0]
  const normalizedPath = resolved.endsWith(path.sep) ? resolved : resolved + path.sep

  // Register each font family dynamically based on FONT_FILES
  for (const fontFamily of AVAILABLE_FONTS) {
    const fontConfig = FONT_FILES[fontFamily]
    const fonts: Array<{ src: string; fontWeight?: 'normal' | 'bold'; fontStyle?: 'normal' | 'italic' }> = []

    if (fontConfig.regular) {
      const ext = fontFamily === 'Crimson Text' ? 'otf' : 'ttf'
      fonts.push({ src: `${normalizedPath}${fontConfig.regular}.${ext}` })
    }

    if (fontConfig.bold) {
      const ext = fontFamily === 'Crimson Text' ? 'otf' : 'ttf'
      fonts.push({
        src: `${normalizedPath}${fontConfig.bold}.${ext}`,
        fontWeight: 'bold'
      })
    }

    if ('italic' in fontConfig && fontConfig.italic) {
      const ext = fontFamily === 'Crimson Text' ? 'otf' : 'ttf'
      fonts.push({
        src: `${normalizedPath}${fontConfig.italic}.${ext}`,
        fontStyle: 'italic'
      })
    }

    if ('boldItalic' in fontConfig && fontConfig.boldItalic) {
      const ext = fontFamily === 'Crimson Text' ? 'otf' : 'ttf'
      fonts.push({
        src: `${normalizedPath}${fontConfig.boldItalic}.${ext}`,
        fontWeight: 'bold',
        fontStyle: 'italic'
      })
    }

    Font.register({
      family: fontFamily,
      fonts
    })
  }

  fontsRegistered = true
}

// Re-export normalizeFontFamily from common
export { normalizeFontFamily } from '@imprime/common'

/**
 * Returns font style properties for text formatting
 */
export function getFontStyleProps(bold: boolean = false, italic: boolean = false) {
  return {
    fontWeight: bold ? ('bold') : ('normal'),
    fontStyle: italic ? ('italic') : ('normal')
  }
}

/**
 * Initialize font registration
 */
export function initializeFonts(): void {
  registerCustomFonts()
}
