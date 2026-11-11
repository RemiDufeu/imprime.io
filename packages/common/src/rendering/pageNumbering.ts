import type { Page, PageNumbering, PageSize, TextBoxShape } from '../types.js'
import { DEFAULT_FONT_SIZE, DEFAULT_LINE_HEIGHT } from './pageContentStyles.js'

// The id of a template's page-number box wherever it is drawn: on every page
// at once, unique within each. No shape of a page may take it.
export const PAGE_NUMBER_SHAPE_ID = 'page-number'

/**
 * The box a template's numbering starts with: the page's number, right-aligned
 * at the bottom right of the page. Slate keeps an inline element between two
 * text leaves, so the paragraph is written that way.
 */
export function createPageNumberBox(pageSize: PageSize): TextBoxShape {
  const margin = Math.round(Math.min(pageSize.width, pageSize.height) * 0.04)
  const width = Math.round(pageSize.width * 0.2)
  const height = Math.ceil(DEFAULT_FONT_SIZE * DEFAULT_LINE_HEIGHT)
  return {
    id: PAGE_NUMBER_SHAPE_ID,
    type: 'text',
    name: 'Page number',
    x: pageSize.width - margin - width,
    y: pageSize.height - margin - height,
    width,
    height,
    verticalAlign: 'bottom',
    paragraphes: [{
      type: 'paragraph',
      align: 'right',
      children: [
        { text: '' },
        { type: 'page-number', kind: 'current', children: [{ text: '' }] },
        { text: '' },
      ],
    }],
  }
}

/**
 * Whether the page-number box is drawn on a page of the PDF: `page` is the
 * authored page it is a copy of, and `index` its place in the PDF, 0-based.
 */
export function showsPageNumber(numbering: PageNumbering | undefined, page: Page, index: number): boolean {
  if (!numbering || page.hidePageNumber === true) return false
  return !(index === 0 && numbering.skipFirstPage === true)
}
