/**
 * THCSFillInRenderer — Student-facing fill-in question display (PRD-0028 Task 4.1)
 * Parses sentenceTemplate, renders inline <input> fields for each blank.
 */
import React, { useMemo } from 'react';
import type { THCSQuestion, BlankResult } from '../../types/thcs-test.types';

interface THCSFillInRendererProps {
    question: THCSQuestion;
    answers: string[];
    onAnswer: (answers: string[]) => void;
    isReviewMode: boolean;
    blankResults?: BlankResult[];
}

const THCSFillInRenderer: React.FC<THCSFillInRendererProps> = ({
    question, answers, onAnswer, isReviewMode, blankResults,
}) => {
    // Split template into text fragments and blank markers
    const fragments = useMemo(() => {
        const template = question.sentenceTemplate || '';
        return template.split('___');
    }, [question.sentenceTemplate]);

    const blankCount = fragments.length - 1;

    const handleBlankChange = (blankIndex: number, value: string) => {
        if (isReviewMode) return;
        const newAnswers = [...answers];
        // Ensure array has correct length
        while (newAnswers.length < blankCount) newAnswers.push('');
        newAnswers[blankIndex] = value;
        onAnswer(newAnswers);
    };

    return (
        <div style={{ lineHeight: 2, fontSize: '1rem', color: '#1e293b' }}>
            {fragments.map((textPart, i) => (
                <React.Fragment key={i}>
                    <span>{textPart}</span>
                    {i < blankCount && (() => {
                        const answer = answers[i] || '';
                        const result = blankResults?.[i];
                        const isCorrect = result?.isCorrect;

                        let borderColor = '#8b5cf6';
                        let bgColor = 'rgba(139,92,246,0.06)';
                        if (isReviewMode && result) {
                            borderColor = isCorrect ? '#10b981' : '#ef4444';
                            bgColor = isCorrect ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)';
                        }

                        return (
                            <span style={{ display: 'inline-block', position: 'relative' }}>
                                <input
                                    type="text"
                                    value={isReviewMode ? (answer || '') : answer}
                                    onChange={(e) => handleBlankChange(i, e.target.value)}
                                    disabled={isReviewMode}
                                    aria-label={`Blank ${i + 1} of ${blankCount} in question ${question.questionNumber}`}
                                    style={{
                                        minWidth: 120,
                                        width: `${Math.max(8, (answer.length || 1) + 2)}ch`,
                                        padding: '0.25rem 0.5rem',
                                        border: 'none',
                                        borderBottom: `2px solid ${borderColor}`,
                                        background: bgColor,
                                        fontFamily: 'inherit',
                                        fontSize: 'inherit',
                                        color: '#1e293b',
                                        outline: 'none',
                                        borderRadius: '0.25rem 0.25rem 0 0',
                                        textAlign: 'center',
                                    }}
                                />
                                {/* Review mode: show correct answer if wrong */}
                                {isReviewMode && result && !isCorrect && (
                                    <span style={{
                                        display: 'block',
                                        fontSize: '0.6875rem',
                                        color: '#10b981',
                                        fontWeight: 600,
                                        textAlign: 'center',
                                    }}>
                                        ✓ {result.correctAnswer}
                                    </span>
                                )}
                            </span>
                        );
                    })()}
                </React.Fragment>
            ))}
        </div>
    );
};

export default THCSFillInRenderer;
