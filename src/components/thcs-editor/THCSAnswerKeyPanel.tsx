/**
 * THCSAnswerKeyPanel — Extended answer key panel for all question types (PRD-0028 Task 3.4)
 * Groups questions by type: MCQ → Fill-in → Writing → Cloze
 */
import React, { useState, useMemo } from 'react';
import { Collapse, Text } from '@mantine/core';
import type { THCSSection, THCSQuestion } from '../../types/thcs-test.types';
import { INSTRUCTION_TEMPLATES } from '../../types/thcs-test.types';
import THCSFillInAnswerInput from './THCSFillInAnswerInput';
import THCSWritingAnswerInput from './THCSWritingAnswerInput';
import THCSClozeAnswerInput from './THCSClozeAnswerInput';

interface THCSAnswerKeyPanelProps {
    sections: THCSSection[];
    onUpdateAnswer: (sectionIndex: number, questionIndex: number, answer: 'A' | 'B' | 'C' | 'D') => void;
    onUpdateFillInAnswers?: (sectionIndex: number, questionIndex: number, blankIndex: number, answers: string[]) => void;
    onUpdateModelAnswers?: (sectionIndex: number, questionIndex: number, answers: string[]) => void;
    onUpdateClozeMapping?: (sectionIndex: number, questionIndex: number, blankNum: number, word: string) => void;
    onRequestAISuggestions?: (sectionIndex: number, questionIndex: number) => void;
}

const LABELS = ['A', 'B', 'C', 'D'] as const;

type QuestionWithIndex = THCSQuestion & { sectionIndex: number; questionIndex: number };

const THCSAnswerKeyPanel: React.FC<THCSAnswerKeyPanelProps> = ({
    sections, onUpdateAnswer, onUpdateFillInAnswers, onUpdateModelAnswers,
    onUpdateClozeMapping, onRequestAISuggestions,
}) => {
    const [open, setOpen] = useState(false);

    const allQuestions: QuestionWithIndex[] = useMemo(() =>
        sections.flatMap((s, si) =>
            s.questions.map((q, qi) => ({ ...q, sectionIndex: si, questionIndex: qi }))
        ), [sections]);

    // Group by type category
    const mcqQuestions = allQuestions.filter(q => q.type in INSTRUCTION_TEMPLATES);
    const fillInQuestions = allQuestions.filter(q => q.type === 'verb-form' || q.type === 'word-form');
    const writingQuestions = allQuestions.filter(q => q.type === 'sentence-rewrite' || q.type === 'sentence-rewrite-keyword');
    const clozeQuestions = allQuestions.filter(q => q.type === 'reading-cloze-wordbank');

    // Count answered/missing per type
    const mcqAnswered = mcqQuestions.filter(q => q.correctAnswer).length;
    const fillInAnswered = fillInQuestions.filter(q =>
        q.blankAnswers && q.blankAnswers.length > 0 && q.blankAnswers.every(b => b.acceptedAnswers.length > 0)
    ).length;
    const writingAnswered = writingQuestions.filter(q => q.modelAnswers && q.modelAnswers.length > 0).length;
    const clozeAnswered = clozeQuestions.filter(q => {
        if (!q.blankMapping || !q.passageTemplate) return false;
        const regex = /___\((\d+)\)___/g;
        let match;
        const blanks: number[] = [];
        while ((match = regex.exec(q.passageTemplate)) !== null) blanks.push(parseInt(match[1]!, 10));
        return blanks.every(n => q.blankMapping![n]);
    }).length;

    const total = allQuestions.length;
    const answered = mcqAnswered + fillInAnswered + writingAnswered + clozeAnswered;
    const missing = total - answered;

    return (
        <div style={{
            background: 'rgba(255,255,255,0.9)',
            backdropFilter: 'blur(12px)',
            borderRadius: '1rem',
            border: '1px solid rgba(139,92,246,0.15)',
            overflow: 'hidden',
        }}>
            {/* Toggle header */}
            <button
                onClick={() => setOpen(!open)}
                style={{
                    width: '100%', padding: '0.75rem 1.5rem',
                    background: 'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(99,102,241,0.08) 100%)',
                    border: 'none', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between',
                }}
            >
                <span style={{ fontWeight: 700, color: '#1e293b', fontSize: '1rem' }}>
                    🔑 Answer Key
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Text size="sm" c="dimmed">
                        {answered}/{total} answered
                        {missing > 0 && <span style={{ color: '#f59e0b', fontWeight: 600 }}> | {missing} missing</span>}
                    </Text>
                    <span style={{
                        transform: open ? 'rotate(180deg)' : 'rotate(0)',
                        transition: 'transform 0.2s', fontSize: '0.75rem',
                    }}>▼</span>
                </div>
            </button>

            <Collapse in={open}>
                <div style={{ padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                    {/* MCQ Section */}
                    {mcqQuestions.length > 0 && (
                        <div>
                            <div style={{
                                fontSize: '0.75rem', fontWeight: 700, color: '#8b5cf6',
                                textTransform: 'uppercase', letterSpacing: '0.05em',
                                marginBottom: '0.375rem', borderBottom: '1px solid rgba(139,92,246,0.1)',
                                paddingBottom: '0.25rem',
                            }}>
                                MCQ ({mcqAnswered}/{mcqQuestions.length})
                            </div>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                gap: '0.375rem',
                            }}>
                                {mcqQuestions.map((q) => (
                                    <div
                                        key={q.id}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '0.375rem',
                                            padding: '0.25rem 0.5rem',
                                            borderRadius: '0.375rem',
                                            background: q.correctAnswer ? 'transparent' : 'rgba(245,158,11,0.08)',
                                            border: q.correctAnswer ? 'none' : '1px solid rgba(245,158,11,0.2)',
                                        }}
                                    >
                                        <span style={{
                                            fontWeight: 700, fontSize: '0.75rem', minWidth: 28,
                                            color: q.correctAnswer ? '#64748b' : '#f59e0b',
                                        }}>
                                            Q{q.questionNumber}:
                                        </span>
                                        {LABELS.map((label) => (
                                            <label
                                                key={label}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '2px',
                                                    cursor: 'pointer', fontSize: '0.75rem',
                                                    fontWeight: q.correctAnswer === label ? 700 : 400,
                                                    color: q.correctAnswer === label ? '#8b5cf6' : '#94a3b8',
                                                }}
                                            >
                                                <input
                                                    type="radio"
                                                    name={`ak-${q.id}`}
                                                    checked={q.correctAnswer === label}
                                                    onChange={() => onUpdateAnswer(q.sectionIndex, q.questionIndex, label)}
                                                    style={{ accentColor: '#8b5cf6', width: 12, height: 12 }}
                                                />
                                                {label}
                                            </label>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Fill-in Section */}
                    {fillInQuestions.length > 0 && (
                        <div>
                            <div style={{
                                fontSize: '0.75rem', fontWeight: 700, color: '#6366f1',
                                textTransform: 'uppercase', letterSpacing: '0.05em',
                                marginBottom: '0.375rem', borderBottom: '1px solid rgba(99,102,241,0.1)',
                                paddingBottom: '0.25rem',
                            }}>
                                Fill-in ({fillInAnswered}/{fillInQuestions.length})
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {fillInQuestions.map((q) => (
                                    <div key={q.id} style={{
                                        padding: '0.375rem 0.5rem',
                                        borderRadius: '0.375rem',
                                        border: '1px solid rgba(99,102,241,0.08)',
                                    }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6366f1' }}>
                                            Q{q.questionNumber}
                                        </span>
                                        <THCSFillInAnswerInput
                                            blankAnswers={q.blankAnswers || []}
                                            onUpdate={(blankIndex, answers) =>
                                                onUpdateFillInAnswers?.(q.sectionIndex, q.questionIndex, blankIndex, answers)
                                            }
                                            onRequestAI={() => onRequestAISuggestions?.(q.sectionIndex, q.questionIndex)}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Writing Section */}
                    {writingQuestions.length > 0 && (
                        <div>
                            <div style={{
                                fontSize: '0.75rem', fontWeight: 700, color: '#059669',
                                textTransform: 'uppercase', letterSpacing: '0.05em',
                                marginBottom: '0.375rem', borderBottom: '1px solid rgba(16,185,129,0.1)',
                                paddingBottom: '0.25rem',
                            }}>
                                Writing ({writingAnswered}/{writingQuestions.length})
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {writingQuestions.map((q) => (
                                    <div key={q.id} style={{
                                        padding: '0.375rem 0.5rem',
                                        borderRadius: '0.375rem',
                                        border: '1px solid rgba(16,185,129,0.08)',
                                    }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#059669' }}>
                                            Q{q.questionNumber} ({q.type === 'sentence-rewrite' ? 'E1' : 'E2'})
                                        </span>
                                        <THCSWritingAnswerInput
                                            modelAnswers={q.modelAnswers || []}
                                            onUpdate={(answers) =>
                                                onUpdateModelAnswers?.(q.sectionIndex, q.questionIndex, answers)
                                            }
                                            onRequestAI={() => onRequestAISuggestions?.(q.sectionIndex, q.questionIndex)}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Cloze Section */}
                    {clozeQuestions.length > 0 && (
                        <div>
                            <div style={{
                                fontSize: '0.75rem', fontWeight: 700, color: '#2563eb',
                                textTransform: 'uppercase', letterSpacing: '0.05em',
                                marginBottom: '0.375rem', borderBottom: '1px solid rgba(37,99,235,0.1)',
                                paddingBottom: '0.25rem',
                            }}>
                                Cloze ({clozeAnswered}/{clozeQuestions.length})
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {clozeQuestions.map((q) => {
                                    const regex = /___\((\d+)\)___/g;
                                    let match;
                                    const blanks: number[] = [];
                                    while ((match = regex.exec(q.passageTemplate || '')) !== null) {
                                        blanks.push(parseInt(match[1]!, 10));
                                    }
                                    return (
                                        <div key={q.id} style={{
                                            padding: '0.375rem 0.5rem',
                                            borderRadius: '0.375rem',
                                            border: '1px solid rgba(37,99,235,0.08)',
                                        }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#2563eb', marginBottom: '0.25rem', display: 'block' }}>
                                                Q{q.questionNumber} — {blanks.length} blanks
                                            </span>
                                            {blanks.map(blankNum => (
                                                <THCSClozeAnswerInput
                                                    key={blankNum}
                                                    wordBank={q.wordBank || []}
                                                    selectedWord={(q.blankMapping || {})[blankNum] || ''}
                                                    blankNumber={blankNum}
                                                    onUpdate={(word) =>
                                                        onUpdateClozeMapping?.(q.sectionIndex, q.questionIndex, blankNum, word)
                                                    }
                                                />
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </Collapse>
        </div>
    );
};

export default THCSAnswerKeyPanel;
