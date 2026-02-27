import React, { useState, useEffect, useMemo } from 'react';
import {
    DndContext,
    useDndContext,
    useDraggable,
    useDroppable,
    DragOverlay,
    rectIntersection,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragStartEvent,
    DragEndEvent
} from '@dnd-kit/core';
import {
    sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { hasExistingLabel, toRoman, indexToLetter } from '../../utils/labelDetection';

interface Question {
    number: number;
    type: string;
    question: string;
    options?: string[];
    answer: string | string[] | Record<string, string>;
    passageId: string;
    items?: Array<{ id: string; text: string }>;
}

interface DragDropMatchingInputProps {
    questions: Question[];
    answers: Record<number, string>;
    onAnswerChange: (questionNumber: number, answer: string) => void;
    disabled?: boolean;
    labelType?: 'roman' | 'letter';
    listTitle?: string;
}

const primaryBlue = 'rgb(65, 142, 200)';

// ─── Helper: Force dnd-kit to re-measure droppable zones after layout shift ──
// When the heading box collapses, drop zones shift UP. dnd-kit's ResizeObserver
// doesn't detect position-only changes, so we explicitly trigger re-measurement
// after the browser paints the new layout.
const RemeasureOnCollapse = ({ droppableIds }: { droppableIds: string[] }) => {
    const { active, measureDroppableContainers } = useDndContext();

    useEffect(() => {
        if (active) {
            // Wait one frame for the DOM to settle after the instant collapse,
            // then force dnd-kit to re-read all droppable bounding rects.
            const rafId = requestAnimationFrame(() => {
                console.log('📐 [DragDrop] Re-measuring drop zones after collapse');
                measureDroppableContainers(droppableIds);
            });
            return () => cancelAnimationFrame(rafId);
        }
        return undefined;
    }, [active, measureDroppableContainers, droppableIds]);

    return null;
};

// ─── Draggable Heading Tile ───────────────────────────────────────────────────
const DraggableHeading = ({
    id,
    text,
    isUsed,
    disabled,
}: {
    id: string;
    text: string;
    isUsed: boolean;
    disabled: boolean;
}) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id,
        disabled: isUsed || disabled,
    });

    return (
        <div
            ref={setNodeRef}
            aria-label={`Drag: ${text}`}
            style={{
                padding: '8px 16px',
                background: isUsed ? '#f8f9fa' : 'white',
                border: `1px solid ${isDragging ? primaryBlue : '#cbd5e1'}`,
                borderRadius: '2px',
                cursor: (isUsed || disabled) ? 'default' : 'grab',
                opacity: (isUsed || isDragging) ? 0.4 : 1,
                boxShadow: isDragging ? '0 8px 16px rgba(0,0,0,0.1)' : '0 1px 2px rgba(0,0,0,0.05)',
                fontSize: '15px',
                fontWeight: 500,
                color: isUsed ? '#94a3b8' : '#334155',
                userSelect: 'none',
                touchAction: 'none',
                transition: 'all 0.15s ease',
                minWidth: '100px',
                textAlign: 'left',
            }}
            {...attributes}
            {...listeners}
        >
            {text}
        </div>
    );
};

// ─── Droppable Question Row ───────────────────────────────────────────────────
const QuestionDropZone = ({
    questionNumber,
    label,
    currentAnswer,
    onRemove,
    disabled,
}: {
    questionNumber: number;
    label: string;
    currentAnswer: string | null;
    onRemove: () => void;
    disabled: boolean;
}) => {
    const { isOver, setNodeRef } = useDroppable({
        id: `q-${questionNumber}`,
        disabled,
    });

    return (
        <div
            ref={setNodeRef}
            aria-label={`Drop zone for question ${questionNumber}: ${label}`}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '0.75rem 0',
                borderBottom: '1px solid #f1f5f9',
                transition: 'background 0.2s',
                background: isOver ? '#f0f9ff' : 'transparent',
            }}
        >
            <div style={{ minWidth: '24px', fontWeight: 700, fontSize: '15px', color: '#333' }}>
                {questionNumber}
            </div>

            <div style={{ flex: 1, fontSize: '16px', color: '#000', fontFamily: 'Arial, sans-serif' }}>
                {label}
            </div>

            <div style={{
                width: '180px',
                height: '36px',
                border: `1px solid ${currentAnswer ? primaryBlue : '#d1d5db'}`,
                background: currentAnswer ? '#fff' : '#f8fafc',
                borderRadius: '2px',
                display: 'flex',
                alignItems: 'center',
                padding: '0 0.75rem',
                fontSize: '14px',
                fontWeight: 600,
                color: primaryBlue,
                position: 'relative',
                boxShadow: isOver ? `0 0 0 2px ${primaryBlue}44` : 'none',
            }}>
                {currentAnswer ? (
                    <>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {currentAnswer}
                        </span>
                        {!disabled && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                                aria-label="Remove answer"
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#94a3b8',
                                    cursor: 'pointer',
                                    fontSize: '18px',
                                    paddingLeft: '8px',
                                    lineHeight: 1,
                                }}
                            >
                                ×
                            </button>
                        )}
                    </>
                ) : (
                    <span style={{ color: '#cbd5e1', fontStyle: 'italic', fontSize: '13px' }}>
                        Drag heading here
                    </span>
                )}
            </div>
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────
export const DragDropMatchingInput: React.FC<DragDropMatchingInputProps> = ({
    questions,
    answers,
    onAnswerChange,
    disabled = false,
    labelType = 'roman',
    listTitle = 'List of Headings',
}) => {
    const [activeId, setActiveId] = useState<string | null>(null);
    const [activeText, setActiveText] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { distance: 8 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const options = questions[0]?.options || [];

    const optionLabels = options.map((opt, i) => {
        if (hasExistingLabel(opt, i)) return opt;
        const prefix = labelType === 'roman' ? `${toRoman(i + 1)}.` : `${indexToLetter(i)}.`;
        return `${prefix} ${opt}`;
    });

    const usedHeadings = Object.values(answers);

    // Whether the heading box should be collapsed (only during active drag)
    const isCollapsed = !!activeId;

    // Stable array of droppable IDs for RemeasureOnCollapse
    const droppableIds = useMemo(
        () => questions.map(q => `q-${q.number}`),
        [questions]
    );

    // ── DIAGNOSTIC LOGS ──
    console.log(`🧩 [DragDrop] Render | activeId=${activeId || 'none'} | isCollapsed=${isCollapsed} | answers=${Object.keys(answers).length}/${questions.length}`);

    const handleDragStart = (event: DragStartEvent) => {
        const id = event.active.id as string;
        console.log(`🟢 [DragDrop] DragStart: "${id}"`);
        setActiveId(id);
        const idx = options.indexOf(id);
        setActiveText(idx >= 0 ? (optionLabels[idx] ?? id) : id);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);
        setActiveText(null);

        if (over && active.id) {
            const questionNumber = parseInt((over.id as string).replace('q-', ''));
            if (!isNaN(questionNumber)) {
                console.log(`📥 [DragDrop] Drop: "${active.id}" → Q${questionNumber}`);
                onAnswerChange(questionNumber, active.id as string);
            }
        } else {
            console.log('📥 [DragDrop] Drop cancelled: no valid target', { activeId: active.id, overId: over?.id });
        }
    };

    const handleDragCancel = () => {
        console.log('🔴 [DragDrop] DragCancel');
        setActiveId(null);
        setActiveText(null);
    };

    const handleRemove = (questionNumber: number) => {
        console.log(`🗑️ [DragDrop] Remove answer for Q${questionNumber}`);
        onAnswerChange(questionNumber, '');
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={rectIntersection}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
            {/* Force re-measure of drop zones after the heading box collapses */}
            <RemeasureOnCollapse droppableIds={droppableIds} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                {/* ── List of Headings Box ─────────────────────────────────── */}
                <div style={{
                    background: '#f8fafc',
                    border: `1px solid ${isCollapsed ? primaryBlue : '#d1d5db'}`,
                    borderRadius: '2px',
                    padding: '1.25rem',
                    transition: 'border-color 0.2s ease',
                }}>
                    {/* Header row — always visible */}
                    <div style={{
                        fontSize: '16px',
                        fontWeight: 700,
                        marginBottom: isCollapsed ? '0' : '1rem',
                        color: '#000',
                        fontFamily: 'Arial, sans-serif',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        // Instant collapse so DOM settles before re-measurement
                        transition: isCollapsed ? 'none' : 'margin-bottom 0.15s ease',
                    }}>
                        <span>{isCollapsed ? `📋 ${listTitle}` : listTitle}</span>
                        {isCollapsed && (
                            <span style={{
                                fontSize: '12px',
                                fontWeight: 500,
                                color: primaryBlue,
                                fontStyle: 'italic',
                            }}>
                                Drop below ▼
                            </span>
                        )}
                    </div>

                    {/* Tile grid — collapses INSTANTLY during drag.
                        RemeasureOnCollapse forces dnd-kit to re-read drop zone
                        positions after the layout settles. */}
                    <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '0.75rem',
                        maxHeight: isCollapsed ? '0' : '1000px',
                        overflow: 'hidden',
                        opacity: isCollapsed ? 0 : 1,
                        // Instant collapse, animated expansion
                        transition: isCollapsed
                            ? 'none'
                            : 'max-height 0.15s ease, opacity 0.12s ease',
                    }}>
                        {options.map((opt, i) => (
                            <DraggableHeading
                                key={opt}
                                id={opt}
                                text={optionLabels[i] ?? opt}
                                isUsed={usedHeadings.includes(opt)}
                                disabled={disabled}
                            />
                        ))}
                    </div>
                </div>

                {/* ── Drop Zones ───────────────────────────────────────────── */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {questions.map(q => (
                        <QuestionDropZone
                            key={q.number}
                            questionNumber={q.number}
                            label={q.question}
                            currentAnswer={answers[q.number] || null}
                            onRemove={() => handleRemove(q.number)}
                            disabled={disabled}
                        />
                    ))}
                </div>
            </div>

            {/* Ghost tile shown during drag */}
            <DragOverlay>
                {activeId ? (
                    <div style={{
                        padding: '8px 16px',
                        background: 'white',
                        border: `2px solid ${primaryBlue}`,
                        borderRadius: '2px',
                        boxShadow: '0 12px 24px rgba(0,0,0,0.15)',
                        fontSize: '15px',
                        fontWeight: 600,
                        color: primaryBlue,
                        cursor: 'grabbing',
                        minWidth: '150px',
                    }}>
                        {activeText ?? activeId}
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
};
