/**
 * THCSDndSectionsContainer — Phase 3, Task 9.2
 *
 * Wrapper component that provides DnD context for section-level reordering.
 * Extracted from THCSTestEditorPage to keep it under complexity limit.
 *
 * ⚠️ Rule 4: After drag completes, call requestAnimationFrame() then re-measure.
 * ⚠️ Rule 5: Do NOT use setPointerCapture() on any draggable element.
 */

import React, { useCallback } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
    useSortable,
    arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { THCSSection } from '../../types/thcs-test.types';

// ── Sortable Section Wrapper ──
interface SortableSectionProps {
    id: string;
    children: React.ReactNode;
}

function SortableSectionItem({ id, children }: SortableSectionProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        position: 'relative' as const,
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes}>
            {/* Drag handle */}
            <button
                {...listeners}
                style={{
                    position: 'absolute',
                    left: -28,
                    top: 16,
                    width: 24,
                    height: 32,
                    background: 'transparent',
                    border: 'none',
                    cursor: isDragging ? 'grabbing' : 'grab',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#94a3b8',
                    fontSize: '1rem',
                    padding: 0,
                    borderRadius: 4,
                    transition: 'color 0.15s',
                    zIndex: 10,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#7c3aed'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; }}
                title="Drag to reorder section"
                aria-label="Drag handle"
            >
                ⋮⋮
            </button>
            {children}
        </div>
    );
}

// ── Main Container ──
interface THCSDndSectionsContainerProps {
    sections: THCSSection[];
    onReorder: (newSections: THCSSection[]) => void;
    renderSection: (section: THCSSection, index: number) => React.ReactNode;
}

export function THCSDndSectionsContainer({
    sections,
    onReorder,
    renderSection,
}: THCSDndSectionsContainerProps) {
    // Rule 5: Use PointerSensor (no setPointerCapture), with activation distance
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor)
    );

    const sectionIds = sections.map(s => s.id);

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = sections.findIndex(s => s.id === active.id);
        const newIndex = sections.findIndex(s => s.id === over.id);

        if (oldIndex === -1 || newIndex === -1) return;

        const reordered = arrayMove(sections, oldIndex, newIndex).map((s, idx) => ({
            ...s,
            order: idx,
        }));

        // Rule 4: Re-measure layout after paint to prevent layout shift
        requestAnimationFrame(() => {
            onReorder(reordered);
        });
    }, [sections, onReorder]);

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
        >
            <SortableContext items={sectionIds} strategy={verticalListSortingStrategy}>
                <div style={{ paddingLeft: 32 }}>
                    {sections.map((section, index) => (
                        <SortableSectionItem key={section.id} id={section.id}>
                            {renderSection(section, index)}
                        </SortableSectionItem>
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    );
}

export default THCSDndSectionsContainer;
