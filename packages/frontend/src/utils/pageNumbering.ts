import type { Page, PageNumbering, Shape, Template, TextBoxShape } from '@imprime/sdk'
import { PAGE_NUMBER_SHAPE_ID } from '@imprime/sdk'

/**
 * The template's page-number box, in the editor's copy of the document, is a
 * shape of every page that shows it — last, over the page's own shapes — so
 * that selecting, moving, typing in and undoing it go as they go for any
 * shape. It is the template's all the same: the write path takes it back out
 * of a page before saving (`splitPageNumberBox`), into
 * `template.pageNumbering`, and puts the new box on every page. Whether a page
 * shows it is that page's `hidePageNumber`; deleting the box from a page
 * hides it there.
 */
export const isPageNumberBox = (shape: Pick<Shape, 'id'>): boolean => shape.id === PAGE_NUMBER_SHAPE_ID

// `page` with the box last among its shapes when it shows it, and without it
// otherwise. The same page when it already is.
export function withPageNumberBox(page: Page, numbering: PageNumbering | undefined): Page {
  const own = page.shapes.filter(shape => !isPageNumberBox(shape))
  const shown = numbering !== undefined && page.hidePageNumber !== true
  const shapes = shown ? [...own, numbering.box] : own
  const unchanged = shapes.length === page.shapes.length && shapes.every((shape, index) => shape === page.shapes[index])
  return unchanged ? page : { ...page, shapes }
}

// The template as the editor holds it: the box on every page that shows it.
export function withPageNumbering(template: Template): Template {
  return { ...template, pages: template.pages.map(page => withPageNumberBox(page, template.pageNumbering)) }
}

// A page's own shapes, and the box if the page shows it — the very object, so
// that an unchanged box compares equal to the template's. Only at the root,
// where the editor keeps it: the box cannot enter a group.
export function splitPageNumberBox(shapes: Shape[]): { shapes: Shape[]; box: TextBoxShape | undefined } {
  const box = shapes.find(isPageNumberBox)
  return {
    shapes: shapes.filter(shape => !isPageNumberBox(shape)),
    box: box?.type === 'text' ? box : undefined,
  }
}
