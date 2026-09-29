import type { RenderElementProps } from 'slate-react'
import type { Paragraph } from '@imprime/sdk'
import { getListLayout, getListMarkerFormatting, getListStyle, getParagraphStyle } from '@imprime/sdk'
import { useListMarker } from './ListMarkersContext'
import { ListItemMarker } from './ListItemMarker'

type ParagraphElementProps = RenderElementProps & {
  element: Paragraph
}

export function ParagraphElement({ attributes, children, element }: ParagraphElementProps) {
  const { textAlign, lineHeight } = getParagraphStyle(element)
  const listStyle = getListStyle(element)
  const marker = useListMarker(element)

  if (!listStyle || !marker) {
    return <p {...attributes} className="text-box-paragraph" style={{ textAlign, lineHeight }}>{children}</p>
  }

  // A list item: padded to its text indent, where lines wrap back to, with the
  // marker in that padding.
  const layout = getListLayout(element, listStyle)

  return (
    <p
      {...attributes}
      className="text-box-paragraph text-box-paragraph--list-item"
      style={{ textAlign, lineHeight, paddingLeft: layout.textIndent }}
    >
      <ListItemMarker marker={marker} layout={layout} formatting={getListMarkerFormatting(element)} />
      {children}
    </p>
  )
}
