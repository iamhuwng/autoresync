/**
 * QuestionPillsGrid — Overview mode for THCS test results
 * 
 * Displays a clickable grid of colored pills:
 * - Green: correct
 * - Red: incorrect (0 score)
 * - Amber: partial credit or pending writing
 * 
 * Click a pill to expand its detail card inline.
 * Follows student-view-design standard (flat, no glass).
 */

import React, { useState } from 'react';

/** Single question result from permanent record */
export interface QuestionResultItem {
    questionNumber: number;
    questionType: string;
    isCorrect: boolean;
    score: number;
    maxScore: number;
    studentAnswer: any;
    correctAnswer: any;
    feedback: string;
    teacherFeedback?: string;
    gradedByName?: string;
    gradedByUid?: string;
    gradedAt?: number;
    modelAnswers?: string[];
    originalSentence?: string;
}

interface QuestionPillsGridProps {
    questions: QuestionResultItem[];
    /** Format answer for display */
    formatAnswer: (answer: any) => string;
}

// Student-view-design colors (flat)
const COLORS = {
    surface: '#ffffff',
    border: '#e5e7eb',
    textPrimary: '#111827',
    textBody: '#374151',
    textMuted: '#6b7280',
    textDim: '#9ca3af',
    successBg: '#d1fae5',
    successText: '#059669',
    warningBg: '#fef3c7',
    warningText: '#d97706',
    errorBg: '#fee2e2',
    errorText: '#dc2626',
    accent: '#4f46e5',
};

const getPillColor = (q: QuestionResultItem) => {
    if (q.isCorrect) return { bg: COLORS.successBg, border: COLORS.successText, text: COLORS.successText };
    if (q.score > 0 && q.score < q.maxScore) return { bg: COLORS.warningBg, border: COLORS.warningText, text: COLORS.warningText };
    return { bg: COLORS.errorBg, border: COLORS.errorText, text: COLORS.errorText };
};

const isWritingQuestion = (q: QuestionResultItem) =>
    q.questionType === 'writing' || q.questionType === 'sentence-rewrite' || q.questionType === 'sentence-rewrite-keyword';

export const QuestionPillsGrid: React.FC<QuestionPillsGridProps> = ({ questions, formatAnswer }) => {
    const [expandedQ, setExpandedQ] = useState<number | null>(null);

    return (
        <div>
            {/* Pills Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))',
                gap: '8px',
                marginBottom: expandedQ !== null ? '1rem' : 0,
            }}>
                {questions.map(q => {
                    const colors = getPillColor(q);
                    const isActive = expandedQ === q.questionNumber;
                    return (
                        <button
                            key={q.questionNumber}
                            onClick={() => setExpandedQ(isActive ? null : q.questionNumber)}
                            style={{
                                width: '44px',
                                height: '44px',
                                borderRadius: '10px',
                                border: isActive ? `2px solid ${COLORS.accent}` : `1px solid ${colors.border}`,
                                background: colors.bg,
                                color: colors.text,
                                fontWeight: 700,
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'transform 0.1s ease, box-shadow 0.1s ease',
                                transform: isActive ? 'scale(1.1)' : 'scale(1)',
                                boxShadow: isActive ? `0 0 0 3px ${COLORS.accent}33` : '0 1px 2px rgba(0,0,0,0.05)',
                            }}
                            aria-label={`Question ${q.questionNumber} - ${q.isCorrect ? 'correct' : q.score > 0 ? 'partial' : 'incorrect'}`}
                        >
                            {q.questionNumber}
                        </button>
                    );
                })}
            </div>

            {/* Expanded Detail Card */}
            {expandedQ !== null && (() => {
                const q = questions.find(x => x.questionNumber === expandedQ);
                if (!q) return null;
                const colors = getPillColor(q);
                const writing = isWritingQuestion(q);

                return (
                    <div style={{
                        background: COLORS.surface,
                        border: `1px solid ${COLORS.border}`,
                        borderRadius: '12px',
                        padding: '1rem 1.25rem',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                    }}>
                        {/* Header */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '0.75rem',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{
                                    width: '32px', height: '32px', borderRadius: '8px',
                                    background: colors.bg, border: `1px solid ${colors.border}`,
                                    color: colors.text, fontWeight: 700, fontSize: '0.85rem',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    {q.questionNumber}
                                </span>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: '0.95rem', color: COLORS.textPrimary }}>
                                        Question {q.questionNumber}
                                        {writing && <span style={{ fontWeight: 400, color: COLORS.textDim, marginLeft: '6px' }}>(Writing)</span>}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: colors.text, fontWeight: 600 }}>
                                        {q.isCorrect ? '✓ Correct' : q.score > 0 ? '⚡ Partial' : '✗ Incorrect'}
                                        {' '} — {q.score}/{q.maxScore}
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => setExpandedQ(null)}
                                style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    fontSize: '1.2rem', color: COLORS.textDim, padding: '4px',
                                }}
                                aria-label="Close detail"
                            >✕</button>
                        </div>

                        {/* Student Answer */}
                        <div style={{ marginBottom: '0.75rem' }}>
                            <div style={{ fontSize: '0.7rem', color: COLORS.textMuted, textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>
                                Your Answer
                            </div>
                            <div style={{
                                padding: '0.6rem 0.75rem', background: colors.bg,
                                border: `1px solid ${colors.border}`, borderRadius: '8px',
                                fontSize: '0.85rem', color: COLORS.textPrimary, fontFamily: 'monospace',
                                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                            }}>
                                {q.studentAnswer ? formatAnswer(q.studentAnswer) : '(No answer submitted)'}
                            </div>
                        </div>

                        {/* Correct Answer — only shown if exists and not full marks */}
                        {!q.isCorrect && q.correctAnswer && (
                            <div style={{ marginBottom: '0.75rem' }}>
                                <div style={{ fontSize: '0.7rem', color: COLORS.textMuted, textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>
                                    Correct Answer
                                </div>
                                <div style={{
                                    padding: '0.6rem 0.75rem', background: COLORS.successBg,
                                    border: `1px solid ${COLORS.successText}`, borderRadius: '8px',
                                    fontSize: '0.85rem', fontWeight: 600, color: COLORS.successText,
                                    fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                }}>
                                    {formatAnswer(q.correctAnswer)}
                                </div>
                            </div>
                        )}

                        {/* Model Answers (writing only, if present) */}
                        {writing && q.modelAnswers && q.modelAnswers.length > 0 && (
                            <div style={{ marginBottom: '0.75rem' }}>
                                <div style={{ fontSize: '0.7rem', color: COLORS.textMuted, textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>
                                    Model Answer{q.modelAnswers.length > 1 ? 's' : ''}
                                </div>
                                {q.modelAnswers.map((ma, i) => (
                                    <div key={i} style={{
                                        padding: '0.5rem 0.75rem', background: '#f0fdf4',
                                        border: '1px solid #bbf7d0', borderRadius: '8px',
                                        fontSize: '0.85rem', color: COLORS.textBody,
                                        marginBottom: i < q.modelAnswers!.length - 1 ? '4px' : 0,
                                    }}>
                                        {ma}
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Feedback */}
                        {q.feedback && (
                            <div style={{
                                padding: '0.5rem 0.75rem', background: '#f9fafb',
                                borderRadius: '8px', fontSize: '0.8rem', color: COLORS.textMuted,
                                fontStyle: 'italic', marginBottom: q.teacherFeedback || q.gradedByName ? '0.75rem' : 0,
                            }}>
                                {q.feedback}
                            </div>
                        )}

                        {/* Teacher Feedback (writing) */}
                        {q.teacherFeedback && (
                            <div style={{
                                padding: '0.5rem 0.75rem', background: '#eff6ff',
                                border: '1px solid #bfdbfe', borderRadius: '8px',
                                fontSize: '0.8rem', color: '#1e40af',
                                marginBottom: q.gradedByName ? '0.5rem' : 0,
                            }}>
                                <span style={{ fontWeight: 600 }}>Teacher:</span> {q.teacherFeedback}
                            </div>
                        )}

                        {/* Graded by (backward compat: only show if exists) */}
                        {q.gradedByName && (
                            <div style={{
                                fontSize: '0.7rem', color: COLORS.textDim, fontStyle: 'italic',
                                display: 'flex', alignItems: 'center', gap: '4px',
                            }}>
                                Graded by {q.gradedByName}
                                {q.gradedAt && (
                                    <span> — {new Date(q.gradedAt).toLocaleDateString()}</span>
                                )}
                            </div>
                        )}
                    </div>
                );
            })()}
        </div>
    );
};

export default QuestionPillsGrid;
