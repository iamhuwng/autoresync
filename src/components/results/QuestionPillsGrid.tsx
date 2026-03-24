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

import React, { useMemo, useState } from 'react';
import {
    getPreferredQuestionExplanation,
    getRenderableQuestionExplanations,
} from '../../services/formativeFeedback.service';
import type { FormativeFeedback } from '../../types/thcs-test.types';

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
    /** AI-generated explanations keyed by "Q{number}" or "{number}" */
    aiExplanations?: Record<string, string>;
    formativeFeedback?: FormativeFeedback;
    /** Whether detailed AI explanations are still being upgraded/generated */
    aiExplanationPending?: boolean;
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

/** Extract a short display label from a student answer for the pill */
const getShortAnswerLabel = (answer: any, formatAnswer: (a: any) => string): string => {
    if (!answer && answer !== 0) return '—';
    const formatted = formatAnswer(answer);
    if (!formatted || formatted === '(No answer submitted)') return '—';
    // Single letter answers (A, B, C, D) — most common for MCQ
    const trimmed = formatted.trim();
    if (trimmed.length <= 2) return trimmed.toUpperCase();
    // IELTS abbreviation map (Task 7.8)
    const lower = trimmed.toLowerCase();
    const ieltsMap: Record<string, string> = {
        'true': 'T', 'false': 'F', 'not given': 'NG',
        'yes': 'Y', 'no': 'N',
    };
    if (ieltsMap[lower]) return ieltsMap[lower];
    // If it starts with a letter option like "A." or "a)" extract just the letter
    const letterMatch = trimmed.match(/^([A-Da-d])[.)\s]/);
    if (letterMatch) return letterMatch[1]!.toUpperCase();
    // For longer answers (writing, sentence-rewrite), show a pen icon
    if (trimmed.length > 3) return '✎';
    return trimmed.charAt(0).toUpperCase();
};

export const QuestionPillsGrid: React.FC<QuestionPillsGridProps> = ({
    questions,
    formatAnswer,
    aiExplanations,
    formativeFeedback,
    aiExplanationPending = false,
}) => {
    const [expandedQ, setExpandedQ] = useState<number | null>(null);
    const renderableExplanations = useMemo(
        () => getRenderableQuestionExplanations(aiExplanations),
        [aiExplanations],
    );

    return (
        <div>
            {/* Tooltip CSS */}
            <style>{`
                .qpill-wrap {
                    position: relative;
                }
                .qpill-wrap[data-tooltip]::after {
                    content: attr(data-tooltip);
                    position: absolute;
                    bottom: calc(100% + 6px);
                    left: 50%;
                    transform: translateX(-50%);
                    background: #1e293b;
                    color: #fff;
                    font-size: 0.7rem;
                    font-weight: 600;
                    padding: 4px 10px;
                    border-radius: 6px;
                    white-space: nowrap;
                    pointer-events: none;
                    opacity: 0;
                    transition: opacity 0.15s ease;
                    z-index: 10;
                    font-family: Inter, system-ui, sans-serif;
                }
                .qpill-wrap[data-tooltip]::before {
                    content: '';
                    position: absolute;
                    bottom: calc(100% + 1px);
                    left: 50%;
                    transform: translateX(-50%);
                    border: 5px solid transparent;
                    border-top-color: #1e293b;
                    pointer-events: none;
                    opacity: 0;
                    transition: opacity 0.15s ease;
                    z-index: 10;
                }
                .qpill-wrap[data-tooltip]:hover::after,
                .qpill-wrap[data-tooltip]:hover::before {
                    opacity: 1;
                }
            `}</style>

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
                    const choiceLabel = getShortAnswerLabel(q.studentAnswer, formatAnswer);
                    const correctLabel = q.correctAnswer ? formatAnswer(q.correctAnswer).trim() : '';
                    const showTooltip = !q.isCorrect && correctLabel;

                    return (
                        <div
                            key={q.questionNumber}
                            className="qpill-wrap"
                            data-tooltip={showTooltip ? `Đáp án đúng: ${correctLabel}` : undefined}
                        >
                            <button
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
                                    flexDirection: 'column',
                                    gap: '1px',
                                    padding: '2px',
                                    transition: 'transform 0.1s ease, box-shadow 0.1s ease',
                                    transform: isActive ? 'scale(1.1)' : 'scale(1)',
                                    boxShadow: isActive ? `0 0 0 3px ${COLORS.accent}33` : '0 1px 2px rgba(0,0,0,0.05)',
                                }}
                                aria-label={`Question ${q.questionNumber} - ${q.isCorrect ? 'correct' : q.score > 0 ? 'partial' : 'incorrect'}${q.studentAnswer ? ` - chose ${formatAnswer(q.studentAnswer)}` : ''}`}
                            >
                                <span style={{ fontSize: '0.55rem', fontWeight: 600, lineHeight: 1, opacity: 0.65 }}>
                                    {q.questionNumber}
                                </span>
                                <span style={{ fontSize: '0.85rem', fontWeight: 800, lineHeight: 1 }}>
                                    {choiceLabel}
                                </span>
                            </button>
                        </div>
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
                                fontStyle: 'italic', marginBottom: '0.75rem',
                            }}>
                                {q.feedback}
                            </div>
                        )}

                        {/* AI Explanation for incorrect questions */}
                        {!q.isCorrect && (() => {
                            const explanationEntry = getPreferredQuestionExplanation(formativeFeedback, q as any);
                            const explanation = explanationEntry?.text || renderableExplanations[String(q.questionNumber)];
                            if (!explanation) {
                                if (!aiExplanationPending) return null;
                                return (
                                    <div style={{
                                        padding: '0.75rem 1rem',
                                        background: '#f8fafc',
                                        borderRadius: '8px',
                                        fontSize: '0.8rem',
                                        color: COLORS.textBody,
                                        lineHeight: 1.6,
                                        borderLeft: `4px solid ${COLORS.accent}`,
                                        marginBottom: q.teacherFeedback || q.gradedByName ? '0.75rem' : 0,
                                    }}>
                                        <div style={{ fontWeight: 800, fontSize: '0.65rem', textTransform: 'uppercase', marginBottom: '0.25rem', color: COLORS.accent }}>
                                            Detailed Explanation Pending
                                        </div>
                                        A full AI explanation for this question is still being generated.
                                    </div>
                                );
                            }
                            return (
                                <div style={{
                                    padding: '0.75rem 1rem',
                                    background: 'linear-gradient(135deg, #eff6ff 0%, #f5f3ff 100%)',
                                    borderRadius: '8px',
                                    fontSize: '0.8rem',
                                    color: '#1e40af',
                                    lineHeight: 1.6,
                                    borderLeft: '4px solid #818cf8',
                                    marginBottom: q.teacherFeedback || q.gradedByName ? '0.75rem' : 0,
                                }}>
                                    <div style={{ fontWeight: 800, fontSize: '0.65rem', textTransform: 'uppercase', marginBottom: '0.25rem', color: '#6366f1', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                        {explanationEntry?.source === 'fallback' ? 'Explanation' : <><span style={{ fontSize: '0.8rem' }}>🤖</span> AI Explanation</>}
                                    </div>
                                    {explanation}
                                </div>
                            );
                        })()}

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
