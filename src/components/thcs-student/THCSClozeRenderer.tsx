/**
 * THCSClozeRenderer — Student-facing cloze word bank display (PRD-0028 Task 4.3)
 * Passage with inline <select> dropdowns, word bank chips, word reuse control.
 */
import React, { useMemo } from 'react';
import type { THCSQuestion, BlankResult } from '../../types/thcs-test.types';

interface THCSClozeRendererProps {
    question: THCSQuestion;
    answers: string[];
    onAnswer: (answers: string[]) => void;
    isReviewMode: boolean;
    blankResults?: BlankResult[];
}

const THCSClozeRenderer: React.FC<THCSClozeRendererProps> = ({
    question, answers, onAnswer, isReviewMode, blankResults,
}) => {
    const wordBank = question.wordBank || [];
    const allowWordReuse = question.allowWordReuse ?? false;
    const passageTemplate = question.passageTemplate || '';

    // Parse passage into text + blank segments
    const segments = useMemo(() => {
        const parts: Array<{ type: 'text'; content: string } | { type: 'blank'; number: number }> = [];
        const regex = /___\((\d+)\)___/g;
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(passageTemplate)) !== null) {
            if (match.index > lastIndex) {
                parts.push({ type: 'text', content: passageTemplate.slice(lastIndex, match.index) });
            }
            parts.push({ type: 'blank', number: parseInt(match[1]!, 10) });
            lastIndex = match.index + match[0]!.length;
        }
        if (lastIndex < passageTemplate.length) {
            parts.push({ type: 'text', content: passageTemplate.slice(lastIndex) });
        }
        return parts;
    }, [passageTemplate]);

    // Track used words (for disabling in dropdowns when reuse is false)
    const usedWords = useMemo(() => {
        if (allowWordReuse) return new Set<string>();
        return new Set(answers.filter(Boolean));
    }, [answers, allowWordReuse]);

    // Find max blank number
    const maxBlank = useMemo(() =>
        segments.reduce((max, s) => s.type === 'blank' ? Math.max(max, s.number) : max, 0),
        [segments]
    );

    const handleBlankChange = (blankNum: number, value: string) => {
        if (isReviewMode) return;
        const newAnswers = [...answers];
        while (newAnswers.length <= maxBlank) newAnswers.push('');
        newAnswers[blankNum] = value;
        onAnswer(newAnswers);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Word Bank */}
            <div style={{
                display: 'flex', flexWrap: 'wrap', gap: '0.375rem',
                padding: '0.5rem 0.75rem',
                background: 'rgba(59,130,246,0.06)',
                borderRadius: '0.5rem',
                border: '1px solid rgba(59,130,246,0.12)',
            }}>
                <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#2563eb', marginRight: '0.375rem', alignSelf: 'center' }}>
                    Word Bank:
                </span>
                {wordBank.map((word, i) => {
                    const isUsed = !allowWordReuse && usedWords.has(word);
                    return (
                        <span key={i} style={{
                            padding: '0.125rem 0.5rem',
                            borderRadius: '0.75rem',
                            background: isUsed ? 'rgba(148,163,184,0.15)' : 'rgba(59,130,246,0.12)',
                            color: isUsed ? '#94a3b8' : '#2563eb',
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            textDecoration: isUsed ? 'line-through' : 'none',
                        }}>
                            {word}
                        </span>
                    );
                })}
            </div>

            {/* Passage with inline selects */}
            <div style={{
                lineHeight: 2.2,
                fontSize: '0.9375rem',
                color: '#1e293b',
                padding: '0.75rem 1rem',
                background: 'rgba(255,255,255,0.8)',
                borderRadius: '0.5rem',
                border: '1px solid rgba(139,92,246,0.1)',
            }}>
                {segments.map((seg, i) => {
                    if (seg.type === 'text') {
                        return <span key={i}>{seg.content}</span>;
                    }

                    const blankNum = seg.number;
                    const currentVal = answers[blankNum] || '';
                    const result = blankResults?.find(r => r.correctAnswer === (question.blankMapping?.[blankNum] || ''));

                    let borderColor = '#8b5cf6';
                    if (isReviewMode && result) {
                        borderColor = result.isCorrect ? '#10b981' : '#ef4444';
                    }

                    return (
                        <span key={i} style={{ display: 'inline-block', position: 'relative' }}>
                            <select
                                value={currentVal}
                                onChange={(e) => handleBlankChange(blankNum, e.target.value)}
                                disabled={isReviewMode}
                                aria-label={`Select word for blank ${blankNum}`}
                                style={{
                                    padding: '0.125rem 0.375rem',
                                    border: `2px solid ${borderColor}`,
                                    borderRadius: '0.25rem',
                                    background: isReviewMode
                                        ? (result?.isCorrect ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)')
                                        : 'rgba(139,92,246,0.06)',
                                    fontFamily: 'inherit',
                                    fontSize: '0.875rem',
                                    color: '#1e293b',
                                    outline: 'none',
                                    minWidth: 90,
                                    cursor: isReviewMode ? 'default' : 'pointer',
                                }}
                            >
                                <option value="">({blankNum})</option>
                                {wordBank.map((word, wi) => {
                                    const isUsed = !allowWordReuse && usedWords.has(word) && word !== currentVal;
                                    return (
                                        <option key={wi} value={word} disabled={isUsed}>
                                            {word}
                                        </option>
                                    );
                                })}
                            </select>
                            {/* Review: show correct word if wrong */}
                            {isReviewMode && result && !result.isCorrect && (
                                <span style={{
                                    display: 'block',
                                    fontSize: '0.5625rem',
                                    color: '#10b981',
                                    fontWeight: 700,
                                    textAlign: 'center',
                                    lineHeight: 1.2,
                                }}>
                                    ✓ {result.correctAnswer}
                                </span>
                            )}
                        </span>
                    );
                })}
            </div>
        </div>
    );
};

export default THCSClozeRenderer;
