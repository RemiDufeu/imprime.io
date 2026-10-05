import { Button, Tooltip } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import "./PageList.css";
import { useRef, useState, useLayoutEffect } from "react";
import { PageCanvas } from "../../../../../../components/page/PageCanvas";
import { useEditorStore } from "../../../../../../store/editor/EditorStore";
import { selectPageSize } from "../../../../../../store/editor/selectors";
import { MOD_LABEL } from "../../../../../../utils/hotkeys";

export default function PageList() {

    const template = useEditorStore(state => state.template);
    const currentPageIndex = useEditorStore(state => state.currentPageIndex);
    const selectPage = useEditorStore(state => state.selectPage);
    const addPage = useEditorStore(state => state.addPage);
    const deletePage = useEditorStore(state => state.deletePage);
    const reorderPages = useEditorStore(state => state.reorderPages);
    const pageSize = useEditorStore(selectPageSize);

    const containerRef = useRef<HTMLDivElement>(null);
    const [previewWidth, setPreviewWidth] = useState(192);
    const previewHeight = (previewWidth * pageSize.height) / pageSize.width;
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    useLayoutEffect(() => {
        if (containerRef.current) {
            setPreviewWidth(containerRef.current.offsetWidth);
        }
    }, []);

    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (draggedIndex === null) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        const insertBefore = e.clientY < midpoint;

        const insertionIndex = insertBefore ? index : index + 1;

        setDragOverIndex(insertionIndex);
    };

    const handleDragLeave = () => {
        setDragOverIndex(null);
    };

    const handleDrop = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedIndex === null || !template) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        const insertBefore = e.clientY < midpoint;
        let insertionIndex = insertBefore ? index : index + 1;

        if (draggedIndex < insertionIndex) {
            insertionIndex--;
        }

        if (draggedIndex === insertionIndex) {
            setDraggedIndex(null);
            setDragOverIndex(null);
            return;
        }

        const pages = [...template.pages];
        const [draggedPage] = pages.splice(draggedIndex, 1);
        pages.splice(insertionIndex, 0, draggedPage);

        // Update order property
        const reorderedPages = pages.map((page, idx) => ({
            ...page,
            order: idx
        }));

        reorderPages(reorderedPages);
        setDraggedIndex(null);
        setDragOverIndex(null);
    };

    const handleDragEnd = () => {
        setDraggedIndex(null);
        setDragOverIndex(null);
    };

    const handleSeparatorDragOver = (e: React.DragEvent, insertionIndex: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (draggedIndex === null) return;
        setDragOverIndex(insertionIndex);
    };

    const handleSeparatorDrop = (e: React.DragEvent, insertionIndex: number) => {
        e.preventDefault();
        if (draggedIndex === null || !template) return;

        let finalIndex = insertionIndex;
        if (draggedIndex < insertionIndex) {
            finalIndex--;
        }

        if (draggedIndex === finalIndex) {
            setDraggedIndex(null);
            setDragOverIndex(null);
            return;
        }

        const pages = [...template.pages];
        const [draggedPage] = pages.splice(draggedIndex, 1);
        pages.splice(finalIndex, 0, draggedPage);

        // Update order property
        const reorderedPages = pages.map((page, idx) => ({
            ...page,
            order: idx
        }));

        reorderPages(reorderedPages);
        setDraggedIndex(null);
        setDragOverIndex(null);
    };

    if (!template) {
        return null;
    }

    return (
        <div className="page-list-container" ref={containerRef}>
            <div className="page-list-header">
                <Button icon={<PlusOutlined />}
                    onClick={() => addPage(currentPageIndex)}
                    style={{
                        flex: 1,
                        boxSizing : 'content-box'
                     }}>
                    Add
                </Button>
            </div>

            <div className="page-list-content">
                {template.pages.map((page, index) => (<div key={page._id}>
                    <PageAddSeparator
                        active={index === dragOverIndex}
                        insertionIndex={index}
                        onDragOver={handleSeparatorDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleSeparatorDrop}
                    />
                    <div
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, index)}
                        onDragEnd={handleDragEnd}
                        className={`page-thumbnail ${index === currentPageIndex ? "page-thumbnail-active" : ""}`}
                        onClick={() => selectPage(index)}
                        style={{ cursor: draggedIndex !== null ? 'grabbing' : 'grab' }}>
                        <div className="page-thumbnail-number">{index + 1}</div>
                        <div className="page-preview-wrapper" key={`preview-${page._id}-${index}`}>
                            <div className="page-preview-shadow">
                                <PageCanvas
                                    readonly={true}
                                    page={page}
                                    width={previewWidth}
                                    height={previewHeight}
                                />
                            </div>
                        </div>
                        {/* No confirmation: a deleted page is one undo away. */}
                        {template.pages.length > 1 && (
                            <Tooltip title={`Delete page (undo: ${MOD_LABEL}+Z)`} mouseEnterDelay={0.4}>
                                <Button
                                    type="text"
                                    danger
                                    icon={<DeleteOutlined />}
                                    size="small"
                                    className="page-thumbnail-delete"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        deletePage(page._id);
                                    }}
                                />
                            </Tooltip>
                        )}
                    </div>
                </div>))}
                <PageAddSeparator
                    key={`separator-end`}
                    active={template.pages.length === dragOverIndex}
                    insertionIndex={template.pages.length}
                    onDragOver={handleSeparatorDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleSeparatorDrop}
                />
            </div>
        </div>
    );
}

interface PageAddSeparatorProps {
    active: boolean;
    insertionIndex: number;
    onDragOver: (e: React.DragEvent, insertionIndex: number) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent, insertionIndex: number) => void;
}

function PageAddSeparator({
    active,
    insertionIndex,
    onDragOver,
    onDragLeave,
    onDrop
}: PageAddSeparatorProps) {
    return (
        <div
            className="insert-page-wrapper"
            onDragOver={(e) => onDragOver(e, insertionIndex)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, insertionIndex)}
        >
            <div className={`insert-page ${active ? 'active' : ''}`}/>
        </div>
    );
}