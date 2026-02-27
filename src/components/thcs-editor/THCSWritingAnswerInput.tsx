/**
 * THCSWritingAnswerInput — Answer key sub-component for writing questions (PRD-0028 Task 3.2)
 * Multi-value text input for model answers.
 */
import React, { useState } from 'react';
import { TextInput } from '@mantine/core';

interface THCSWritingAnswerInputProps {
    modelAnswers: string[];
    onUpdate: (answers: string[]) => void;
    onRequestAI: () => void;
}

const THCSWritingAnswerInput: React.FC<THCSWritingAnswerInputProps> = ({ modelAnswers, onUpdate, onRequestAI }) => {
    const [inputValue, setInputValue] = useState('');

    const handleAdd = () => {
        const val = inputValue.trim();
        if (!val || modelAnswers.includes(val)) return;
        onUpdate([...modelAnswers, val]);
        setInputValue('');
    };

    const handleRemove = (index: number) => {
        onUpdate(modelAnswers.filter((_, i) => i !== index));
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {/* Chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                {modelAnswers.map((ans, i) => (
                    <span key={i} style={{
                        display: 'inline-flex', alignItems: 'center', gap: '2px',
                        padding: '0.0625rem 0.375rem', borderRadius: '0.75rem',
                        background: 'rgba(16,185,129,0.12)', color: '#059669',
                        fontSize: '0.6875rem', fontWeight: 600,
                    }}>
                        {ans.length > 40 ? ans.substring(0, 40) + '…' : ans}
                        <button
                            onClick={() => handleRemove(i)}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444', fontWeight: 700, fontSize: '0.625rem', padding: 0, lineHeight: 1 }}
                        >×</button>
                    </span>
                ))}
                {modelAnswers.length === 0 && (
                    <span style={{ fontSize: '0.625rem', color: '#f59e0b', fontWeight: 600 }}>⚠ No model answers</span>
                )}
            </div>
            {/* Input */}
            <div style={{ display: 'flex', gap: '0.25rem' }}>
                <TextInput
                    placeholder="Add model answer..."
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
                    size="xs"
                    style={{ flex: 1 }}
                    styles={{ input: { fontSize: '0.75rem', height: 24, minHeight: 24 } }}
                />
                <button
                    onClick={handleAdd}
                    style={{ padding: '0 0.375rem', border: '1px solid rgba(16,185,129,0.2)', borderRadius: '0.25rem', background: 'transparent', color: '#059669', fontWeight: 700, cursor: 'pointer', fontSize: '0.75rem' }}
                >+</button>
            </div>
        </div>
    );
};

export default THCSWritingAnswerInput;
