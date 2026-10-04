/**
 * List Styles
 *
 * Bulleted and numbered lists in a text box. A list item is a paragraph with
 * `list` set; nesting is its `indent`. Everything a renderer needs to draw an
 * item — which marker, its numbering, and where the marker and the text sit —
 * is decided here, so the editor and the PDF cannot number or indent the same
 * item differently.
 *
 * Bullets are *drawn* (a box with a radius and a border), not typed: none of
 * the bundled PDF fonts has a glyph for ◦ or ▪, and the browser would silently
 * substitute one from another font where the PDF cannot.
 */

import type { CustomText, ListType, Paragraph, TextFormatting, VariableElement } from '../types.js'
import { getParagraphStyle, parseFontSize } from './slideContentStyles.js'

// Deepest nesting level; levels run from 0 to this.
export const MAX_LIST_LEVEL = 3

// Width of one indentation step, and of the marker slot, in em of the marker's
// font size. 2em is what `10.` needs in a monospaced font (3 × 0.6em) and
// still leave a gap before the text.
const LIST_INDENT_EM = 2
const BULLET_SIZE_EM = 0.35
// Gap between the start of the marker column and the bullet.
const BULLET_INSET_EM = 0.2
const CIRCLE_STROKE_EM = 0.07

const LIST_TYPES: readonly ListType[] = ['bullet', 'number']

export interface ListStyle {
  list: ListType
  level: number
}

/**
 * List membership of a paragraph, or null for a plain paragraph. Sanitised:
 * shapes are stored as Mixed and writable through the API, so an unknown type
 * is not a list and the level is clamped to an integer in [0, MAX_LIST_LEVEL].
 */
export function getListStyle(paragraph: Paragraph): ListStyle | null {
  const { list, indent } = paragraph
  if (list === undefined || !LIST_TYPES.includes(list)) return null

  const level = typeof indent === 'number' && Number.isFinite(indent)
    ? Math.min(MAX_LIST_LEVEL, Math.max(0, Math.trunc(indent)))
    : 0

  return { list, level }
}

export type BulletShape = 'disc' | 'circle' | 'square'

export type ListMarker =
  | { kind: 'bullet'; shape: BulletShape }
  | { kind: 'number'; text: string }

// Marker styles cycle with depth, as in word processors.
const BULLET_SHAPES: readonly BulletShape[] = ['disc', 'circle', 'square']

// 1 → a, 26 → z, 27 → aa.
function toAlpha(n: number): string {
  let s = ''
  for (let rest = n; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    s = String.fromCharCode(97 + ((rest - 1) % 26)) + s
  }
  return s
}

const ROMAN: readonly [number, string][] = [
  [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'],
  [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
]

function toRoman(n: number): string {
  let s = ''
  let rest = n
  for (const [value, numeral] of ROMAN) {
    for (; rest >= value; rest -= value) s += numeral
  }
  return s
}

function formatNumber(n: number, level: number): string {
  switch (level % 3) {
    case 1:
      return `${toAlpha(n)}.`
    case 2:
      return `${toRoman(n)}.`
    default:
      return `${n}.`
  }
}

/**
 * The marker of every paragraph of a text box, index for index; null for a
 * plain paragraph. Numbering rules:
 * - consecutive items at the same level and of the same type count up;
 * - an item resets the counters of every deeper level;
 * - a change of type at a level, or any plain paragraph, restarts at 1.
 */
export function getListMarkers(paragraphes: Paragraph[]): (ListMarker | null)[] {
  let counters: number[] = []
  let types: ListType[] = []

  return paragraphes.map(paragraph => {
    const style = getListStyle(paragraph)
    if (!style) {
      counters = []
      types = []
      return null
    }

    const { list, level } = style
    counters = counters.slice(0, level + 1)
    types = types.slice(0, level + 1)
    const count = types[level] === list ? (counters[level] ?? 0) + 1 : 1
    counters[level] = count
    types[level] = list

    return list === 'bullet'
      ? { kind: 'bullet', shape: BULLET_SHAPES[level % BULLET_SHAPES.length] }
      : { kind: 'number', text: formatNumber(count, level) }
  })
}

/**
 * Formatting the marker takes from its item: that of the first run with
 * visible content. Slate keeps an empty text leaf before an inline variable,
 * and its marks say nothing about how the item looks, so it is skipped.
 */
export function getListMarkerFormatting(paragraph: Paragraph): TextFormatting {
  const isVisible = (child: CustomText | VariableElement) => !('text' in child) || child.text !== ''
  const source = paragraph.children.find(isVisible) ?? paragraph.children[0]

  return {
    fontFamily: source?.fontFamily,
    fontSize: source?.fontSize,
    color: source?.color,
  }
}

/**
 * Geometry of a list item, in px, relative to the item's own box.
 *
 * Both renderers build an item the same way: a box padded left by
 * `textIndent`, where the text starts and wraps back to (a hanging indent),
 * and the marker absolutely positioned inside that padding at `markerLeft`,
 * top-aligned with the first line. Being absolute, a marker wider than its
 * slot (`xviii.`, or `10.` in a monospaced font) overflows onto the text on
 * one line rather than wrapping — the same in CSS (`nowrap`) and in react-pdf.
 */
export interface ListLayout {
  fontSize: number        // marker font size
  lineHeight: number      // the item's line-height multiplier, for a number marker
  textIndent: number
  markerLeft: number
  firstLineHeight: number // the first line box, which a bullet is centred on
}

export function getListLayout(paragraph: Paragraph, style: ListStyle): ListLayout {
  const fontSize = parseFontSize(getListMarkerFormatting(paragraph).fontSize)
  const { lineHeight } = getParagraphStyle(paragraph)
  const step = LIST_INDENT_EM * fontSize

  return {
    fontSize,
    lineHeight,
    textIndent: (style.level + 1) * step,
    markerLeft: style.level * step,
    firstLineHeight: lineHeight * fontSize,
  }
}

export interface BulletBox {
  left: number
  top: number
  size: number
  borderRadius: number
  borderWidth: number // stroke of a hollow bullet; 0 for a filled one
  filled: boolean
}

// A drawn bullet, positioned like a marker (relative to the item's box).
export function getBulletBox(shape: BulletShape, layout: ListLayout): BulletBox {
  const size = BULLET_SIZE_EM * layout.fontSize

  return {
    left: layout.markerLeft + BULLET_INSET_EM * layout.fontSize,
    top: (layout.firstLineHeight - size) / 2,
    size,
    borderRadius: shape === 'square' ? 0 : size / 2,
    borderWidth: shape === 'circle' ? Math.max(1, CIRCLE_STROKE_EM * layout.fontSize) : 0,
    filled: shape !== 'circle',
  }
}
