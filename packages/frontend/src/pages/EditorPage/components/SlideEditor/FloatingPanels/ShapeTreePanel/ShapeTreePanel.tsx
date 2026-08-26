import { useState } from 'react'
import './ShapeTreePanel.css'
import { useCurrentSlide } from '../../../../../../store/editor/EditorStore'
import type { DropTarget } from './types'
import { ShapeTreeUIContext } from './ShapeTreeUIContext'
import { SiblingList } from './SiblingList/SiblingList'

export default function ShapeTreePanel() {
    const currentSlide = useCurrentSlide()

    const [draggedId, setDraggedId] = useState<string | null>(null)
    const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)

    if (!currentSlide) return null

    return (
        <div className="shape-tree-panel">
            <div className="shape-tree-panel-header">Layers</div>
            <div className="shape-tree-panel-content">
                {currentSlide.shapes.length === 0 ? (
                    <div className="shape-tree-panel-empty">No shapes yet</div>
                ) : (
                    <ShapeTreeUIContext.Provider
                        value={{
                            draggedId,
                            setDraggedId,
                            dropTarget,
                            setDropTarget,
                        }}
                    >
                        <SiblingList shapes={currentSlide.shapes} parentId={null} depth={0} />
                    </ShapeTreeUIContext.Provider>
                )}
            </div>
        </div>
    )
}
