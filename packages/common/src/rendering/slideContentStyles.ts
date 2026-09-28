/**
 * Slide Content Styles
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
import type { Paragraph, TextAlign, TextFormatting, TextVerticalAlign } from '../types.js'

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
 * Inline styles for the slide content wrapper div.
 * Mainly a reset — Ant Design's global styles otherwise leak into the canvas.
 */
export function getSlideContentWrapperStyles(verticalAlign?: TextVerticalAlign): CSSProperties {
  return {
    // Reset and typography
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif",
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
