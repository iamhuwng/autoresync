/**
 * THCSFillInBlock — Fill-in (verb-form / word-form) editor block (PRD-0028 Task 2.1)
 * Renders sentence template with blank detection, multi-value answers, and AI suggestions.
 */
import React, { useState, useMemo } from 'react';
import { Textarea, TextInput } from '@mantine/core';
import type { THCSQuestion, BlankAnswer } from '../../types/thcs-test.types';

interface THCSFillInBlockProps {
    question: THCSQuestion;
    onUpdate: (q: THCSQuestion) => void;
}

const THCSFillInBlock: React.FC<THCSFillInBlockProps> = ({ question, onUpdate }) => {
    const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
    const [blankInputValues, setBlankInputValues] = useState<Record<number, string>>({});

    // Count blanks from sentenceTemplate
    const blankCount = useMemo(() => {
        const matches = (question.sentenceTemplate || '').match(/___/g);
        return matches ? matches.length : 0;
    }, [question.sentenceTemplate]);

    // Ensure blankAnswers array matches detected blank count
    const blankAnswers: BlankAnswer[] = useMemo(() => {
        const existing = question.blankAnswers || [];
        const result: BlankAnswer[] = [];
        for (let i = 0; i < blankCount; i++) {
            result.push(existing[i] || { acceptedAnswers: [] });
        }
        return result;
    }, [question.blankAnswers, blankCount]);

    const handleAddAnswer = (blankIndex: number, answer: string) => {
        if (!answer.trim()) return;
        const newBlankAnswers = [...blankAnswers];
        const current = { ...newBlankAnswers[blankIndex]! };
        if (current.acceptedAnswers.includes(answer.trim())) return;
        current.acceptedAnswers = [...current.acceptedAnswers, answer.trim()];
        newBlankAnswers[blankIndex] = current;
        onUpdate({ ...question, blankAnswers: newBlankAnswers });
        setBlankInputValues(prev => ({ ...prev, [blankIndex]: '' }));
    };

    const handleRemoveAnswer = (blankIndex: number, answerIndex: number) => {
        const newBlankAnswers = [...blankAnswers];
        const current = { ...newBlankAnswers[blankIndex]! };
        current.acceptedAnswers = current.acceptedAnswers.filter((_, i) => i !== answerIndex);
        newBlankAnswers[blankIndex] = current;
        onUpdate({ ...question, blankAnswers: newBlankAnswers });
    };

    const handleSuggestAlternatives = async () => {
        setIsGeneratingSuggestions(true);
        try {
            // AI service call will be implemented in Task 6.6
            // For now, this is a placeholder that shows the loading state
            const { aiService } = await import('../../services/ai/router.service');
            if ('suggestAlternativeAnswers' in aiService) {
                const existingAnswers = blankAnswers.flatMap(b => b.acceptedAnswers);
                const result = await (aiService as any).suggestAlternativeAnswers(
                    question.sentenceTemplate || '',
                    existingAnswers,
                    'fill-in',
                );
                if (result?.success && result.data) {
                    const newBlankAnswers = [...blankAnswers];
                    for (let i = 0; i < newBlankAnswers.length; i++) {
                        const existing = { ...newBlankAnswers[i]! };
                        existing.aiSuggestions = [
                            ...(existing.aiSuggestions || []),
                            ...result.data.map((s: any) => ({ answer: s.answer, confidence: s.confidence, approved: false })),
                        ];
                        newBlankAnswers[i] = existing;
                    }
                    onUpdate({ ...question, blankAnswers: newBlankAnswers });
                }
            }
        } catch (err) {
            console.warn('AI suggestion failed:', err);
        } finally {
            setIsGeneratingSuggestions(false);
        }
    };

    const handleApproveSuggestion = (blankIndex: number, suggestionIndex: number) => {
        const newBlankAnswers = [...blankAnswers];
        const blank = { ...newBlankAnswers[blankIndex]! };
        const suggestion = blank.aiSuggestions?.[suggestionIndex];
        if (!suggestion) return;
        blank.acceptedAnswers = [...blank.acceptedAnswers, suggestion.answer];
        blank.aiSuggestions = blank.aiSuggestions!.map((s, i) =>
            i === suggestionIndex ? { ...s, approved: true } : s
        );
        newBlankAnswers[blankIndex] = blank;
        onUpdate({ ...question, blankAnswers: newBlankAnswers });
    };

    const handleDismissSuggestion = (blankIndex: number, suggestionIndex: number) => {
        const newBlankAnswers = [...blankAnswers];
        const blank = { ...newBlankAnswers[blankIndex]! };
        blank.aiSuggestions = blank.aiSuggestions?.filter((_, i) => i !== suggestionIndex);
        newBlankAnswers[blankIndex] = blank;
        onUpdate({ ...question, blankAnswers: newBlankAnswers });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Sentence Template */}
            <Textarea
                label="Sentence Template"
                description="Use ___ (triple underscore) to mark blanks. Example: She ___ (teach) English for 5 years."
                placeholder="Enter sentence with ___ markers..."
                value={question.sentenceTemplate || ''}
                onChange={(e) => onUpdate({ ...question, sentenceTemplate: e.target.value })}
                minRows={3}
                autosize
                size="sm"
            />

            {/* Blank count indicator */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.375rem 0.75rem',
                background: blankCount > 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                borderRadius: '0.5rem',
                fontSize: '0.8125rem', fontWeight: 600,
                color: blankCount > 0 ? '#059669' : '#dc2626',
            }}>
                {blankCount > 0 ? `✅ Blanks detected: ${blankCount}` : '⚠️ No blanks detected — add ___ markers'}
            </div>

            {/* Per-blank answer inputs */}
            {blankCount > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {Array.from({ length: blankCount }, (_, i) => (
                        <div key={i} style={{
                            padding: '0.75rem',
                            background: 'rgba(139,92,246,0.04)',
                            borderRadius: '0.5rem',
                            border: '1px solid rgba(139,92,246,0.1)',
                        }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6366f1', marginBottom: '0.25rem', display: 'block' }}>
                                Blank {i + 1} — Accepted Answers
                            </label>

                            {/* Answer chips */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '0.375rem' }}>
                                {blankAnswers[i]!.acceptedAnswers.map((ans, ai) => (
                                    <span key={ai} style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                        padding: '0.125rem 0.5rem', borderRadius: '1rem',
                                        background: 'rgba(139,92,246,0.12)', color: '#7c3aed',
                                        fontSize: '0.75rem', fontWeight: 600,
                                    }}>
                                        {ans}
                                        <button
                                            onClick={() => handleRemoveAnswer(i, ai)}
                                            style={{
                                                border: 'none', background: 'transparent', cursor: 'pointer',
                                                color: '#ef4444', fontWeight: 700, fontSize: '0.75rem', padding: 0,
                                                lineHeight: 1,
                                            }}
                                        >
                                            ×
                                        </button>
                                    </span>
                                ))}
                            </div>

                            {/* Input + Add button */}
                            <div style={{ display: 'flex', gap: '0.375rem' }}>
                                <TextInput
                                    placeholder="Type answer, press Enter"
                                    value={blankInputValues[i] || ''}
                                    onChange={(e) => setBlankInputValues(prev => ({ ...prev, [i]: e.target.value }))}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleAddAnswer(i, blankInputValues[i] || '');
                                        }
                                    }}
                                    size="xs"
                                    style={{ flex: 1 }}
                                />
                                <button
                                    onClick={() => handleAddAnswer(i, blankInputValues[i] || '')}
                                    style={{
                                        padding: '0 0.5rem', border: '1px solid rgba(139,92,246,0.3)',
                                        borderRadius: '0.375rem', background: 'rgba(139,92,246,0.08)',
                                        color: '#7c3aed', fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem',
                                    }}
                                >
                                    +
                                </button>
                            </div>

                            {/* AI Suggestions */}
                            {blankAnswers[i]!.aiSuggestions?.filter(s => !s.approved).map((suggestion, si) => (
                                <div key={si} style={{
                                    marginTop: '0.375rem', padding: '0.375rem 0.5rem',
                                    background: 'rgba(251,191,36,0.08)', borderRadius: '0.375rem',
                                    border: '1px solid rgba(251,191,36,0.2)',
                                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                                    fontSize: '0.75rem',
                                }}>
                                    <span style={{ color: '#92400e', fontWeight: 600 }}>🤖 {suggestion.answer}</span>
                                    <span style={{ color: '#a16207', fontSize: '0.6875rem' }}>({suggestion.confidence}%)</span>
                                    <div style={{ flex: 1 }} />
                                    <button
                                        onClick={() => handleApproveSuggestion(i, si)}
                                        style={{
                                            border: 'none', background: 'rgba(16,185,129,0.15)', color: '#059669',
                                            borderRadius: '0.25rem', padding: '0.125rem 0.5rem',
                                            fontSize: '0.6875rem', fontWeight: 700, cursor: 'pointer',
                                        }}
                                    >
                                        ✓ Approve
                                    </button>
                                    <button
                                        onClick={() => handleDismissSuggestion(i, si)}
                                        style={{
                                            border: 'none', background: 'rgba(239,68,68,0.1)', color: '#dc2626',
                                            borderRadius: '0.25rem', padding: '0.125rem 0.5rem',
                                            fontSize: '0.6875rem', fontWeight: 700, cursor: 'pointer',
                                        }}
                                    >
                                        ✕ Dismiss
                                    </button>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )}

            {/* AI Suggest button */}
            {blankCount > 0 && (
                <button
                    onClick={handleSuggestAlternatives}
                    disabled={isGeneratingSuggestions}
                    style={{
                        padding: '0.375rem 1rem',
                        border: '1px solid rgba(251,191,36,0.3)',
                        borderRadius: '0.5rem',
                        background: isGeneratingSuggestions ? 'rgba(251,191,36,0.15)' : 'rgba(251,191,36,0.08)',
                        color: '#92400e',
                        fontWeight: 600,
                        fontSize: '0.8125rem',
                        cursor: isGeneratingSuggestions ? 'not-allowed' : 'pointer',
                        opacity: isGeneratingSuggestions ? 0.7 : 1,
                        transition: 'all 0.2s',
                        alignSelf: 'flex-start',
                    }}
                >
                    {isGeneratingSuggestions ? '⏳ Generating...' : '🤖 Suggest Alternatives'}
                </button>
            )}
        </div>
    );
};

export default THCSFillInBlock;
