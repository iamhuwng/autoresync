/**
 * THCSClozeAnswerInput — Answer key sub-component for cloze questions (PRD-0028 Task 3.3)
 * Word bank dropdown per blank.
 */
import React from 'react';
import { Select } from '@mantine/core';

interface THCSClozeAnswerInputProps {
    wordBank: string[];
    selectedWord: string;
    blankNumber: number;
    onUpdate: (word: string) => void;
}

const THCSClozeAnswerInput: React.FC<THCSClozeAnswerInputProps> = ({ wordBank, selectedWord, blankNumber, onUpdate }) => {
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: '0.375rem',
            padding: '0.25rem 0',
        }}>
            <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#2563eb', minWidth: 55 }}>
                Blank {blankNumber}:
            </span>
            <Select
                data={wordBank.map(w => ({ value: w, label: w }))}
                value={selectedWord || null}
                onChange={(val) => onUpdate(val || '')}
                placeholder="Select word"
                size="xs"
                style={{ flex: 1, maxWidth: 160 }}
                styles={{ input: { fontSize: '0.75rem', height: 24, minHeight: 24 } }}
                clearable
            />
            {!selectedWord && (
                <span style={{ fontSize: '0.5625rem', color: '#dc2626', fontWeight: 600 }}>❌</span>
            )}
        </div>
    );
};

export default THCSClozeAnswerInput;
