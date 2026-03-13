/**
 * THCSSectionBlock — Section editor with questions, reorder, instruction (PRD-0027 Task 4.3)
 */
import React, { useState } from 'react';
import {
    TextInput, Textarea, NumberInput, SegmentedControl,
    ActionIcon, Tooltip, Collapse, Modal, Button as MButton, Text,
} from '@mantine/core';
import {
    DndContext, closestCenter, PointerSensor, KeyboardSensor,
    useSensor, useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { restrictToParentElement } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import type { THCSSection, THCSQuestion, MCQIntent, THCSQuestionType } from '../../types/thcs-test.types';
import { ALL_INSTRUCTION_TEMPLATES } from '../../types/thcs-test.types';
import THCSQuestionBlock from './THCSQuestionBlock';
import { THCSBulkPasteModal } from './THCSBulkPasteModal';
import { Button } from '../modern';

// ── Sortable Question Wrapper (Task 9.3) ──
function SortableQuestionItem({ id, children }: { id: string; children: React.ReactNode }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        position: 'relative' as const,
    };
    return (
        <div ref={setNodeRef} style={style} {...attributes}>
            <button
                {...listeners}
                style={{
                    position: 'absolute', left: -22, top: 8, width: 20, height: 28,
                    background: 'transparent', border: 'none',
                    cursor: isDragging ? 'grabbing' : 'grab',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#cbd5e1', fontSize: '0.75rem', padding: 0, borderRadius: 3, zIndex: 10,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#7c3aed'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#cbd5e1'; }}
                title="Drag to reorder question"
                aria-label="Drag handle"
            >
                ⋮⋮
            </button>
            {children}
        </div>
    );
}

interface THCSSectionBlockProps {
    section: THCSSection;
    sectionIndex: number;
    totalSections: number;
    globalQuestionOffset: number;
    draftId: string | null;
    onUpdate: (section: THCSSection) => void;
    onDelete: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
}

const READING_INTENTS: THCSQuestionType[] = ['reading-cloze-mcq', 'reading-comprehension', 'reading-announcement', 'reading-cloze-wordbank'];

const THCSSectionBlock: React.FC<THCSSectionBlockProps> = ({
    section, sectionIndex, totalSections, globalQuestionOffset, draftId,
    onUpdate, onDelete, onMoveUp, onMoveDown,
}) => {
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showBulkPaste, setShowBulkPaste] = useState(false);
    const [showPassage, setShowPassage] = useState(false);
    const [editingRawText, setEditingRawText] = useState(false);

    const isRawFallback = section.isRawTextFallback === true
        || section.questions.some(q => q.type === 'raw-text-fallback');

    const hasReadingIntents = section.questions.some(q => READING_INTENTS.includes(q.type));

    // Question management
    const handleAddQuestion = () => {
        const lastQ = section.questions[section.questions.length - 1];
        const defaultType: THCSQuestionType = lastQ ? lastQ.type : 'mcq-grammar';
        const defaultIntent: MCQIntent | undefined = lastQ ? lastQ.intent : 'mcq-grammar';

        const newQ: THCSQuestion = {
            id: crypto.randomUUID(),
            questionNumber: globalQuestionOffset + section.questions.length + 1,
            type: defaultType,
            intent: defaultIntent,
            questionText: '',
            options: ['', '', '', ''],
            correctAnswer: '' as any,
        };

        onUpdate({ ...section, questions: [...section.questions, newQ] });
    };

    const handleUpdateQuestion = (index: number, updated: THCSQuestion) => {
        const newQuestions = [...section.questions];
        newQuestions[index] = updated;

        let layoutUpdate: Partial<THCSSection> = {};

        // Auto-update instruction when first question's type changes and not custom
        if (index === 0 && !section.isCustomInstruction) {
            const template = ALL_INSTRUCTION_TEMPLATES[updated.type];
            if (template && template !== section.instructionText) {
                layoutUpdate.instructionText = template;
            }
        }

        // Task 11.1: Auto-default layout when first question's type changes
        // Only if teacher hasn't manually set layout (isCustomLayout !== true)
        if (index === 0 && !section.isCustomLayout) {
            const isReading = READING_INTENTS.includes(updated.type);
            const newLayout = isReading ? 'two-column' : 'single-column';
            if (newLayout !== section.layout) {
                layoutUpdate.layout = newLayout;
            }
        }

        // Task 11.2: Auto-set generic instruction for mixed type sections
        const uniqueTypes = new Set(newQuestions.map(q => q.type));
        if (uniqueTypes.size > 1 && !section.isCustomInstruction) {
            layoutUpdate.instructionText = 'Complete the following questions.';
        }

        if (Object.keys(layoutUpdate).length > 0) {
            onUpdate({ ...section, questions: newQuestions, ...layoutUpdate });
            return;
        }

        onUpdate({ ...section, questions: newQuestions });
    };

    const handleDeleteQuestion = (index: number) => {
        const newQuestions = section.questions.filter((_, i) => i !== index);
        onUpdate({ ...section, questions: newQuestions });
    };

    const handleMoveQuestion = (index: number, direction: -1 | 1) => {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= section.questions.length) return;
        const newQuestions = [...section.questions];
        [newQuestions[index], newQuestions[newIndex]] = [newQuestions[newIndex]!, newQuestions[index]!];
        onUpdate({ ...section, questions: newQuestions });
    };

    const handleResetInstruction = () => {
        const firstQ = section.questions[0];
        const template = firstQ ? ALL_INSTRUCTION_TEMPLATES[firstQ.type] : '';
        onUpdate({ ...section, instructionText: template, isCustomInstruction: false });
    };

    const handleCreateCustomInstruction = () => {
        onUpdate({ ...section, instructionText: '', isCustomInstruction: true });
    };

    return (
        <div style={{
            background: 'rgba(255,255,255,0.9)',
            backdropFilter: 'blur(12px)',
            borderRadius: '1rem',
            border: '1px solid rgba(139,92,246,0.15)',
            overflow: 'hidden',
        }}>
            {/* Section Header */}
            <div style={{
                padding: '1rem 1.5rem',
                background: 'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(99,102,241,0.08) 100%)',
                borderBottom: '1px solid rgba(139,92,246,0.1)',
                display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
            }}>
                {/* Section name */}
                <TextInput
                    value={section.name}
                    onChange={(e) => onUpdate({ ...section, name: e.target.value })}
                    size="sm"
                    style={{ width: 200 }}
                    styles={{ input: { fontWeight: 700, fontSize: '1rem' } }}
                />

                {/* Layout toggle */}
                <SegmentedControl
                    data={[
                        { value: 'single-column', label: '1 Col' },
                        { value: 'two-column', label: '2 Col' },
                    ]}
                    value={section.layout}
                    onChange={(val) => onUpdate({ ...section, layout: val as 'single-column' | 'two-column', isCustomLayout: true })}
                    size="xs"
                />

                {/* Total points */}
                <NumberInput
                    label="Points"
                    value={section.totalPoints}
                    onChange={(val) => onUpdate({ ...section, totalPoints: typeof val === 'number' ? val : 0 })}
                    size="xs"
                    min={0}
                    step={0.25}
                    style={{ width: 90 }}
                />

                {/* Point mode */}
                <SegmentedControl
                    data={[
                        { value: 'auto', label: 'Auto' },
                        { value: 'manual', label: 'Manual' },
                    ]}
                    value={section.pointMode}
                    onChange={(val) => onUpdate({ ...section, pointMode: val as 'auto' | 'manual' })}
                    size="xs"
                />

                <div style={{ flex: 1 }} />

                {/* Move/Delete buttons */}
                <Tooltip label="Move section up">
                    <ActionIcon variant="subtle" size="sm" disabled={sectionIndex === 0} onClick={onMoveUp}>↑</ActionIcon>
                </Tooltip>
                <Tooltip label="Move section down">
                    <ActionIcon variant="subtle" size="sm" disabled={sectionIndex === totalSections - 1} onClick={onMoveDown}>↓</ActionIcon>
                </Tooltip>
                <Tooltip label={totalSections <= 1 ? 'A test must have at least one section' : `Delete ${section.name}`}>
                    <ActionIcon
                        variant="subtle" color="red" size="sm"
                        disabled={totalSections <= 1}
                        onClick={() => setShowDeleteConfirm(true)}
                    >
                        🗑️
                    </ActionIcon>
                </Tooltip>
            </div>

            {/* Section Body */}
            <div style={{ padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {/* Task 11.2: Mixed question type warning */}
                {(() => {
                    const uniqueTypes = new Set(section.questions.map(q => q.type));
                    if (uniqueTypes.size > 1) {
                        return (
                            <div style={{
                                padding: '0.5rem 0.75rem',
                                borderRadius: '8px',
                                background: 'rgba(245, 158, 11, 0.08)',
                                border: '1px solid rgba(245, 158, 11, 0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                fontSize: '0.8rem',
                                color: '#92400e',
                            }}>
                                <span>⚠️</span>
                                <span>This section has mixed question types — the auto-generated instruction may not be accurate. Consider writing a custom instruction.</span>
                            </div>
                        );
                    }
                    return null;
                })()}

                {/* Instruction */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                        <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#64748b' }}>Section Instruction</label>
                        {section.isCustomInstruction ? (
                            <button
                                onClick={handleResetInstruction}
                                style={{
                                    border: 'none', background: 'transparent', fontSize: '0.6875rem',
                                    color: '#8b5cf6', cursor: 'pointer', fontWeight: 600,
                                }}
                            >
                                🔄 Reset to Template
                            </button>
                        ) : (
                            <button
                                onClick={handleCreateCustomInstruction}
                                style={{
                                    border: 'none', background: 'transparent', fontSize: '0.6875rem',
                                    color: '#8b5cf6', cursor: 'pointer', fontWeight: 600,
                                }}
                            >
                                + Create Custom Instruction
                            </button>
                        )}
                    </div>
                    <Textarea
                        placeholder="Section instruction text..."
                        value={section.instructionText}
                        onChange={(e) => onUpdate({ ...section, instructionText: e.target.value, isCustomInstruction: true })}
                        size="xs"
                        minRows={2}
                        autosize
                    />
                </div>

                {/* Passage (for reading intents) */}
                {hasReadingIntents && (
                    <div style={{
                        background: 'rgba(59,130,246,0.05)',
                        borderRadius: '0.5rem',
                        border: '1px solid rgba(59,130,246,0.15)',
                        padding: '0.75rem',
                    }}>
                        <button
                            onClick={() => setShowPassage(!showPassage)}
                            style={{
                                border: 'none', background: 'transparent', fontSize: '0.8125rem',
                                color: '#2563eb', cursor: 'pointer', fontWeight: 600,
                            }}
                        >
                            📄 {showPassage ? 'Hide' : 'Show'} Reading Passage
                        </button>
                        <Collapse in={showPassage}>
                            <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <TextInput
                                    label="Passage Title"
                                    placeholder="e.g., Reading Passage 1"
                                    value={(() => {
                                        // Resolve best title: prefer flat if it looks like a real title
                                        const flat = (section as any).passageTitle;
                                        const nested = section.passage?.title;
                                        if (flat && flat !== section.name && flat !== (section as any).defaultQuestionType) return flat;
                                        return nested || flat || '';
                                    })()}
                                    onChange={(e) => {
                                        const title = e.target.value;
                                        onUpdate({
                                            ...section,
                                            passageTitle: title, // sync flat field
                                            passage: {
                                                id: section.passage?.id || crypto.randomUUID(),
                                                content: section.passage?.content || (section as any).passageContent || '',
                                                title,
                                                wordCount: section.passage?.wordCount || 0,
                                                imageUrl: section.passage?.imageUrl,
                                            },
                                        } as any);
                                    }}
                                    size="xs"
                                />
                                <Textarea
                                    label="Passage Content"
                                    placeholder="Paste the reading passage here..."
                                    value={(() => {
                                        // Resolve best content: prefer whichever is longer
                                        const flat = (section as any).passageContent as string | undefined;
                                        const nested = section.passage?.content;
                                        if (flat && nested) return flat.length >= nested.length ? flat : nested;
                                        return nested || flat || '';
                                    })()}
                                    onChange={(e) => {
                                        const content = e.target.value;
                                        const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
                                        const title = section.passage?.title || (section as any).passageTitle || '';
                                        onUpdate({
                                            ...section,
                                            passageContent: content, // sync flat field
                                            passageTitle: title,     // sync flat field
                                            passage: {
                                                id: section.passage?.id || crypto.randomUUID(),
                                                content,
                                                title,
                                                wordCount,
                                                imageUrl: section.passage?.imageUrl,
                                            },
                                        } as any);
                                    }}
                                    minRows={6}
                                    autosize
                                    size="xs"
                                />
                            </div>
                        </Collapse>
                    </div>
                )}

                {/* Task 6.2: Shuffle settings */}
                <div style={{
                    background: 'rgba(139,92,246,0.03)',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(139,92,246,0.1)',
                    padding: '0.5rem 0.75rem',
                    display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
                    fontSize: '0.8125rem',
                }}>
                    <label style={{ color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.325rem', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={section.shuffle ?? false}
                            onChange={(e) => onUpdate({ ...section, shuffle: e.target.checked })}
                        />
                        🔀 Shuffle questions in this section
                    </label>
                    <label style={{
                        color: section.shuffle ? '#64748b' : '#c0c7d0',
                        fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.325rem',
                        cursor: section.shuffle ? 'pointer' : 'not-allowed',
                    }}>
                        <input
                            type="checkbox"
                            checked={section.shuffleOptions ?? false}
                            onChange={(e) => onUpdate({ ...section, shuffleOptions: e.target.checked })}
                            disabled={!section.shuffle}
                        />
                        Shuffle MCQ options (A↔B↔C↔D)
                    </label>
                </div>

                {/* FR-12: Raw-text-fallback display */}
                {isRawFallback && (
                    <div style={{
                        background: 'rgba(251,191,36,0.06)',
                        borderRadius: '0.5rem',
                        border: '1px solid rgba(251,191,36,0.25)',
                        padding: '0.75rem',
                    }}>
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            marginBottom: '0.5rem',
                        }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem',
                                fontSize: '0.8125rem', color: '#92400e', fontWeight: 600,
                            }}>
                                <span>⚠️</span>
                                <span>Manual review required — this section uses raw text fallback</span>
                            </div>
                            <button
                                onClick={() => setEditingRawText(!editingRawText)}
                                style={{
                                    padding: '0.25rem 0.5rem', border: '1px solid rgba(251,191,36,0.3)',
                                    borderRadius: '0.375rem', background: editingRawText ? 'rgba(251,191,36,0.15)' : 'transparent',
                                    color: '#92400e', fontWeight: 600, fontSize: '0.75rem',
                                    cursor: 'pointer',
                                }}
                            >
                                {editingRawText ? '💾 Done' : '✏️ Edit'}
                            </button>
                        </div>
                        {editingRawText ? (
                            <Textarea
                                value={section.rawText || ''}
                                onChange={(e) => onUpdate({ ...section, rawText: e.target.value })}
                                minRows={6}
                                autosize
                                size="xs"
                                placeholder="Raw text from the original document..."
                            />
                        ) : (
                            <div style={{
                                padding: '0.75rem',
                                background: 'rgba(255,255,255,0.7)',
                                borderRadius: '0.375rem',
                                border: '1px solid rgba(0,0,0,0.06)',
                                whiteSpace: 'pre-wrap',
                                fontSize: '0.875rem',
                                lineHeight: 1.6,
                                color: '#374151',
                                maxHeight: '300px',
                                overflowY: 'auto',
                            }}>
                                {section.rawText || '(No raw text stored)'}
                            </div>
                        )}
                    </div>
                )}

                {/* Questions — DnD Context (Task 9.3) */}
                <DndContext
                    sensors={useSensors(
                        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
                        useSensor(KeyboardSensor)
                    )}
                    collisionDetection={closestCenter}
                    modifiers={[restrictToParentElement]}
                    onDragEnd={(event: DragEndEvent) => {
                        const { active, over } = event;
                        if (!over || active.id === over.id) return;
                        const oldIdx = section.questions.findIndex(q => q.id === active.id);
                        const newIdx = section.questions.findIndex(q => q.id === over.id);
                        if (oldIdx === -1 || newIdx === -1) return;
                        // Task 9.5: Re-number after reorder
                        requestAnimationFrame(() => {
                            const reordered = arrayMove(section.questions, oldIdx, newIdx).map((q, i) => ({
                                ...q,
                                questionNumber: globalQuestionOffset + i + 1,
                            }));
                            onUpdate({ ...section, questions: reordered });
                        });
                    }}
                >
                    <SortableContext items={section.questions.map(q => q.id)} strategy={verticalListSortingStrategy}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingLeft: 24 }}>
                            {section.questions.map((q, qi) => (
                                <SortableQuestionItem key={q.id} id={q.id}>
                                    <THCSQuestionBlock
                                        question={q}
                                        questionIndex={qi}
                                        globalNumber={globalQuestionOffset + qi + 1}
                                        sectionPointMode={section.pointMode}
                                        draftId={draftId}
                                        onUpdate={(updated) => handleUpdateQuestion(qi, updated)}
                                        onDelete={() => handleDeleteQuestion(qi)}
                                        onMoveUp={() => handleMoveQuestion(qi, -1)}
                                        onMoveDown={() => handleMoveQuestion(qi, 1)}
                                        canMoveUp={qi > 0}
                                        canMoveDown={qi < section.questions.length - 1}
                                    />
                                </SortableQuestionItem>
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>

                {/* Add Question buttons */}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                        onClick={handleAddQuestion}
                        style={{
                            padding: '0.5rem 1rem', border: '2px dashed rgba(139,92,246,0.3)',
                            borderRadius: '0.5rem', background: 'transparent',
                            color: '#8b5cf6', fontWeight: 600, fontSize: '0.875rem',
                            cursor: 'pointer', transition: 'all 0.2s',
                        }}
                    >
                        + Add Question
                    </button>
                    {/* Task 8.1: Bulk add questions */}
                    {[5, 10, 20].map(n => (
                        <button
                            key={n}
                            onClick={() => {
                                const lastQ = section.questions[section.questions.length - 1];
                                const defaultType: THCSQuestionType = lastQ ? lastQ.type : 'mcq-grammar';
                                const defaultIntent: MCQIntent | undefined = lastQ ? lastQ.intent : 'mcq-grammar';
                                const newQuestions: THCSQuestion[] = [];
                                for (let i = 0; i < n; i++) {
                                    newQuestions.push({
                                        id: crypto.randomUUID(),
                                        questionNumber: globalQuestionOffset + section.questions.length + i + 1,
                                        type: defaultType,
                                        intent: defaultIntent,
                                        questionText: '',
                                        options: ['', '', '', ''],
                                        correctAnswer: '' as any,
                                    });
                                }
                                onUpdate({ ...section, questions: [...section.questions, ...newQuestions] });
                            }}
                            style={{
                                padding: '0.375rem 0.75rem', border: '1px solid rgba(139,92,246,0.2)',
                                borderRadius: '0.375rem', background: 'rgba(139,92,246,0.04)',
                                color: '#7c3aed', fontWeight: 600, fontSize: '0.75rem',
                                cursor: 'pointer',
                            }}
                        >
                            + Add {n}
                        </button>
                    ))}
                    {/* Task 8.2: Bulk paste button */}
                    <button
                        onClick={() => setShowBulkPaste(true)}
                        style={{
                            padding: '0.375rem 0.75rem', border: '1px solid rgba(139,92,246,0.2)',
                            borderRadius: '0.375rem', background: 'rgba(139,92,246,0.04)',
                            color: '#7c3aed', fontWeight: 600, fontSize: '0.75rem',
                            cursor: 'pointer',
                        }}
                    >
                        📋 Paste Questions
                    </button>
                </div>
            </div>

            {/* Delete Confirmation */}
            <Modal
                opened={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                title="Delete Section"
                centered
                size="sm"
            >
                <Text size="sm" mb="md">
                    Delete <strong>{section.name}</strong> and all {section.questions.length} question(s) inside?
                </Text>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    <MButton variant="subtle" onClick={() => setShowDeleteConfirm(false)}>Cancel</MButton>
                    <MButton color="red" onClick={() => { onDelete(); setShowDeleteConfirm(false); }}>Delete</MButton>
                </div>
            </Modal>

            {/* Task 8.2: Bulk Paste Modal */}
            <THCSBulkPasteModal
                opened={showBulkPaste}
                onClose={() => setShowBulkPaste(false)}
                sectionName={section.name}
                onImport={(parsed) => {
                    const newQuestions: THCSQuestion[] = parsed.map((pq, i) => ({
                        id: crypto.randomUUID(),
                        questionNumber: globalQuestionOffset + section.questions.length + i + 1,
                        type: pq.type,
                        questionText: pq.text,
                        options: (pq.options || ['', '', '', '']) as [string, string, string, string],
                        correctAnswer: (pq.correctAnswer || '') as any,
                        blankCount: pq.blankCount,
                        blankAnswers: pq.blankAnswers?.map(ans => ({ acceptedAnswers: ans })),
                    }));
                    onUpdate({ ...section, questions: [...section.questions, ...newQuestions] });
                }}
            />
        </div>
    );
};

export default THCSSectionBlock;
