import { Button, Popconfirm } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import "./SlideList.css";
import { useRef, useState, useLayoutEffect } from "react";
import { SlideCanvas } from "../../../../components/slide/SlideCanvas";
import { useEditorStore } from "../../../../store/editor/EditorStore";

export default function SlideList() {

    const presentation = useEditorStore(state => state.presentation);
    const currentSlideIndex = useEditorStore(state => state.currentSlideIndex);
    const selectSlide = useEditorStore(state => state.selectSlide);
    const addSlide = useEditorStore(state => state.addSlide);
    const deleteSlide = useEditorStore(state => state.deleteSlide);
    const reorderSlides = useEditorStore(state => state.reorderSlides);

    const containerRef = useRef<HTMLDivElement>(null);
    const [previewSize, setPreviewSize] = useState({ width: 192, height: 108 });
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    useLayoutEffect(() => {
        if (containerRef.current) {
            const containerWidth = containerRef.current.offsetWidth;
            setPreviewSize({ width: containerWidth, height: (containerWidth * 9) / 16 });
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
        if (draggedIndex === null || !presentation) return;

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

        const slides = [...presentation.slides];
        const [draggedSlide] = slides.splice(draggedIndex, 1);
        slides.splice(insertionIndex, 0, draggedSlide);

        // Update order property
        const reorderedSlides = slides.map((slide, idx) => ({
            ...slide,
            order: idx
        }));

        reorderSlides(reorderedSlides);
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
        if (draggedIndex === null || !presentation) return;

        let finalIndex = insertionIndex;
        if (draggedIndex < insertionIndex) {
            finalIndex--;
        }

        if (draggedIndex === finalIndex) {
            setDraggedIndex(null);
            setDragOverIndex(null);
            return;
        }

        const slides = [...presentation.slides];
        const [draggedSlide] = slides.splice(draggedIndex, 1);
        slides.splice(finalIndex, 0, draggedSlide);

        // Update order property
        const reorderedSlides = slides.map((slide, idx) => ({
            ...slide,
            order: idx
        }));

        reorderSlides(reorderedSlides);
        setDraggedIndex(null);
        setDragOverIndex(null);
    };

    if (!presentation) {
        return null;
    }

    return (
        <div className="slide-list-container" ref={containerRef}>
            <div className="slide-list-header">
                <Button icon={<PlusOutlined />}
                    onClick={() => addSlide(currentSlideIndex)}
                    style={{
                        flex: 1,
                        boxSizing : 'content-box'
                     }}>
                    Add
                </Button>
            </div>

            <div className="slide-list-content">
                {presentation.slides.map((slide, index) => (<div key={slide._id}>
                    <SlideAddSeparator
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
                        className={`slide-thumbnail ${index === currentSlideIndex ? "slide-thumbnail-active" : ""}`}
                        onClick={() => selectSlide(index)}
                        style={{ cursor: draggedIndex !== null ? 'grabbing' : 'grab' }}>
                        <div className="slide-thumbnail-number">{index + 1}</div>
                        <div className="slide-preview-wrapper" key={`preview-${slide._id}-${index}`}>
                            <div className="slide-preview-shadow">
                                <SlideCanvas
                                    readonly={true}
                                    slide={slide}
                                    width={previewSize.width}
                                    height={previewSize.height}
                                />
                            </div>
                        </div>
                        {presentation.slides.length > 1 && (
                            <Popconfirm
                                title="Delete this slide?"
                                description="This action is irreversible."
                                onConfirm={(e) => {
                                    e?.stopPropagation();
                                    deleteSlide(slide._id);
                                }}
                                okText="Delete"
                                cancelText="Cancel"
                                okButtonProps={{ danger: true }}
                            >
                                <Button
                                    type="text"
                                    danger
                                    icon={<DeleteOutlined />}
                                    size="small"
                                    className="slide-thumbnail-delete"
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </Popconfirm>
                        )}
                    </div>
                </div>))}
                <SlideAddSeparator
                    key={`separator-end`}
                    active={presentation.slides.length === dragOverIndex}
                    insertionIndex={presentation.slides.length}
                    onDragOver={handleSeparatorDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleSeparatorDrop}
                />
            </div>
        </div>
    );
}

interface SlideAddSeparatorProps {
    active: boolean;
    insertionIndex: number;
    onDragOver: (e: React.DragEvent, insertionIndex: number) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent, insertionIndex: number) => void;
}

function SlideAddSeparator({
    active,
    insertionIndex,
    onDragOver,
    onDragLeave,
    onDrop
}: SlideAddSeparatorProps) {
    return (
        <div
            className="insert-slide-wrapper"
            onDragOver={(e) => onDragOver(e, insertionIndex)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, insertionIndex)}
        >
            <div className={`insert-slide ${active ? 'active' : ''}`}/>
        </div>
    );
}