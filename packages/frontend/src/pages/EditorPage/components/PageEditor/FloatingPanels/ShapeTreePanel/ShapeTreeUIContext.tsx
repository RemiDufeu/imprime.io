import { createContext, useContext } from 'react'
import type { DropTarget } from './types'

interface ShapeTreeUIContextValue {
    draggedId: string | null
    setDraggedId: (id: string | null) => void
    dropTarget: DropTarget | null
    setDropTarget: (target: DropTarget | null) => void
}

export const ShapeTreeUIContext = createContext<ShapeTreeUIContextValue | null>(null)

export function useShapeTreeUI() {
    const ctx = useContext(ShapeTreeUIContext)
    if (!ctx) throw new Error('useShapeTreeUI must be used within a ShapeTreeUIContext.Provider')
    return ctx
}
