/**
 * THCSWritingBlock — Sentence rewriting editor block (PRD-0028 Task 2.2)
 * E1: Given start (sentence-rewrite) | E2: Keyword (sentence-rewrite-keyword)
 */
import React, { useState } from 'react';
import { TextInput, Switch } from '@mantine/core';
import type { THCSQuestion } from '../../types/thcs-test.types';

interface THCSWritingBlockProps {
    question: THCSQuestion;
    onUpdate: (q: THCSQuestion) => void;
}

const THCSWritingBlock: React.FC<THCSWritingBlockProps> = ({ question, onUpdate }) => {
    const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
    const [modelAnswerInput, setModelAnswerInput] = useState('');

    const isE1 = question.type === 'sentence-rewrite';
    const isE2 = question.type === 'sentence-rewrite-keyword';
    const modelAnswers = question.modelAnswers || [];

    const handleAddModelAnswer = (answer: string) => {
        if (!answer.trim()) return;
        if (modelAnswers.includes(answer.trim())) return;
        onUpdate({ ...question, modelAnswers: [...modelAnswers, answer.trim()] });
        setModelAnswerInput('');
    };

    const handleRemoveModelAnswer = (index: number) => {
        onUpdate({ ...question, modelAnswers: modelAnswers.filter((_, i) => i !== index) });
    };

    const handleSuggestAlternatives = async () => {
        setIsGeneratingSuggestions(true);
        try {
            const { aiService } = await import('../../services/ai/router.service');
            if ('suggestAlternativeAnswers' in aiService) {
                const result = await (aiService as any).suggestAlternativeAnswers(
                    question.originalSentence || '',
                    modelAnswers,
                    'writing',
                    {
                        sentenceStarter: question.sentenceStarter,
                        keyword: question.keyword,
                    },
                );
                if (result?.success && result.data) {
                    const suggestions = result.data as Array<{ answer: string; confidence: number }>;
                    const newAnswers = suggestions
                        .map((s: { answer: string }) => s.answer)
                        .filter((a: string) => !modelAnswers.includes(a));
                    if (newAnswers.length > 0) {
                        onUpdate({ ...question, modelAnswers: [...modelAnswers, ...newAnswers] });
                    }
                }
            }
        } catch (err) {
            console.warn('AI suggestion failed:', err);
        } finally {
            setIsGeneratingSuggestions(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Original Sentence */}
            <TextInput
                label="Original Sentence"
                placeholder="Enter the original sentence to be rewritten..."
                value={question.originalSentence || ''}
                onChange={(e) => onUpdate({ ...question, originalSentence: e.target.value })}
                size="sm"
                required
            />

            {/* E1: Sentence Starter */}
            {isE1 && (
                <TextInput
                    label="Sentence Starter"
                    description="The beginning words that students must start their rewrite with"
                    placeholder="e.g., Although she..."
                    value={question.sentenceStarter || ''}
                    onChange={(e) => onUpdate({ ...question, sentenceStarter: e.target.value })}
                    size="sm"
                    required
                />
            )}

            {/* E2: Keyword */}
            {isE2 && (
                <TextInput
                    label="Keyword"
                    description="The word students must use (displayed in uppercase)"
                    placeholder="e.g., ALTHOUGH"
                    value={question.keyword || ''}
                    onChange={(e) => onUpdate({ ...question, keyword: e.target.value })}
                    size="sm"
                    required
                    styles={{
                        input: { textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' },
                    }}
                />
            )}

            {/* Model Answers */}
            <div>
                <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '0.25rem', display: 'block' }}>
                    Model Answers
                </label>

                {/* Answer chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '0.375rem' }}>
                    {modelAnswers.map((ans, i) => (
                        <span key={i} style={{
                            display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                            padding: '0.25rem 0.625rem', borderRadius: '1rem',
                            background: 'rgba(139,92,246,0.12)', color: '#7c3aed',
                            fontSize: '0.75rem', fontWeight: 600,
                        }}>
                            {ans}
                            <button
                                onClick={() => handleRemoveModelAnswer(i)}
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
                    {modelAnswers.length === 0 && (
                        <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>
                            No model answers added yet
                        </span>
                    )}
                </div>

                {/* Input */}
                <div style={{ display: 'flex', gap: '0.375rem' }}>
                    <TextInput
                        placeholder="Type model answer, press Enter"
                        value={modelAnswerInput}
                        onChange={(e) => setModelAnswerInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddModelAnswer(modelAnswerInput);
                            }
                        }}
                        size="xs"
                        style={{ flex: 1 }}
                    />
                    <button
                        onClick={() => handleAddModelAnswer(modelAnswerInput)}
                        style={{
                            padding: '0 0.5rem', border: '1px solid rgba(139,92,246,0.3)',
                            borderRadius: '0.375rem', background: 'rgba(139,92,246,0.08)',
                            color: '#7c3aed', fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem',
                        }}
                    >
                        +
                    </button>
                </div>
            </div>

            {/* AI Suggest button */}
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

            {/* Auto-grade toggle */}
            <div style={{
                padding: '0.5rem 0.75rem',
                background: 'rgba(139,92,246,0.04)',
                borderRadius: '0.5rem',
                border: '1px solid rgba(139,92,246,0.1)',
                display: 'flex', alignItems: 'center', gap: '0.75rem',
            }}>
                <Switch
                    label="Enable auto-grading for this section"
                    description="Uses AI to automatically grade student responses (teacher review still available)"
                    checked={question.autoGradeWriting || false}
                    onChange={(e) => onUpdate({ ...question, autoGradeWriting: e.currentTarget.checked })}
                    size="sm"
                    color="violet"
                />
            </div>
        </div>
    );
};

export default THCSWritingBlock;
