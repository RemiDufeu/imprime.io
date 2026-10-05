/**
 * Page Content Styles
 *
 * Styling of a text box's content. Lives in `common` so the editor's
 * foreignObject and the PDF export describe the same box: same reset, same
 * typography, same flow direction, and the same reading of every paragraph and
 * run formatting field.
 *
 * Every helper returns values valid both as CSS and as `@react-pdf/renderer`
 * style, so each renderer spreads them as-is.
 */

import type { CSSProperties } from 'react'
import type { FontVariant, Paragraph, TextAlign, TextFormatting, TextVerticalAlign } from '../types.js'
import { DEFAULT_FONT, FONT_VARIANT_STYLE, type FontCatalog } from '../fonts.js'

// Font size, in px, of a run with no `fontSize`.
export const DEFAULT_FONT_SIZE = 24
// Line height of a paragraph with no `lineHeight`, as a multiplier of each
// run's font size.
export const DEFAULT_LINE_HEIGHT = 1.5
// Vertical space between two paragraphs of the same box, in px. None after the
// last one.
export const PARAGRAPH_SPACING = 8

const TEXT_ALIGNS: readonly TextAlign[] = ['left', 'center', 'right', 'justify']

export interface ParagraphStyle {
  textAlign: TextAlign
  lineHeight: number
}

/**
 * Block formatting of a paragraph, with unset fields resolved to their legacy
 * meaning. Shapes are stored as Mixed and writable through the API, so an
 * unknown alignment or a non-positive line height falls back to the default
 * rather than reaching a renderer.
 */
export function getParagraphStyle(paragraph: Paragraph): ParagraphStyle {
  const { align, lineHeight } = paragraph

  return {
    textAlign: align !== undefined && TEXT_ALIGNS.includes(align) ? align : 'left',
    lineHeight: typeof lineHeight === 'number' && Number.isFinite(lineHeight) && lineHeight > 0
      ? lineHeight
      : DEFAULT_LINE_HEIGHT,
  }
}

/**
 * A run's `fontSize` (a CSS length such as '28px', as the editor stores it) in
 * px. Unset or unparsable falls back to DEFAULT_FONT_SIZE.
 */
export function parseFontSize(fontSize: string | undefined): number {
  const size = fontSize ? parseInt(fontSize) : NaN
  return Number.isFinite(size) && size > 0 ? size : DEFAULT_FONT_SIZE
}

/**
 * `textDecoration` of a run. Underline and strikethrough are two independent
 * marks that share one style property, so both renderers combine them here.
 */
export function getTextDecoration(
  node: TextFormatting
): 'underline' | 'line-through' | 'underline line-through' | undefined {
  if (node.underline && node.strikethrough) return 'underline line-through'
  if (node.underline) return 'underline'
  if (node.strikethrough) return 'line-through'
  return undefined
}

export function getTextTransform(node: TextFormatting): 'uppercase' | undefined {
  return node.uppercase ? 'uppercase' : undefined
}

export interface RunFontFace {
  // The registered family name, not the one the run stores.
  fontFamily: string
  fontWeight: 'normal' | 'bold'
  fontStyle: 'normal' | 'italic'
}

// Faces tried, in order, for each requested one. Neither renderer synthesises
// a face the family lacks — react-pdf cannot, and the editor sets
// `font-synthesis: none` — so a missing one falls back to the closest it has.
// Every family has `regular`.
const VARIANT_FALLBACKS: Record<FontVariant, readonly FontVariant[]> = {
  regular: ['regular'],
  bold: ['bold', 'regular'],
  italic: ['italic', 'regular'],
  boldItalic: ['boldItalic', 'bold', 'italic', 'regular'],
}

/** The face of `variants` a run with these marks is drawn with. */
export function resolveFontVariant(
  variants: readonly FontVariant[],
  bold: boolean | undefined,
  italic: boolean | undefined
): FontVariant {
  const requested: FontVariant = bold && italic ? 'boldItalic' : bold ? 'bold' : italic ? 'italic' : 'regular'
  return VARIANT_FALLBACKS[requested].find(variant => variants.includes(variant)) ?? 'regular'
}

/**
 * The registered face a run is drawn with. A family the catalog does not know
 * — unset, misspelt through the API, or an imported font since deleted — is
 * drawn in DEFAULT_FONT.
 */
export function resolveFontFace(node: TextFormatting, catalog: FontCatalog): RunFontFace {
  const entry = (node.fontFamily !== undefined ? catalog.get(node.fontFamily) : undefined)
    ?? catalog.get(DEFAULT_FONT)
  if (!entry) return { fontFamily: DEFAULT_FONT, ...FONT_VARIANT_STYLE.regular }

  const variant = resolveFontVariant(entry.variants, node.bold, node.italic)
  return { fontFamily: entry.registeredFamily, ...FONT_VARIANT_STYLE[variant] }
}

export interface RunTextStyle extends RunFontFace {
  fontSize: number
  textDecoration: ReturnType<typeof getTextDecoration>
  textTransform: ReturnType<typeof getTextTransform>
}

/**
 * Typography of a run, literal or variable. Colour is left to each renderer:
 * react-pdf needs the alpha split out of it.
 */
export function getRunTextStyle(node: TextFormatting, catalog: FontCatalog): RunTextStyle {
  return {
    ...resolveFontFace(node, catalog),
    fontSize: parseFontSize(node.fontSize),
    textDecoration: getTextDecoration(node),
    textTransform: getTextTransform(node),
  }
}

/**
 * Main-axis placement of the paragraph stack in its column-flex box. A switch
 * rather than a lookup table so a stray API value cannot hit a prototype key.
 */
export function getVerticalJustify(
  verticalAlign: TextVerticalAlign | undefined
): 'flex-start' | 'center' | 'flex-end' {
  switch (verticalAlign) {
    case 'middle':
      return 'center'
    case 'bottom':
      return 'flex-end'
    default:
      return 'flex-start'
  }
}

/**
 * Inline styles for the page content wrapper div.
 * Mainly a reset — Ant Design's global styles otherwise leak into the canvas.
 */
export function getPageContentWrapperStyles(verticalAlign?: TextVerticalAlign): CSSProperties {
  return {
    // Reset and typography
    // What a run with no `fontFamily` is drawn in by the export.
    fontFamily: DEFAULT_FONT,
    // A face the family lacks is not faked: react-pdf cannot do it.
    fontSynthesis: 'none',
    fontSize: DEFAULT_FONT_SIZE,
    lineHeight: DEFAULT_LINE_HEIGHT,
    letterSpacing: 'normal',
    color: '#000000',

    // Layout
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: getVerticalJustify(verticalAlign),
    overflow: 'visible',

    // Preserve whitespace and line breaks
    whiteSpace: 'pre-wrap',

    // Box model
    boxSizing: 'content-box',
    margin: 0,
    padding: 0,
  }
}
