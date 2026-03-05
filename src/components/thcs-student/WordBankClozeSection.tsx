/**
 * WordBankClozeSection — Section-level word bank cloze renderer
 * Renders: word bank on top → passage with inline <select> dropdowns
 * Word consumption: selected words disappear from other dropdowns until deselected.
 */
import React, { useMemo } from 'react';
import type { THCSSection } from '../../types/thcs-test.types';

interface WordBankClozeSectionProps {
    section: THCSSection;
    answers: Record<string, string | string[]>;
    onAnswer: (questionNumber: number, answer: string | string[] | null) => void;
    isReviewMode: boolean;
    questionResults: Record<string, boolean>;
}

const WordBankClozeSection: React.FC<WordBankClozeSectionProps> = ({
    section, answers, onAnswer, isReviewMode, questionResults,
}) => {
    const questions = section.questions;
    const firstQ = questions[0];

    // Word bank from first question (all questions share the same bank)
    const wordBank: string[] = (firstQ as any)?.wordBank || [];
    // Passage template from first question
    const passageTemplate: string = (firstQ as any)?.passageTemplate || '';
    // Blank mapping from first question (maps blank number → correct answer)
    const blankMapping: Record<string, string> = (firstQ as any)?.blankMapping || {};

    // Parse passage into text + blank segments
    const segments = useMemo(() => {
        const parts: Array<{ type: 'text'; content: string } | { type: 'blank'; number: number; qNum: number }> = [];
        const regex = /___\((\d+)\)___/g;
        let lastIndex = 0;
        let match;

        while ((match = regex.exec(passageTemplate)) !== null) {
            if (match.index > lastIndex) {
                parts.push({ type: 'text', content: passageTemplate.slice(lastIndex, match.index) });
            }
            const blankNum = parseInt(match[1]!, 10);
            // Map blank number (1-based sequential) → actual question number
            const q = questions[blankNum - 1];
            parts.push({ type: 'blank', number: blankNum, qNum: q?.questionNumber || blankNum });
            lastIndex = match.index + match[0]!.length;
        }
        if (lastIndex < passageTemplate.length) {
            parts.push({ type: 'text', content: passageTemplate.slice(lastIndex) });
        }
        return parts;
    }, [passageTemplate, questions]);

    // Track used words across all blanks (for word consumption)
    const usedWords = useMemo(() => {
        const used = new Set<string>();
        questions.forEach(q => {
            const ans = answers[q.questionNumber.toString()];
            if (typeof ans === 'string' && ans) {
                used.add(ans);
            }
        });
        return used;
    }, [answers, questions]);

    const handleBlankChange = (questionNumber: number, value: string) => {
        if (isReviewMode) return;
        onAnswer(questionNumber, value || null);
    };

    // Fallback: if no passage template, show a simpler layout
    if (!passageTemplate) {
        return (
            <div style={{
                padding: '1.25rem',
                background: 'rgba(255,255,255,0.9)',
                borderRadius: '0.75rem',
                border: '1px solid rgba(139,92,246,0.1)',
            }}>
                <div style={{ fontSize: '0.875rem', color: '#64748b', fontStyle: 'italic' }}>
                    Word bank cloze passage not available. Please check the test data.
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Word Bank — sticky top */}
            <div style={{
                display: 'flex', flexWrap: 'wrap', gap: '0.375rem',
                padding: '0.75rem 1rem',
                background: 'rgba(59,130,246,0.06)',
                borderRadius: '0.75rem',
                border: '1px solid rgba(59,130,246,0.12)',
                position: 'sticky',
                top: 56, // below header bar
                zIndex: 5,
                backdropFilter: 'blur(12px)',
            }}>
                <span style={{
                    fontSize: '0.75rem', fontWeight: 700, color: '#2563eb',
                    marginRight: '0.5rem', alignSelf: 'center',
                }}>
                    📦 Word Bank:
                </span>
                {wordBank.map((word, i) => {
                    const isUsed = usedWords.has(word);
                    return (
                        <span key={i} style={{
                            padding: '0.2rem 0.625rem',
                            borderRadius: '1rem',
                            background: isUsed ? 'rgba(148,163,184,0.12)' : 'rgba(59,130,246,0.12)',
                            color: isUsed ? '#94a3b8' : '#2563eb',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            textDecoration: isUsed ? 'line-through' : 'none',
                            transition: 'all 0.2s ease',
                        }}>
                            {word}
                        </span>
                    );
                })}
            </div>

            {/* Passage with inline select dropdowns */}
            <div style={{
                lineHeight: 2.4,
                fontSize: '0.9375rem',
                color: '#1e293b',
                padding: '1.25rem 1.5rem',
                background: 'rgba(255,255,255,0.95)',
                borderRadius: '0.75rem',
                border: '1px solid rgba(139,92,246,0.1)',
                boxShadow: '0 2px 12px rgba(139,92,246,0.06)',
                whiteSpace: 'pre-wrap',
            }}>
                {segments.map((seg, i) => {
                    if (seg.type === 'text') {
                        return <span key={i}>{seg.content}</span>;
                    }

                    const qNum = seg.qNum;
                    const currentVal = (answers[qNum.toString()] as string) || '';
                    const correctAnswer = blankMapping[String(seg.number)] || '';
                    const isCorrect = isReviewMode && questionResults[qNum.toString()];
                    const isWrong = isReviewMode && questionResults[qNum.toString()] === false;

                    let borderColor = '#8b5cf6';
                    let bgColor = 'rgba(139,92,246,0.06)';
                    if (isReviewMode) {
                        if (isCorrect) {
                            borderColor = '#10b981';
                            bgColor = 'rgba(16,185,129,0.08)';
                        } else if (isWrong) {
                            borderColor = '#ef4444';
                            bgColor = 'rgba(239,68,68,0.08)';
                        }
                    }

                    return (
                        <span key={i} style={{ display: 'inline-block', position: 'relative' }}>
                            <select
                                value={currentVal}
                                onChange={(e) => handleBlankChange(qNum, e.target.value)}
                                disabled={isReviewMode}
                                aria-label={`Select word for question ${qNum}`}
                                style={{
                                    padding: '0.15rem 1.5rem 0.15rem 0.5rem',
                                    border: `2px solid ${borderColor}`,
                                    borderRadius: '0.375rem',
                                    background: bgColor,
                                    fontFamily: 'inherit',
                                    fontSize: '0.875rem',
                                    fontWeight: currentVal ? 600 : 400,
                                    color: currentVal ? '#1e293b' : '#94a3b8',
                                    outline: 'none',
                                    minWidth: 100,
                                    cursor: isReviewMode ? 'default' : 'pointer',
                                    appearance: 'none',
                                    WebkitAppearance: 'none',
                                    backgroundImage: isReviewMode ? 'none' : `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 5l3 3 3-3' stroke='%238b5cf6' stroke-width='1.5' fill='none'/%3E%3C/svg%3E")`,
                                    backgroundRepeat: 'no-repeat',
                                    backgroundPosition: 'right 0.4rem center',
                                    transition: 'border-color 0.2s, background 0.2s',
                                }}
                            >
                                <option value="">({qNum})</option>
                                {wordBank.map((word, wi) => {
                                    // Word consumption: hide used words from dropdown, except current selection
                                    const isUsedElsewhere = usedWords.has(word) && word !== currentVal;
                                    if (isUsedElsewhere) return null;
                                    return (
                                        <option key={wi} value={word}>
                                            {word}
                                        </option>
                                    );
                                })}
                            </select>
                            {/* Review: show correct answer below if wrong */}
                            {isReviewMode && isWrong && (
                                <span style={{
                                    display: 'block',
                                    fontSize: '0.625rem',
                                    color: '#10b981',
                                    fontWeight: 700,
                                    textAlign: 'center',
                                    lineHeight: 1.2,
                                    marginTop: '-0.25rem',
                                }}>
                                    ✓ {correctAnswer}
                                </span>
                            )}
                        </span>
                    );
                })}
            </div>
        </div>
    );
};

export default WordBankClozeSection;
