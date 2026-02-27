/**
 * THCSErrorIdentification — Error identification question editor (PRD-0027 Task 4.6)
 * Teacher underlines 4 parts in a sentence, labels them A-D, and selects the incorrect one.
 */
import React, { useRef } from 'react';
import { Textarea, Select, ActionIcon, Tooltip, Text, Alert } from '@mantine/core';

interface THCSErrorIdentificationProps {
    questionText: string;
    underlinedParts: string; // Full sentence with {{}} markup
    correctAnswer: '' | 'A' | 'B' | 'C' | 'D';
    onUpdate: (updates: {
        questionText?: string;
        underlinedParts?: string;
        correctAnswer?: '' | 'A' | 'B' | 'C' | 'D';
    }) => void;
}

const LABELS = ['A', 'B', 'C', 'D'] as const;

/** Extract underlined parts from markup text */
function extractParts(text: string): string[] {
    const matches = text.match(/\{\{(.*?)\}\}/g) || [];
    return matches.map(m => m.slice(2, -2));
}

/** Render preview with labeled underlined parts */
function renderPreview(text: string): React.ReactNode {
    if (!text) return null;
    const parts = text.split(/(\{\{.*?\}\})/g);
    let partIndex = 0;

    return parts.map((part, i) => {
        if (part.startsWith('{{') && part.endsWith('}}')) {
            const label = LABELS[partIndex] || '?';
            partIndex++;
            return (
                <span key={i} style={{ position: 'relative', display: 'inline' }}>
                    <u style={{ color: '#8b5cf6', fontWeight: 600 }}>{part.slice(2, -2)}</u>
                    <sup style={{
                        fontSize: '0.625rem', fontWeight: 700, color: '#8b5cf6',
                        marginLeft: 1,
                    }}>
                        ({label})
                    </sup>
                </span>
            );
        }
        return <span key={i}>{part}</span>;
    });
}

const THCSErrorIdentification: React.FC<THCSErrorIdentificationProps> = ({
    questionText, underlinedParts, correctAnswer, onUpdate,
}) => {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    const handleSentenceChange = (value: string) => {
        onUpdate({ questionText: value, underlinedParts: value });
    };

    const handleUnderlineSelected = () => {
        const el = textareaRef.current;
        if (!el) return;
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? 0;
        if (start === end) return;

        // Work on the plain text (remove existing markers)
        const text = underlinedParts || questionText;
        const before = text.substring(0, start);
        const selected = text.substring(start, end);
        const after = text.substring(end);
        const newText = before + '{{' + selected + '}}' + after;

        onUpdate({ underlinedParts: newText });
    };

    const parts = extractParts(underlinedParts || '');
    const partCount = parts.length;
    const hasError = partCount !== 4 && partCount > 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Sentence textarea with underline toolbar */}
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 500 }}>Sentence</label>
                    <Tooltip label="Select text and click to underline it">
                        <ActionIcon
                            variant="light"
                            color="violet"
                            size="sm"
                            onClick={handleUnderlineSelected}
                        >
                            U̲
                        </ActionIcon>
                    </Tooltip>
                </div>
                <Textarea
                    ref={textareaRef}
                    placeholder='Type the sentence here, then select parts and click U̲ to underline them.'
                    value={underlinedParts || questionText}
                    onChange={(e) => handleSentenceChange(e.target.value)}
                    minRows={3}
                    autosize
                />
            </div>

            {/* Preview */}
            {underlinedParts && underlinedParts.includes('{{') && (
                <div style={{
                    padding: '0.75rem 1rem',
                    background: 'rgba(139,92,246,0.05)',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(139,92,246,0.1)',
                    fontSize: '0.9375rem',
                    lineHeight: 1.6,
                }}>
                    <Text size="xs" c="dimmed" mb={4}>Preview:</Text>
                    <div>{renderPreview(underlinedParts)}</div>
                </div>
            )}

            {/* Validation */}
            {hasError && (
                <Alert color="red" variant="light" style={{ fontSize: '0.8125rem' }}>
                    Exactly 4 underlined parts required. Currently: {partCount}.
                </Alert>
            )}

            {/* Correct answer */}
            <Select
                label="Which part needs correction?"
                placeholder="Select A, B, C, or D"
                data={LABELS.map((l, i) => ({
                    value: l,
                    label: parts[i] ? `${l}: "${parts[i]}"` : l,
                    disabled: i >= partCount,
                }))}
                value={correctAnswer || null}
                onChange={(val) => onUpdate({ correctAnswer: (val as 'A' | 'B' | 'C' | 'D') || '' })}
                size="sm"
            />
        </div>
    );
};

export default THCSErrorIdentification;
