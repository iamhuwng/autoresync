/**
 * THCSClozeAnswerInput — Answer key sub-component for cloze questions (PRD-0028 Task 3.3)
 * Word bank dropdown per blank.
 */
import React from 'react';

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
            <select
                aria-label={`Word for blank ${blankNumber}`}
                value={selectedWord || ''}
                onChange={(event) => onUpdate(event.target.value)}
                style={{ flex: 1, maxWidth: 160, minWidth: 0, fontSize: '0.75rem', minHeight: 28, border: '1px solid #cbd5e1', borderRadius: 4 }}
            >
                <option value="">Select word</option>
                {wordBank.map(word => <option key={word} value={word}>{word}</option>)}
            </select>
            {!selectedWord && (
                <span style={{ fontSize: '0.5625rem', color: '#dc2626', fontWeight: 600 }}>❌</span>
            )}
        </div>
    );
};

export default THCSClozeAnswerInput;
