/**
 * Font faces of the document.
 *
 * Registers, through the CSS Font Loading API, the same files under the same
 * family names, weights and styles as the PDF export registers with react-pdf
 * (backend `config/fonts.ts`), so `resolveFontFace` picks the same face on
 * both sides.
 */

import {
  BUILTIN_FONTS,
  BUILTIN_FONT_FAMILIES,
  FONT_VARIANTS,
  FONT_VARIANT_STYLE,
  importedFontFamilyName,
} from '@imprime/sdk'
import type { FontDTO, FontVariant } from '@imprime/sdk'
import { fontsAPI } from './api/api'

// URL Vite serves each built-in font file at, keyed by file name. Only the
// font files: the folder also holds their licenses.
const builtinFontUrls = new Map(
  Object.entries(
    import.meta.glob<string>('../../common/src/assets/fonts/*.{ttf,otf}', { query: '?url', import: 'default', eager: true })
  ).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1), url])
)

function faceDescriptors(variant: FontVariant): FontFaceDescriptors {
  const { fontWeight, fontStyle } = FONT_VARIANT_STYLE[variant]
  return { weight: fontWeight, style: fontStyle }
}

/**
 * Adds every built-in face to the document. Like an `@font-face` rule, a face
 * is only downloaded the first time text uses it.
 */
export function registerBuiltinFonts(): void {
  for (const family of BUILTIN_FONT_FAMILIES) {
    const files: Partial<Record<FontVariant, string>> = BUILTIN_FONTS[family].files
    for (const variant of FONT_VARIANTS) {
      const file = files[variant]
      if (!file) continue

      const url = builtinFontUrls.get(file)
      if (!url) {
        console.error(`Font file ${file} is missing from common/src/assets/fonts`)
        continue
      }
      document.fonts.add(new FontFace(family, `url(${JSON.stringify(url)})`, faceDescriptors(variant)))
    }
  }
}

// One load per registered family name. The name carries the font's version,
// so a replaced face is fetched again under a new name.
const importedFontLoads = new Map<string, Promise<void>>()

/**
 * Downloads an imported font's faces and adds them to the document; resolves
 * once text can be drawn with it. Repeated calls share one load, and a failed
 * one is forgotten so the next call retries.
 */
export function registerImportedFont(font: FontDTO.Response): Promise<void> {
  const family = importedFontFamilyName(font)
  let load = importedFontLoads.get(family)
  if (!load) {
    load = loadImportedFont(font, family)
    importedFontLoads.set(family, load)
    load.catch(() => importedFontLoads.delete(family))
  }
  return load
}

async function loadImportedFont(font: FontDTO.Response, family: string): Promise<void> {
  const variants = FONT_VARIANTS.filter(variant => font.faces[variant] !== undefined)

  await Promise.all(variants.map(async variant => {
    const { data } = await fontsAPI.getFace(font._id, variant)
    const face = new FontFace(family, base64ToArrayBuffer(data), faceDescriptors(variant))
    await face.load()
    document.fonts.add(face)
  }))
}

function base64ToArrayBuffer(data: string): ArrayBuffer {
  return Uint8Array.from(atob(data), char => char.charCodeAt(0)).buffer
}
