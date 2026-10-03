import { Font } from '@react-pdf/renderer'
import {
  BUILTIN_FONTS,
  BUILTIN_FONT_FAMILIES,
  FONT_VARIANTS,
  FONT_VARIANT_STYLE,
  importedFontFamilyName,
  type FontDTO,
  type FontVariant,
} from '@imprime/common'
import type { FontWithFiles } from '../services/FontService.js'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Font registration for @react-pdf/renderer.
 *
 * The editor registers the same files under the same family names, with the
 * same weight and style per face (frontend `fonts/fontLoader.ts`), and both
 * sides resolve a run through `resolveFontFace` in common.
 */

// Works both in dev (tsx from src/config/) and when bundled by esbuild into
// dist/server.js (depth differs by one).
function builtinFontsDirectory(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.resolve(here, '../../../common/src/assets/fonts'), // dev: src/config/
    path.resolve(here, '../../common/src/assets/fonts'),    // bundled: dist/
  ]
  return candidates.find(p => existsSync(p)) ?? candidates[0]
}

let builtinFontsRegistered = false

export function registerBuiltinFonts(): void {
  if (builtinFontsRegistered) return

  const directory = builtinFontsDirectory()
  for (const family of BUILTIN_FONT_FAMILIES) {
    const files: Partial<Record<FontVariant, string>> = BUILTIN_FONTS[family].files
    Font.register({
      family,
      fonts: FONT_VARIANTS.flatMap(variant => {
        const file = files[variant]
        return file ? [{ src: path.join(directory, file), ...FONT_VARIANT_STYLE[variant] }] : []
      }),
    })
  }

  // By default react-pdf breaks long words with English hyphenation rules,
  // whatever the language; the browser never does. Breaking between words only
  // keeps the PDF's lines where the editor puts them.
  Font.registerHyphenationCallback(word => [word])

  builtinFontsRegistered = true
}

// Imported fonts registered so far, by registered family name, each as it was
// registered (without the faces whose file was missing). react-pdf's registry
// is process-wide and cannot drop one family — only clear them all, which an
// export running meanwhile would not survive — so each version, once
// registered, stays for the life of the process.
const registeredImportedFonts = new Map<string, FontDTO.Response>()

export function isImportedFontRegistered(font: FontDTO.Response): boolean {
  return registeredImportedFonts.has(importedFontFamilyName(font))
}

/**
 * Registers the fonts not registered yet, and returns every one of `fonts` as
 * react-pdf knows it — the catalog an export resolves against. A font already
 * registered may arrive without files: they were not fetched again.
 */
export function registerImportedFonts(fonts: readonly FontWithFiles[]): FontDTO.Response[] {
  return fonts.flatMap(({ font, files }) => {
    const family = importedFontFamilyName(font)
    const registered = registeredImportedFonts.get(family)
    if (registered) return [registered]
    if (!files) return []

    Font.register({
      family,
      fonts: FONT_VARIANTS.flatMap(variant => {
        const data = files[variant]
        return data
          ? [{ src: `data:font/ttf;base64,${data.toString('base64')}`, ...FONT_VARIANT_STYLE[variant] }]
          : []
      }),
    })
    registeredImportedFonts.set(family, font)
    return [font]
  })
}
