/**
 * THCSPronunciationOptions — Pronunciation/stress question with underline support (PRD-0027 Task 4.5)
 * Supports standard text-select underline AND quick-underline (click-to-toggle) mode.
 */
import React, { useState, useRef } from 'react';
import { TextInput, Switch, ActionIcon, Tooltip } from '@mantine/core';

interface THCSPronunciationOptionsProps {
    options: [string, string, string, string];
    optionUnderlines: [string, string, string, string];
    correctAnswer: '' | 'A' | 'B' | 'C' | 'D';
    onUpdate: (updates: {
        options?: [string, string, string, string];
        optionUnderlines?: [string, string, string, string];
        correctAnswer?: '' | 'A' | 'B' | 'C' | 'D';
    }) => void;
}

const LABELS = ['A', 'B', 'C', 'D'] as const;

/** Parse underline markup: replace {{x}} with <u>x</u> for preview */
function renderUnderlinePreview(text: string): React.ReactNode {
    if (!text) return null;
    const parts = text.split(/(\{\{.*?\}\})/g);
    return parts.map((part, i) => {
        if (part.startsWith('{{') && part.endsWith('}}')) {
            return <u key={i} style={{ color: '#8b5cf6', fontWeight: 600 }}>{part.slice(2, -2)}</u>;
        }
        return <span key={i}>{part}</span>;
    });
}

/** Toggle underline on a character at position */
function toggleCharUnderline(text: string, charIndex: number): string {
    // Find all underline ranges
    const plainText = text.replace(/\{\{|\}\}/g, '');
    let result = '';
    let isUnderlined = false;

    // Simple approach: rebuild from scratch
    // First, build a mapping of which plain chars are underlined
    const underlineMap: boolean[] = [];
    let plainIdx = 0;
    let inMarker = false;
    for (let i = 0; i < text.length; i++) {
        if (text.substring(i, i + 2) === '{{') {
            inMarker = true;
            i++; // skip next char
            continue;
        }
        if (text.substring(i, i + 2) === '}}') {
            inMarker = false;
            i++;
            continue;
        }
        underlineMap[plainIdx] = inMarker;
        plainIdx++;
    }

    // Toggle the target character
    if (charIndex >= 0 && charIndex < underlineMap.length) {
        underlineMap[charIndex] = !underlineMap[charIndex];
    }

    // Rebuild the markup string
    let prevState = false;
    for (let i = 0; i < plainText.length; i++) {
        const curr = underlineMap[i] || false;
        if (curr && !prevState) result += '{{';
        if (!curr && prevState) result += '}}';
        result += plainText[i];
        prevState = curr;
    }
    if (prevState) result += '}}';

    return result;
}

const THCSPronunciationOptions: React.FC<THCSPronunciationOptionsProps> = ({
    options, optionUnderlines, correctAnswer, onUpdate,
}) => {
    const [quickMode, setQuickMode] = useState(false);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    const handleTextChange = (index: number, value: string) => {
        const newOpts = [...options] as [string, string, string, string];
        const newUnds = [...optionUnderlines] as [string, string, string, string];
        newOpts[index] = value;
        newUnds[index] = value; // Reset underlines when text changes
        onUpdate({ options: newOpts, optionUnderlines: newUnds });
    };

    const handleUnderlineSelected = (index: number) => {
        const input = inputRefs.current[index];
        if (!input) return;
        const start = input.selectionStart ?? 0;
        const end = input.selectionEnd ?? 0;
        if (start === end) return; // no selection

        const text = optionUnderlines[index] || options[index];
        const plain = text.replace(/\{\{|\}\}/g, '');
        const newText = plain.substring(0, start) + '{{' + plain.substring(start, end) + '}}' + plain.substring(end);

        const newUnds = [...optionUnderlines] as [string, string, string, string];
        newUnds[index] = newText;
        onUpdate({ optionUnderlines: newUnds });
    };

    const handleQuickClick = (index: number, charIdx: number) => {
        const text = optionUnderlines[index] || options[index];
        const newText = toggleCharUnderline(text, charIdx);
        const newUnds = [...optionUnderlines] as [string, string, string, string];
        newUnds[index] = newText;
        onUpdate({ optionUnderlines: newUnds });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Quick underline toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Switch
                    label="Quick Underline Mode"
                    description="Click characters to toggle underline"
                    size="xs"
                    checked={quickMode}
                    onChange={(e) => setQuickMode(e.currentTarget.checked)}
                    color="violet"
                />
            </div>

            {LABELS.map((label, i) => {
                const isCorrect = correctAnswer === label;
                const underlineText = optionUnderlines[i] || options[i];
                const plainText = (underlineText || '').replace(/\{\{|\}\}/g, '');

                return (
                    <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {/* Radio for correct answer */}
                            <input
                                type="radio"
                                name="pronunciation-correct"
                                checked={isCorrect}
                                onChange={() => onUpdate({ correctAnswer: label })}
                                style={{ accentColor: '#8b5cf6', width: 16, height: 16 }}
                            />
                            <span style={{
                                fontWeight: 700, fontSize: '0.875rem', color: isCorrect ? '#8b5cf6' : '#64748b',
                                minWidth: 20,
                            }}>
                                {label}.
                            </span>

                            {/* Text input */}
                            <TextInput
                                ref={(el) => { inputRefs.current[i] = el?.querySelector('input') ?? null; }}
                                placeholder={`Option ${label}`}
                                value={options[i]}
                                onChange={(e) => handleTextChange(i, e.target.value)}
                                style={{ flex: 1 }}
                                size="sm"
                            />

                            {/* Underline button (standard mode) */}
                            {!quickMode && (
                                <Tooltip label="Underline selected text">
                                    <ActionIcon
                                        variant="light"
                                        color="violet"
                                        size="sm"
                                        onClick={() => handleUnderlineSelected(i)}
                                    >
                                        U̲
                                    </ActionIcon>
                                </Tooltip>
                            )}
                        </div>

                        {/* Quick underline character grid */}
                        {quickMode && plainText && (
                            <div style={{
                                display: 'flex', flexWrap: 'wrap', gap: '2px',
                                padding: '0.25rem', background: 'rgba(139,92,246,0.05)',
                                borderRadius: '0.375rem', marginLeft: 36,
                            }}>
                                {plainText.split('').map((char, ci) => {
                                    // Check if this char is underlined
                                    const uMap: boolean[] = [];
                                    let pIdx = 0;
                                    let inM = false;
                                    for (let t = 0; t < underlineText.length; t++) {
                                        if (underlineText.substring(t, t + 2) === '{{') { inM = true; t++; continue; }
                                        if (underlineText.substring(t, t + 2) === '}}') { inM = false; t++; continue; }
                                        uMap[pIdx++] = inM;
                                    }
                                    const isUnd = uMap[ci] || false;

                                    return (
                                        <span
                                            key={ci}
                                            onClick={() => handleQuickClick(i, ci)}
                                            style={{
                                                cursor: 'pointer',
                                                padding: '2px 1px',
                                                textDecoration: isUnd ? 'underline' : 'none',
                                                textDecorationColor: '#8b5cf6',
                                                fontWeight: isUnd ? 700 : 400,
                                                color: isUnd ? '#8b5cf6' : '#1e293b',
                                                fontSize: '1rem',
                                                userSelect: 'none',
                                            }}
                                        >
                                            {char}
                                        </span>
                                    );
                                })}
                            </div>
                        )}

                        {/* Preview */}
                        {underlineText && underlineText.includes('{{') && (
                            <div style={{
                                marginLeft: 36, fontSize: '0.8125rem', color: '#64748b',
                                padding: '0.125rem 0.5rem',
                                background: 'rgba(139,92,246,0.05)', borderRadius: '0.25rem',
                            }}>
                                Preview: {renderUnderlinePreview(underlineText)}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default THCSPronunciationOptions;
