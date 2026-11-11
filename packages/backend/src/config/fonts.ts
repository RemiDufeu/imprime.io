import { Font } from '@react-pdf/renderer'
import {
  BUILTIN_FONTS,
  BUILTIN_FONT_FAMILIES,
  FONT_VARIANTS,
  FONT_VARIANT_STYLE,
  importedFontFamilyName,
  type FontDTO,
  type FontVariant,
  type FontVerticalMetrics,
  type RunFontFace,
} from '@imprime/common'
import type { FontWithFiles } from '../services/FontService.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Font registration for @react-pdf/renderer.
 *
 * The editor registers the same files under the same family names, with the
 * same weight and style per face (frontend `fonts/fontLoader.ts`), and both
 * sides resolve a run through `resolveFontFace` in common.
 */

// The same path from src/config/ (dev, tsx) and from dist/services/ — the
// bundled PDF worker, pdfWorker.js, the only thread that registers fonts —
// both one directory below the package's. Moving either breaks font loading
// at runtime, with no compile error.
function builtinFontsDirectory(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, '../../../common/src/assets/fonts')
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

/**
 * Vertical metrics of a registered face as react-pdf lays text out with them:
 * read from the fontkit font its registry loads for that face — the `hhea`
 * ascent and descent — which the render then reuses.
 */
export async function loadFaceMetrics(face: RunFontFace): Promise<FontVerticalMetrics | undefined> {
  const source = Font.getFont(face)
  await source.load()
  const font = source.data
  if (!font) return undefined
  return { ascent: font.ascent / font.unitsPerEm, descent: -font.descent / font.unitsPerEm }
}

// Imported fonts registered so far, by registered family name, each as it was
// registered (without the faces whose file was missing). react-pdf's registry
// belongs to the thread that loads it — a PDF worker's (`pdfDocument.ts`) —
// and cannot drop one family, only clear them all, so each version, once
// registered, stays for the life of that worker.
const registeredImportedFonts = new Map<string, FontDTO.Response>()

/** Registered family names of the imported fonts this thread holds. */
export function registeredImportedFontFamilies(): string[] {
  return [...registeredImportedFonts.keys()]
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
