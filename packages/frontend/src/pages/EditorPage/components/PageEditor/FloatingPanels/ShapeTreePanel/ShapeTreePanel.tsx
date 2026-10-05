import { useState } from 'react'
import './ShapeTreePanel.css'
import { useCurrentPage } from '../../../../../../store/editor/EditorStore'
import type { DropTarget } from './types'
import { ShapeTreeUIContext } from './ShapeTreeUIContext'
import { SiblingList } from './SiblingList/SiblingList'

export default function ShapeTreePanel() {
    const currentPage = useCurrentPage()

    const [draggedId, setDraggedId] = useState<string | null>(null)
    const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)

    if (!currentPage) return null

    return (
        <div className="shape-tree-panel">
            <div className="shape-tree-panel-header">Layers</div>
            <div className="shape-tree-panel-content">
                {currentPage.shapes.length === 0 ? (
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
                        <SiblingList shapes={currentPage.shapes} parentId={null} depth={0} />
                    </ShapeTreeUIContext.Provider>
                )}
            </div>
        </div>
    )
}
