import React, { useState } from 'react';
import { Text, Stack, Badge, Group, ActionIcon } from '@mantine/core';
import { Button } from '../../modern';
import { IconTrash, IconClock, IconPlus, IconFileText, IconList } from '@tabler/icons-react';

interface QuestionListProps {
    questions: any[];
    editedQuestions: Record<number, any>;
    selectedQuestionIndex: number | null;
    modifiedQuestions?: Set<number>;
    onQuestionSelect: (index: number) => void;
    onAddQuestion: () => void;
    onDeleteQuestion: (index: number) => void;
    onUpdateQuestionTimer?: (index: number, question: any) => void;
    showAddOptions: boolean;
    onSelectSingle: () => void;
    onSelectBulk: () => void;
    onCancelAdd: () => void;
    readOnly?: boolean;
}

export const QuestionList: React.FC<QuestionListProps> = ({
    questions,
    editedQuestions,
    selectedQuestionIndex,
    modifiedQuestions,
    onQuestionSelect,
    onAddQuestion,
    onDeleteQuestion,
    onUpdateQuestionTimer,
    showAddOptions,
    onSelectSingle,
    onSelectBulk,
    onCancelAdd,
    readOnly = false
}) => {
    const [editingTimerIndex, setEditingTimerIndex] = useState<number | null>(null);
    const [tempTimerValue, setTempTimerValue] = useState(30);

    const handleTimerDoubleClick = (index: number, currentTimer: number) => {
        if (readOnly) return;
        setTempTimerValue(currentTimer || 10);
        setEditingTimerIndex(index);
    };

    const handleTimerBlur = (index: number, question: any) => {
        if (onUpdateQuestionTimer) {
            onUpdateQuestionTimer(index, {
                ...question,
                timer: tempTimerValue
            });
        }
        setEditingTimerIndex(null);
    };

    const handleTimerKeyDown = (e: React.KeyboardEvent, index: number, question: any) => {
        if (e.key === 'Enter') {
            handleTimerBlur(index, question);
        } else if (e.key === 'Escape') {
            setEditingTimerIndex(null);
        }
    };

    // If showing Add Options, render that view
    if (showAddOptions) {
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                padding: '2rem 1rem',
                height: '100%',
                overflowY: 'auto'
            }}>
                <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                    <Text size="lg" fw={700} style={{ color: '#1e293b', marginBottom: '0.5rem' }}>
                        Add Questions
                    </Text>
                    <Text size="sm" style={{ color: '#64748b' }}>
                        Choose how you want to add questions
                    </Text>
                </div>

                {/* Add Single Question Button */}
                <button
                    onClick={onSelectSingle}
                    style={{
                        padding: '1.5rem',
                        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(59, 130, 246, 0.08) 100%)',
                        border: '2px solid rgba(139, 92, 246, 0.2)',
                        borderRadius: '0.75rem',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.75rem'
                    }}
                >
                    <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '0.75rem',
                        background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <IconFileText size={24} color="white" />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <Text size="md" fw={700} style={{ color: '#1e293b', marginBottom: '0.25rem' }}>
                            Add 1 Question
                        </Text>
                        <Text size="sm" style={{ color: '#64748b' }}>
                            Create a single question with custom fields
                        </Text>
                    </div>
                </button>

                {/* Add Bulk Questions Button */}
                <button
                    onClick={onSelectBulk}
                    style={{
                        padding: '1.5rem',
                        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(14, 165, 233, 0.08) 100%)',
                        border: '2px solid rgba(59, 130, 246, 0.2)',
                        borderRadius: '0.75rem',
                        cursor: 'pointer',
                        transition: 'all 0.3s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.75rem'
                    }}
                >
                    <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '0.75rem',
                        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <IconList size={24} color="white" />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                        <Text size="md" fw={700} style={{ color: '#1e293b', marginBottom: '0.25rem' }}>
                            Add Bulk Questions
                        </Text>
                        <Text size="sm" style={{ color: '#64748b' }}>
                            Paste text or upload files for AI parsing
                        </Text>
                    </div>
                </button>

                {/* Cancel Button */}
                <Button
                    variant="glass"
                    onClick={onCancelAdd}
                    style={{ marginTop: '0.5rem' }}
                >
                    Cancel
                </Button>
            </div>
        );
    }

    // Render List
    return (
        <div style={{
            flex: 1,
            height: '100%',
            minHeight: 0,
            overflowY: 'auto',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem'
        }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
                <Button
                    variant="glass"
                    size="sm"
                    style={{ padding: '0.25rem 0.5rem', height: 'auto', cursor: readOnly ? 'not-allowed' : undefined, opacity: readOnly ? 0.5 : 1 }}
                    onClick={() => !readOnly && onAddQuestion()}
                    disabled={readOnly}
                >
                    <IconPlus size={16} />
                    <span style={{ marginLeft: '0.25rem' }}>Add Question</span>
                </Button>
            </div>

            <Stack gap="sm">
                {questions.map((question, index) => {
                    // Get the edited version of this question if it exists
                    const displayQuestion = editedQuestions && editedQuestions[index] ? editedQuestions[index] : question;
                    const isSelected = selectedQuestionIndex === index;
                    const isHidden = displayQuestion.hidden || false;
                    // const isModified = modifiedQuestions?.has(index) || false;
                    const timer = displayQuestion.timer || 10;
                    const isTimerEditing = editingTimerIndex === index;

                    return (
                        <div
                            key={index}
                            style={{
                                display: 'flex',
                                gap: '0.5rem',
                                alignItems: 'center',
                                padding: '1rem',
                                background: isSelected
                                    ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(59, 130, 246, 0.15) 100%)'
                                    : isHidden
                                        ? 'rgba(203, 213, 225, 0.3)'
                                        : 'rgba(255, 255, 255, 0.5)',
                                backdropFilter: 'blur(10px)',
                                WebkitBackdropFilter: 'blur(10px)',
                                borderRadius: '0.75rem',
                                border: isSelected ? '2px solid rgba(139, 92, 246, 0.5)' : '1px solid rgba(255, 255, 255, 0.3)',
                                boxShadow: isSelected ? '0 4px 12px rgba(139, 92, 246, 0.15)' : '0 2px 8px rgba(0, 0, 0, 0.05)',
                                transition: 'all 0.3s ease',
                                position: 'relative',
                                opacity: isHidden ? 0.6 : 1,
                                cursor: 'pointer'
                            }}
                            onClick={() => onQuestionSelect(index)}
                        >
                            {/* Question Number Badge */}
                            <div
                                style={{
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '50%',
                                    background: isSelected ? '#8b5cf6' : '#cbd5e1',
                                    color: 'white',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 700,
                                    fontSize: '0.875rem',
                                    flexShrink: 0
                                }}
                            >
                                {index + 1}
                            </div>

                            {/* Content */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                                    <Badge
                                        size="xs"
                                        variant="light"
                                        color={
                                            displayQuestion.type === 'multiple-choice' ? 'blue' :
                                                displayQuestion.type === 'true-false' ? 'cyan' :
                                                    displayQuestion.type === 'fill-in-the-blank' ? 'orange' : 'gray'
                                        }
                                    >
                                        {displayQuestion.type?.replace(/-/g, ' ')}
                                    </Badge>

                                    {/* Timer Display/Edit */}
                                    <div
                                        style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: readOnly ? 'default' : 'text' }}
                                        onDoubleClick={(e) => {
                                            e.stopPropagation();
                                            handleTimerDoubleClick(index, timer);
                                        }}
                                    >
                                        <IconClock size={12} color="#64748b" />
                                        {isTimerEditing ? (
                                            <input
                                                autoFocus
                                                type="number"
                                                value={tempTimerValue}
                                                onClick={(e) => e.stopPropagation()}
                                                onChange={(e) => setTempTimerValue(parseInt(e.target.value) || 0)}
                                                onBlur={() => handleTimerBlur(index, displayQuestion)}
                                                onKeyDown={(e) => handleTimerKeyDown(e, index, displayQuestion)}
                                                style={{ width: '40px', padding: '0 4px', borderRadius: '4px', border: '1px solid #8b5cf6' }}
                                            />
                                        ) : (
                                            <Text size="xs" c="dimmed">{timer}s</Text>
                                        )}
                                    </div>
                                </div>

                                <Text
                                    size="sm"
                                    fw={500}
                                    lineClamp={2}
                                    style={{ color: displayQuestion.question ? '#1e293b' : '#94a3b8', fontStyle: displayQuestion.question ? 'normal' : 'italic' }}
                                >
                                    {displayQuestion.question || '(No question text)'}
                                </Text>
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                <ActionIcon
                                    variant="subtle"
                                    color="gray" // Change from red to gray when readOnly if desired, but red and disabled is fine
                                    size="sm"
                                    disabled={readOnly}
                                    style={{
                                        opacity: readOnly ? 0.3 : 1,
                                        cursor: readOnly ? 'not-allowed' : 'pointer'
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (readOnly) return;
                                        if (window.confirm('Delete this question?')) {
                                            onDeleteQuestion(index);
                                        }
                                    }}
                                >
                                    <IconTrash size={14} color={readOnly ? 'gray' : '#ef4444'} />
                                </ActionIcon>
                            </div>
                        </div>
                    );
                })}
            </Stack>
        </div>
    );
};
