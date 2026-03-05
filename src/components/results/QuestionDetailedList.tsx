/**
 * QuestionDetailedList — Detailed mode for THCS test results
 * 
 * Scrollable card list of all questions, each expandable
 * with answer details, corrections, model answers, and grading info.
 * 
 * Follows student-view-design standard (flat, no glass).
 */

import React, { useState } from 'react';
import type { QuestionResultItem } from './QuestionPillsGrid';

interface QuestionDetailedListProps {
    questions: QuestionResultItem[];
    /** Format answer for display */
    formatAnswer: (answer: any) => string;
}

// Student-view-design colors (flat)
const COLORS = {
    surface: '#ffffff',
    surfaceAlt: '#f9fafb',
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
};

const getStatusColor = (q: QuestionResultItem) => {
    if (q.isCorrect) return { bg: COLORS.successBg, border: COLORS.successText, text: COLORS.successText };
    if (q.score > 0 && q.score < q.maxScore) return { bg: COLORS.warningBg, border: COLORS.warningText, text: COLORS.warningText };
    return { bg: COLORS.errorBg, border: COLORS.errorText, text: COLORS.errorText };
};

const isWritingQuestion = (q: QuestionResultItem) =>
    q.questionType === 'writing' || q.questionType === 'sentence-rewrite' || q.questionType === 'sentence-rewrite-keyword';

export const QuestionDetailedList: React.FC<QuestionDetailedListProps> = ({ questions, formatAnswer }) => {
    const [expandedQuestions, setExpandedQuestions] = useState<Set<number>>(new Set());

    const toggleQuestion = (qNum: number) => {
        setExpandedQuestions(prev => {
            const next = new Set(prev);
            if (next.has(qNum)) next.delete(qNum);
            else next.add(qNum);
            return next;
        });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {questions.map(q => {
                const isExpanded = expandedQuestions.has(q.questionNumber);
                const colors = getStatusColor(q);
                const writing = isWritingQuestion(q);

                return (
                    <div
                        key={q.questionNumber}
                        style={{
                            background: COLORS.surface,
                            border: `1px solid ${COLORS.border}`,
                            borderRadius: '12px',
                            overflow: 'hidden',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                        }}
                    >
                        {/* Question Header — clickable */}
                        <div
                            onClick={() => toggleQuestion(q.questionNumber)}
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '0.75rem 1rem',
                                cursor: 'pointer',
                                background: isExpanded ? COLORS.surfaceAlt : COLORS.surface,
                                transition: 'background 0.15s ease',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                                {/* Number badge */}
                                <div style={{
                                    width: '36px', height: '36px', borderRadius: '8px',
                                    background: colors.bg, border: `1px solid ${colors.border}`,
                                    color: colors.text, fontWeight: 700, fontSize: '0.85rem',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                }}>
                                    {q.questionNumber}
                                </div>

                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: COLORS.textPrimary }}>
                                        Q{q.questionNumber}
                                        {writing && <span style={{ fontWeight: 400, color: COLORS.textDim, marginLeft: '6px', fontSize: '0.8rem' }}>(Writing)</span>}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: colors.text, fontWeight: 600 }}>
                                        {q.isCorrect ? '✓ Correct' : q.score > 0 ? '⚡ Partial' : '✗ Incorrect'}
                                        {' '} — {q.score}/{q.maxScore}
                                    </div>
                                </div>
                            </div>

                            {/* Expand arrow */}
                            <div style={{
                                fontSize: '1rem', color: COLORS.textDim,
                                transition: 'transform 0.2s ease',
                                transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            }}>
                                ▼
                            </div>
                        </div>

                        {/* Expanded Details */}
                        {isExpanded && (
                            <div style={{
                                padding: '0.75rem 1rem',
                                borderTop: `1px solid ${COLORS.border}`,
                            }}>
                                {/* Original Sentence (writing) */}
                                {writing && q.originalSentence && (
                                    <div style={{ marginBottom: '0.75rem' }}>
                                        <div style={{ fontSize: '0.7rem', color: COLORS.textMuted, textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>
                                            Original Sentence
                                        </div>
                                        <div style={{
                                            padding: '0.5rem 0.75rem', background: '#f3f4f6',
                                            borderRadius: '8px', fontSize: '0.85rem', color: COLORS.textBody,
                                            fontStyle: 'italic',
                                        }}>
                                            {q.originalSentence}
                                        </div>
                                    </div>
                                )}

                                {/* Student Answer */}
                                <div style={{ marginBottom: '0.75rem' }}>
                                    <div style={{ fontSize: '0.7rem', color: COLORS.textMuted, textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>
                                        Your Answer
                                    </div>
                                    <div style={{
                                        padding: '0.5rem 0.75rem', background: colors.bg,
                                        border: `1px solid ${colors.border}`, borderRadius: '8px',
                                        fontSize: '0.85rem', color: COLORS.textPrimary, fontFamily: 'monospace',
                                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                    }}>
                                        {q.studentAnswer ? formatAnswer(q.studentAnswer) : '(No answer submitted)'}
                                    </div>
                                </div>

                                {/* Correct Answer — only if not full marks and answer exists */}
                                {!q.isCorrect && q.correctAnswer && (
                                    <div style={{ marginBottom: '0.75rem' }}>
                                        <div style={{ fontSize: '0.7rem', color: COLORS.textMuted, textTransform: 'uppercase', fontWeight: 600, marginBottom: '4px' }}>
                                            Correct Answer
                                        </div>
                                        <div style={{
                                            padding: '0.5rem 0.75rem', background: COLORS.successBg,
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

                                {/* Auto Feedback */}
                                {q.feedback && (
                                    <div style={{
                                        padding: '0.5rem 0.75rem', background: COLORS.surfaceAlt,
                                        borderRadius: '8px', fontSize: '0.8rem', color: COLORS.textMuted,
                                        fontStyle: 'italic',
                                        marginBottom: q.teacherFeedback || q.gradedByName ? '0.75rem' : 0,
                                    }}>
                                        {q.feedback}
                                    </div>
                                )}

                                {/* Teacher Feedback */}
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

                                {/* Graded by (backward compat: only if exists) */}
                                {q.gradedByName && (
                                    <div style={{
                                        fontSize: '0.7rem', color: COLORS.textDim, fontStyle: 'italic',
                                        display: 'flex', alignItems: 'center', gap: '4px',
                                    }}>
                                        Graded by {q.gradedByName}
                                        {q.gradedAt && <span> — {new Date(q.gradedAt).toLocaleDateString()}</span>}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default QuestionDetailedList;
