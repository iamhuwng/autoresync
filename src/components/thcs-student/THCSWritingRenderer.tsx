/**
 * THCSWritingRenderer — Student-facing writing question display (PRD-0028 Task 4.2)
 * E1: Given start (sentence-rewrite) | E2: Keyword (sentence-rewrite-keyword)
 */
import React from 'react';
import type { THCSQuestion, WritingGradingResult } from '../../types/thcs-test.types';

interface THCSWritingRendererProps {
    question: THCSQuestion;
    answer: string;
    onAnswer: (answer: string) => void;
    isReviewMode: boolean;
    writingResult?: WritingGradingResult;
}

const THCSWritingRenderer: React.FC<THCSWritingRendererProps> = ({
    question, answer, onAnswer, isReviewMode, writingResult,
}) => {
    const isE1 = question.type === 'sentence-rewrite';
    const isE2 = question.type === 'sentence-rewrite-keyword';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Original sentence */}
            <div style={{
                padding: '0.75rem 1rem',
                background: 'rgba(59,130,246,0.06)',
                borderRadius: '0.5rem',
                border: '1px solid rgba(59,130,246,0.12)',
                fontSize: '0.9375rem',
                color: '#1e293b',
                lineHeight: 1.6,
            }}>
                <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#2563eb', display: 'block', marginBottom: '0.25rem' }}>
                    Original:
                </span>
                {question.originalSentence}
            </div>

            {/* E1: Sentence starter + inline input */}
            {isE1 && (
                <div style={{ lineHeight: 2, fontSize: '1rem', color: '#1e293b' }}>
                    <span style={{ fontWeight: 600, color: '#6366f1' }}>
                        {question.sentenceStarter}
                    </span>
                    {' '}
                    <input
                        type="text"
                        value={answer}
                        onChange={(e) => !isReviewMode && onAnswer(e.target.value)}
                        disabled={isReviewMode}
                        placeholder="Continue the sentence..."
                        aria-label={`Continue the sentence starting with '${question.sentenceStarter}'`}
                        style={{
                            minWidth: 200,
                            width: `${Math.max(20, (answer.length || 1) + 2)}ch`,
                            padding: '0.25rem 0.5rem',
                            border: 'none',
                            borderBottom: '2px solid #8b5cf6',
                            background: 'rgba(139,92,246,0.06)',
                            fontFamily: 'inherit',
                            fontSize: 'inherit',
                            color: '#1e293b',
                            outline: 'none',
                        }}
                    />
                </div>
            )}

            {/* E2: Keyword reminder + textarea */}
            {isE2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{
                        padding: '0.375rem 0.75rem',
                        background: 'rgba(139,92,246,0.08)',
                        borderRadius: '0.375rem',
                        fontSize: '0.8125rem',
                        fontWeight: 700,
                        color: '#7c3aed',
                    }}>
                        Using: {(question.keyword || '').toUpperCase()}
                    </div>
                    <textarea
                        value={answer}
                        onChange={(e) => !isReviewMode && onAnswer(e.target.value)}
                        disabled={isReviewMode}
                        placeholder="Rewrite the sentence using the given word..."
                        aria-label={`Rewrite the sentence using the word '${question.keyword}'`}
                        rows={3}
                        style={{
                            width: '100%',
                            padding: '0.75rem',
                            border: '2px solid rgba(139,92,246,0.2)',
                            borderRadius: '0.5rem',
                            background: isReviewMode ? 'rgba(248,250,252,0.8)' : 'white',
                            fontFamily: 'inherit',
                            fontSize: '0.9375rem',
                            color: '#1e293b',
                            outline: 'none',
                            resize: 'vertical',
                        }}
                    />
                </div>
            )}

            {/* Review mode: grading result */}
            {isReviewMode && writingResult && (
                <div style={{
                    padding: '0.75rem 1rem',
                    borderRadius: '0.5rem',
                    background: (writingResult.gradingTier === 'auto-correct' || writingResult.gradingTier === 'ai-correct')
                        ? 'rgba(16,185,129,0.08)'
                        : writingResult.gradingTier === 'teacher-graded'
                            ? 'rgba(59,130,246,0.08)'
                            : 'rgba(251,191,36,0.08)',
                    border: `1px solid ${(writingResult.gradingTier === 'auto-correct' || writingResult.gradingTier === 'ai-correct')
                            ? 'rgba(16,185,129,0.2)'
                            : writingResult.gradingTier === 'teacher-graded' ? 'rgba(59,130,246,0.2)'
                                : 'rgba(251,191,36,0.2)'
                        }`,
                }}>
                    {writingResult.teacherScore !== undefined ? (
                        <div>
                            <span style={{ fontWeight: 700, color: '#2563eb', fontSize: '0.875rem' }}>
                                Teacher Score: {writingResult.teacherScore}
                            </span>
                            {writingResult.teacherFeedback && (
                                <div style={{ fontSize: '0.8125rem', color: '#475569', marginTop: '0.25rem' }}>
                                    {writingResult.teacherFeedback}
                                </div>
                            )}
                        </div>
                    ) : writingResult.aiScore !== undefined ? (
                        <div>
                            <span style={{ fontWeight: 700, color: '#059669', fontSize: '0.875rem' }}>
                                AI Score: {writingResult.aiScore} ({writingResult.aiConfidence}% confidence)
                            </span>
                        </div>
                    ) : (
                        <span style={{ fontWeight: 600, color: '#92400e', fontSize: '0.8125rem' }}>
                            ⏳ Pending teacher review
                        </span>
                    )}

                    {/* Model answers */}
                    {writingResult.modelAnswers && writingResult.modelAnswers.length > 0 && (
                        <div style={{ marginTop: '0.5rem' }}>
                            <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#64748b' }}>Model answers:</span>
                            {writingResult.modelAnswers.map((ma, i) => (
                                <div key={i} style={{ fontSize: '0.8125rem', color: '#10b981', fontStyle: 'italic' }}>
                                    • {ma}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default THCSWritingRenderer;
