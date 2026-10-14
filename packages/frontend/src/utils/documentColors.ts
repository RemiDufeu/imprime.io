import type { Page, Shape } from '@imprime/sdk'
import { getBorderWidths } from '@imprime/sdk'

// Every colour the document paints with — fills, borders, text runs — in the
// order its pages and layers first use it, so a swatch keeps its place as the
// document changes. A hidden shape paints nothing, nor does a border with no
// side wide enough to show, nor a text box's `stroke`, which is never drawn.
// Lower-cased, as `#FF0000` and `#ff0000` are one colour.
export function collectDocumentColors(pages: Page[]): string[] {
  const colors = new Set<string>()
  const add = (color: string | undefined) => {
    if (color) colors.add(color.toLowerCase())
  }

  const visit = (shape: Shape): void => {
    if (shape.hidden) return
    if (shape.type === 'text') {
      for (const paragraph of shape.paragraphes) {
        for (const run of paragraph.children) add(run.color)
      }
      return
    }
    if (shape.type !== 'image') add(shape.fill)
    if (Object.values(getBorderWidths(shape)).some(width => width > 0)) add(shape.stroke)
    if (shape.type === 'group') shape.children.forEach(visit)
  }

  for (const page of pages) page.shapes.forEach(visit)
  return [...colors]
}
