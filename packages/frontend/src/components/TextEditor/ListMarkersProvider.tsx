import type { ReactNode } from 'react'
import { useSlateSelector } from 'slate-react'
import { getListMarkers } from '@imprime/sdk'
import { isParagraph } from '../../utils/paragraphs'
import { ListMarkersContext } from './ListMarkersContext'

// An item's number depends on its neighbours, but Slate re-renders an element
// only when that element itself changes: inserting an item above would leave
// the ones below with stale numbers. So the markers are computed here, for the
// whole box, on every document change, and reach each paragraph through
// context — a context update re-renders its consumers even inside Slate's
// memoised elements.
export function ListMarkersProvider({ children }: { children: ReactNode }) {
  // `editor.children` is replaced, never mutated, when the document changes,
  // so selecting it re-renders exactly then — and gives the React Compiler a
  // dependency that changes, where the editor object itself never does.
  const nodes = useSlateSelector(editor => editor.children)
  const paragraphs = nodes.filter(isParagraph)
  const markers = getListMarkers(paragraphs)
  const byParagraph = new Map(paragraphs.map((paragraph, i) => [paragraph, markers[i]]))

  return <ListMarkersContext.Provider value={byParagraph}>{children}</ListMarkersContext.Provider>
}
