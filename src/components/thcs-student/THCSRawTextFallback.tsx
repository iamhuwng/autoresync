/**
 * THCSRawTextFallback — FR-12 Raw Text Fallback Renderer
 *
 * Renders a section where compromise conversion failed.
 * Shows the raw text with pre-wrapped formatting, plus a text input
 * per question for student answers.
 *
 * In review mode, displays correct/incorrect indicators.
 * No Mantine components — native HTML + vanilla CSS only.
 */

import React from 'react';
import type { THCSSection, QuestionResult } from '../../types/thcs-test.types';

// ── Types ─────────────────────────────────────────────────────

export interface THCSRawTextFallbackProps {
    section: THCSSection;
    answers: Record<string, string>;     // questionId → student's typed answer
    onAnswerChange: (questionId: string, answer: string) => void;
    isReviewMode?: boolean;              // true = show correct answers
    questionResults?: Record<number, QuestionResult>;
}

// ── Styles ────────────────────────────────────────────────────

const S = {
    container: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '1rem',
    },
    warningBanner: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.75rem 1rem',
        backgroundColor: '#fef3c7',    // warningBg
        borderRadius: '8px',
        fontSize: '0.875rem',
        color: '#92400e',
        lineHeight: 1.5,
    },
    rawTextBox: {
        padding: '1rem',
        backgroundColor: '#f9fafb',    // surfaceAlt
        border: '1px solid #e5e7eb',   // border
        borderRadius: '8px',
        whiteSpace: 'pre-wrap' as const,
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        fontSize: '0.9375rem',
        lineHeight: 1.65,
        color: '#374151',              // textBody
        overflowX: 'auto' as const,
    },
    questionsContainer: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '0.75rem',
        marginTop: '0.5rem',
    },
    questionRow: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
    },
    questionLabel: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: '2rem',
        height: '2rem',
        borderRadius: '6px',
        backgroundColor: '#e5e7eb',    // hover
        color: '#374151',              // textBody
        fontWeight: 600,
        fontSize: '0.8125rem',
        flexShrink: 0,
    },
    inputWrapper: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '0.25rem',
    },
    input: {
        width: '100%',
        padding: '0.5rem 0.75rem',
        border: '1px solid #d1d5db',
        borderRadius: '8px',
        fontSize: '0.9375rem',
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        color: '#111827',              // textPrimary
        backgroundColor: '#ffffff',
        outline: 'none',
        transition: 'border-color 0.15s ease',
    },
    inputCorrect: {
        borderColor: '#059669',
        backgroundColor: '#ecfdf5',
    },
    inputIncorrect: {
        borderColor: '#dc2626',
        backgroundColor: '#fef2f2',
    },
    inputDisabled: {
        backgroundColor: '#f3f4f6',
        color: '#6b7280',
        cursor: 'not-allowed' as const,
    },
    correctAnswerHint: {
        fontSize: '0.8125rem',
        color: '#059669',              // successText
        marginTop: '2px',
    },
    teacherGradeNote: {
        fontSize: '0.8125rem',
        color: '#d97706',              // warningText
        fontStyle: 'italic' as const,
        marginTop: '2px',
    },
} as const;

// ── Component ─────────────────────────────────────────────────

const THCSRawTextFallback: React.FC<THCSRawTextFallbackProps> = ({
    section,
    answers,
    onAnswerChange,
    isReviewMode = false,
    questionResults,
}) => {
    const rawText = section.rawText || section.questions.map(q => q.questionText).join('\n');

    return (
        <div style={S.container}>
            {/* Warning banner */}
            <div style={S.warningBanner}>
                <span style={{ fontSize: '1.125rem' }}>⚠️</span>
                <span>
                    This section could not be auto-converted. Read the text carefully and type your answers below.
                </span>
            </div>

            {/* Raw text display */}
            <div style={S.rawTextBox}>
                {rawText}
            </div>

            {/* Answer inputs */}
            <div style={S.questionsContainer}>
                {section.questions.map((q) => {
                    const qKey = q.questionNumber.toString();
                    const studentAnswer = answers[qKey] || '';
                    const result = questionResults?.[q.questionNumber];
                    const correctAnswer = (q.correctAnswer as string) || '';
                    const needsTeacherGrading = !correctAnswer || correctAnswer === '?';

                    // Determine input styling for review mode
                    let inputStyle = { ...S.input };
                    if (isReviewMode) {
                        Object.assign(inputStyle, S.inputDisabled);
                        if (result) {
                            Object.assign(inputStyle, result.isCorrect ? S.inputCorrect : S.inputIncorrect);
                        }
                    }

                    return (
                        <div key={q.id} style={S.questionRow}>
                            <div style={S.questionLabel}>{q.questionNumber}</div>
                            <div style={S.inputWrapper}>
                                <input
                                    type="text"
                                    value={studentAnswer}
                                    onChange={(e) => onAnswerChange(qKey, e.target.value)}
                                    disabled={isReviewMode}
                                    placeholder="Type your answer here..."
                                    style={inputStyle}
                                    onFocus={(e) => {
                                        if (!isReviewMode) {
                                            e.currentTarget.style.borderColor = '#4f46e5';
                                        }
                                    }}
                                    onBlur={(e) => {
                                        if (!isReviewMode) {
                                            e.currentTarget.style.borderColor = '#d1d5db';
                                        }
                                    }}
                                />
                                {isReviewMode && result && !result.isCorrect && !needsTeacherGrading && (
                                    <div style={S.correctAnswerHint}>
                                        ✓ Correct answer: {typeof result.correctAnswer === 'string' ? result.correctAnswer : correctAnswer}
                                    </div>
                                )}
                                {isReviewMode && needsTeacherGrading && (
                                    <div style={S.teacherGradeNote}>
                                        Teacher will grade this question manually.
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default THCSRawTextFallback;
