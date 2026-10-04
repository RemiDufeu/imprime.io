import { createContext, useContext } from 'react'
import type { ListMarker, Paragraph } from '@imprime/sdk'

// The marker of every paragraph of the box, keyed by paragraph node (Slate
// nodes are immutable, so the node a paragraph renders is the key it was
// stored under). Filled by `ListMarkersProvider`; empty outside it.
export const ListMarkersContext = createContext<ReadonlyMap<Paragraph, ListMarker | null>>(new Map())

export function useListMarker(paragraph: Paragraph): ListMarker | null {
  return useContext(ListMarkersContext).get(paragraph) ?? null
}
