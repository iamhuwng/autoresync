/**
 * THCSFillInAnswerInput — Answer key sub-component for fill-in questions (PRD-0028 Task 3.1)
 * Shows each blank with multi-value text inputs for accepted answers.
 */
import React, { useState } from 'react';
import { TextInput } from '@mantine/core';
import type { BlankAnswer } from '../../types/thcs-test.types';

interface THCSFillInAnswerInputProps {
    blankAnswers: BlankAnswer[];
    onUpdate: (blankIndex: number, answers: string[]) => void;
    onRequestAI: () => void;
}

const THCSFillInAnswerInput: React.FC<THCSFillInAnswerInputProps> = ({ blankAnswers, onUpdate, onRequestAI }) => {
    const [inputValues, setInputValues] = useState<Record<number, string>>({});

    const handleAdd = (blankIndex: number) => {
        const val = (inputValues[blankIndex] || '').trim();
        if (!val) return;
        const current = blankAnswers[blankIndex]?.acceptedAnswers || [];
        if (current.includes(val)) return;
        onUpdate(blankIndex, [...current, val]);
        setInputValues(prev => ({ ...prev, [blankIndex]: '' }));
    };

    const handleRemove = (blankIndex: number, answerIndex: number) => {
        const current = blankAnswers[blankIndex]?.acceptedAnswers || [];
        onUpdate(blankIndex, current.filter((_, i) => i !== answerIndex));
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {blankAnswers.map((blank, bi) => (
                <div key={bi} style={{
                    padding: '0.375rem 0.5rem',
                    background: 'rgba(139,92,246,0.04)',
                    borderRadius: '0.375rem',
                    border: '1px solid rgba(139,92,246,0.08)',
                }}>
                    <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#6366f1', marginBottom: '0.25rem' }}>
                        Blank {bi + 1}
                    </div>
                    {/* Chips */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.25rem' }}>
                        {blank.acceptedAnswers.map((ans, ai) => (
                            <span key={ai} style={{
                                display: 'inline-flex', alignItems: 'center', gap: '2px',
                                padding: '0.0625rem 0.375rem', borderRadius: '0.75rem',
                                background: 'rgba(139,92,246,0.12)', color: '#7c3aed',
                                fontSize: '0.6875rem', fontWeight: 600,
                            }}>
                                {ans}
                                <button
                                    onClick={() => handleRemove(bi, ai)}
                                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444', fontWeight: 700, fontSize: '0.625rem', padding: 0, lineHeight: 1 }}
                                >×</button>
                            </span>
                        ))}
                        {blank.acceptedAnswers.length === 0 && (
                            <span style={{ fontSize: '0.625rem', color: '#f59e0b', fontWeight: 600 }}>⚠ No answers</span>
                        )}
                    </div>
                    {/* Input */}
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <TextInput
                            placeholder="Add answer..."
                            value={inputValues[bi] || ''}
                            onChange={(e) => setInputValues(prev => ({ ...prev, [bi]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(bi); } }}
                            size="xs"
                            style={{ flex: 1 }}
                            styles={{ input: { fontSize: '0.75rem', height: 24, minHeight: 24 } }}
                        />
                        <button
                            onClick={() => handleAdd(bi)}
                            style={{ padding: '0 0.375rem', border: '1px solid rgba(139,92,246,0.2)', borderRadius: '0.25rem', background: 'transparent', color: '#7c3aed', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem' }}
                        >+</button>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default THCSFillInAnswerInput;
