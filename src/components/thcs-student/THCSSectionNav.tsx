/**
 * THCSSectionNav — Student section tabs + question navigation pills (PRD-0027 Task 5.3)
 * Supports split rendering: sections-only (top bar) or questions-only (footer pills).
 * Section cards turn green when completed, red when visited-but-incomplete.
 */
import React from 'react';
import type { THCSSection } from '../../types/thcs-test.types';
import { QUESTION_NAV_COLORS } from '../../types/thcs-test.types';

export type SectionStatus = 'active' | 'completed' | 'incomplete' | 'default';

interface THCSSectionNavProps {
    sections: THCSSection[];
    currentSectionIndex: number;
    answers: Record<string, string | string[]>;
    flaggedQuestions: Set<string>;
    isReviewMode: boolean;
    questionResults?: Record<string, boolean>;
    onSectionChange: (index: number) => void;
    onQuestionClick: (sectionIndex: number, questionIndex: number) => void;
    position?: 'top' | 'bottom';
    /** Render only section tabs, only question pills, or both */
    mode?: 'sections-only' | 'questions-only' | 'full';
    /** Per-section status for coloring (indexed by section index) */
    sectionStatuses?: SectionStatus[];
    /** For prev/next question buttons in footer */
    onPrevQuestion?: () => void;
    onNextQuestion?: () => void;
    isFirstQuestion?: boolean;
    isLastQuestion?: boolean;
}

/** Background color/style for section tab based on status */
const getSectionTabStyle = (
    status: SectionStatus,
    isActive: boolean,
): React.CSSProperties => {
    if (isActive) {
        return {
            background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
            color: '#ffffff',
            boxShadow: '0 2px 8px rgba(139,92,246,0.3)',
        };
    }
    switch (status) {
        case 'completed':
            return {
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
            };
        case 'incomplete':
            return {
                background: 'rgba(239,68,68,0.12)',
                color: '#dc2626',
                border: '1px solid rgba(239,68,68,0.3)',
            };
        default:
            return {
                background: 'rgba(139,92,246,0.08)',
                color: '#64748b',
            };
    }
};

const THCSSectionNav: React.FC<THCSSectionNavProps> = ({
    sections, currentSectionIndex, answers, flaggedQuestions,
    isReviewMode, questionResults, onSectionChange, onQuestionClick,
    position = 'bottom',
    mode = 'full',
    sectionStatuses,
    onPrevQuestion, onNextQuestion, isFirstQuestion, isLastQuestion,
}) => {
    const currentSection = sections[currentSectionIndex];
    if (!currentSection) return null;

    const showSections = mode === 'sections-only' || mode === 'full';
    const showQuestions = mode === 'questions-only' || mode === 'full';

    return (
        <div style={{
            background: 'rgba(255,255,255,0.95)',
            backdropFilter: 'blur(12px)',
            ...(position === 'top'
                ? { borderBottom: '1px solid rgba(139,92,246,0.1)' }
                : { borderTop: '1px solid rgba(139,92,246,0.1)' }
            ),
            padding: position === 'top'
                ? (showSections && !showQuestions ? '0.3rem 1rem' : '0.35rem 1rem')
                : '0.3rem 0.75rem',
            position: 'sticky',
            ...(position === 'top' ? { top: 0 } : { bottom: 0 }),
            zIndex: 10,
        }}>
            {/* Section tabs — centered */}
            {showSections && (
                <div style={{
                    display: 'flex', gap: '0.375rem', overflowX: 'auto',
                    justifyContent: 'center',
                    ...(showQuestions ? { marginBottom: '0.35rem', paddingBottom: '0.15rem' } : {}),
                }}>
                    {sections.map((section, i) => {
                        const status = sectionStatuses?.[i] ?? 'default';
                        const isActive = i === currentSectionIndex;
                        const tabStyle = getSectionTabStyle(status, isActive);

                        // Count answered questions for this section
                        const sectionAnswered = section.questions.filter(
                            q => !!answers[q.questionNumber.toString()]
                        ).length;
                        const sectionTotal = section.questions.length;

                        return (
                            <button
                                key={section.id}
                                onClick={() => onSectionChange(i)}
                                style={{
                                    padding: '0.3rem 0.75rem',
                                    borderRadius: '0.375rem',
                                    border: 'none',
                                    fontWeight: 600,
                                    fontSize: '0.75rem',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                    transition: 'all 0.2s ease',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.35rem',
                                    ...tabStyle,
                                }}
                            >
                                {/* Status icon */}
                                {!isActive && status === 'completed' && (
                                    <span style={{ fontSize: '0.65rem' }}>✓</span>
                                )}
                                {!isActive && status === 'incomplete' && (
                                    <span style={{ fontSize: '0.65rem' }}>!</span>
                                )}
                                {section.name}
                                {/* Mini progress counter */}
                                <span style={{
                                    fontSize: '0.6rem',
                                    opacity: 0.8,
                                    fontWeight: 500,
                                }}>
                                    {sectionAnswered}/{sectionTotal}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Question pills with prev/next buttons */}
            {showQuestions && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                }}>
                    {/* Prev button */}
                    {onPrevQuestion && (
                        <button
                            onClick={onPrevQuestion}
                            disabled={!!isFirstQuestion}
                            aria-label="Previous question"
                            style={{
                                flexShrink: 0,
                                width: 26, height: 26,
                                borderRadius: '0.25rem',
                                border: '1px solid rgba(139,92,246,0.2)',
                                background: isFirstQuestion ? 'rgba(0,0,0,0.03)' : 'rgba(139,92,246,0.08)',
                                color: isFirstQuestion ? '#cbd5e1' : '#7c3aed',
                                fontWeight: 700, fontSize: '0.85rem',
                                cursor: isFirstQuestion ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'all 0.15s',
                            }}
                        >
                            ‹
                        </button>
                    )}

                    {/* Question pills */}
                    <div style={{
                        display: 'flex', flexWrap: 'wrap', gap: '0.15rem',
                        justifyContent: 'center',
                        flex: 1, minWidth: 0,
                    }}>
                        {currentSection.questions.map((q, qi) => {
                            const qNum = q.questionNumber.toString();
                            const isAnswered = !!answers[qNum];
                            const isFlagged = flaggedQuestions.has(q.id);
                            const isCorrect = questionResults?.[qNum];

                            let colors: { bg: string; text: string; ring?: string } = QUESTION_NAV_COLORS.unanswered;
                            let indicator = '';

                            if (isReviewMode) {
                                if (isCorrect === true) {
                                    colors = QUESTION_NAV_COLORS.correct;
                                    indicator = '✓';
                                } else if (isCorrect === false) {
                                    colors = QUESTION_NAV_COLORS.incorrect;
                                    indicator = '✕';
                                }
                            } else if (isFlagged) {
                                colors = QUESTION_NAV_COLORS.flagged;
                                indicator = '⚑';
                            } else if (isAnswered) {
                                colors = QUESTION_NAV_COLORS.answered;
                                indicator = '';
                            }

                            // Compact pill size for footer mode
                            const pillSize = mode === 'questions-only' ? 22 : 32;
                            const fontSize = mode === 'questions-only' ? '0.55rem' : '0.6875rem';
                            const indicatorSize = mode === 'questions-only' ? '0.4rem' : '0.5rem';

                            return (
                                <button
                                    key={q.id}
                                    onClick={() => onQuestionClick(currentSectionIndex, qi)}
                                    title={`Q${q.questionNumber}${isFlagged ? ' (flagged)' : ''}`}
                                    style={{
                                        width: pillSize, height: pillSize,
                                        borderRadius: '0.25rem',
                                        border: 'none',
                                        background: colors.bg,
                                        color: colors.text,
                                        fontWeight: 700,
                                        fontSize,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        lineHeight: 1,
                                        transition: 'all 0.15s',
                                        ...((colors as any).ring ? {
                                            boxShadow: `0 0 0 2px ${(colors as any).ring}`,
                                        } : {}),
                                    }}
                                >
                                    {indicator && <span style={{ fontSize: indicatorSize }}>{indicator}</span>}
                                    {q.questionNumber}
                                </button>
                            );
                        })}
                    </div>

                    {/* Next button */}
                    {onNextQuestion && (
                        <button
                            onClick={onNextQuestion}
                            disabled={!!isLastQuestion}
                            aria-label="Next question"
                            style={{
                                flexShrink: 0,
                                width: 26, height: 26,
                                borderRadius: '0.25rem',
                                border: '1px solid rgba(139,92,246,0.2)',
                                background: isLastQuestion ? 'rgba(0,0,0,0.03)' : 'rgba(139,92,246,0.08)',
                                color: isLastQuestion ? '#cbd5e1' : '#7c3aed',
                                fontWeight: 700, fontSize: '0.85rem',
                                cursor: isLastQuestion ? 'not-allowed' : 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'all 0.15s',
                            }}
                        >
                            ›
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default THCSSectionNav;
