import type { RenderElementProps } from 'slate-react'
import type { Paragraph } from '@imprime/sdk'
import {
  getListLayout,
  getListMarkerFormatting,
  getListStyle,
  getParagraphLeadFace,
  getParagraphStyle,
} from '@imprime/sdk'
import { useEditorStore } from '../../store/editor/EditorStore'
import { useListMarker } from './ListMarkersContext'
import { ListItemMarker } from './ListItemMarker'

type ParagraphElementProps = RenderElementProps & {
  element: Paragraph
}

export function ParagraphElement({ attributes, children, element }: ParagraphElementProps) {
  const fontCatalog = useEditorStore(state => state.fontCatalog)
  const { textAlign, lineHeight } = getParagraphStyle(element)
  const listStyle = getListStyle(element)
  const marker = useListMarker(element)

  // CSS opens every line with an invisible glyph in the paragraph's own font
  // (the strut), and the line is as tall as the union of it and the runs, each
  // centred on its own ascent and descent. Inheriting the box's default font,
  // the strut made a line in another font — or under the default size — taller
  // than lineHeight × fontSize; react-pdf has no strut, so the editor drifted
  // a few px per line from the PDF. Drawn in the lead run's face and size, the
  // strut coincides with the runs. Only the face and the size: a decoration
  // set on the block would underline every run.
  const strut = getParagraphLeadFace(element, fontCatalog)

  if (!listStyle || !marker) {
    return <p {...attributes} className="text-box-paragraph" style={{ ...strut, textAlign, lineHeight }}>{children}</p>
  }

  // A list item: padded to its text indent, where lines wrap back to, with the
  // marker in that padding.
  const layout = getListLayout(element, listStyle)

  return (
    <p
      {...attributes}
      className="text-box-paragraph text-box-paragraph--list-item"
      style={{ ...strut, textAlign, lineHeight, paddingLeft: layout.textIndent }}
    >
      <ListItemMarker marker={marker} layout={layout} formatting={getListMarkerFormatting(element)} />
      {children}
    </p>
  )
}
