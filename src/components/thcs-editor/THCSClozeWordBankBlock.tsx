/**
 * THCSClozeWordBankBlock — Cloze word bank editor block (PRD-0028 Task 2.3)
 * Section-level component managing a SINGLE question with multiple blanks.
 * Each blank is a sub-item, NOT a separate question.
 */
import React, { useState, useMemo } from 'react';
import { Textarea, TextInput, Select, Switch } from '@mantine/core';
import type { THCSQuestion } from '../../types/thcs-test.types';

interface THCSClozeWordBankBlockProps {
    question: THCSQuestion;
    onUpdate: (q: THCSQuestion) => void;
}

const THCSClozeWordBankBlock: React.FC<THCSClozeWordBankBlockProps> = ({ question, onUpdate }) => {
    const [wordInput, setWordInput] = useState('');

    const passageTemplate = question.passageTemplate || '';
    const wordBank = question.wordBank || [];
    const blankMapping = question.blankMapping || {};

    // Detect blanks from `___(N)___` pattern
    const detectedBlanks = useMemo(() => {
        const regex = /___\((\d+)\)___/g;
        const blanks: number[] = [];
        let match;
        while ((match = regex.exec(passageTemplate)) !== null) {
            blanks.push(parseInt(match[1]!, 10));
        }
        return blanks.sort((a, b) => a - b);
    }, [passageTemplate]);

    // Compute word usage counts across blankMapping (render-only, do NOT mutate wordBank)
    const wordUsageCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const word of Object.values(blankMapping)) {
            counts[word] = (counts[word] || 0) + 1;
        }
        return counts;
    }, [blankMapping]);

    // Distractors: words in wordBank that are NOT mapped to any blank
    const distractors = useMemo(() => {
        const mappedWords = new Set(Object.values(blankMapping));
        return wordBank.filter(w => !mappedWords.has(w));
    }, [wordBank, blankMapping]);

    // Validation
    const hasUnmappedBlanks = detectedBlanks.some(n => !blankMapping[n]);
    const hasNoDistractors = distractors.length === 0 && wordBank.length > 0;

    const handleAddWord = (word: string) => {
        if (!word.trim()) return;
        if (wordBank.includes(word.trim())) return;
        onUpdate({ ...question, wordBank: [...wordBank, word.trim()] });
        setWordInput('');
    };

    const handleRemoveWord = (word: string) => {
        // Remove from wordBank
        const newWordBank = wordBank.filter(w => w !== word);
        // Also remove from blankMapping if it was assigned
        const newMapping = { ...blankMapping };
        for (const [key, val] of Object.entries(newMapping)) {
            if (val === word) delete newMapping[Number(key)];
        }
        onUpdate({ ...question, wordBank: newWordBank, blankMapping: newMapping });
    };

    const handleBlankMapping = (blankNum: number, word: string) => {
        const newMapping = { ...blankMapping };
        if (word) {
            newMapping[blankNum] = word;
        } else {
            delete newMapping[blankNum];
        }
        onUpdate({ ...question, blankMapping: newMapping });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Passage Template */}
            <Textarea
                label="Passage Template"
                description="Use ___(N)___ for numbered blanks. Example: The ___(1)___ ran across ___(2)___ road."
                placeholder="Enter passage with numbered blank markers..."
                value={passageTemplate}
                onChange={(e) => onUpdate({ ...question, passageTemplate: e.target.value })}
                minRows={5}
                autosize
                size="sm"
            />

            {/* Blank count */}
            <div style={{
                padding: '0.375rem 0.75rem',
                background: detectedBlanks.length > 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                borderRadius: '0.5rem',
                fontSize: '0.8125rem', fontWeight: 600,
                color: detectedBlanks.length > 0 ? '#059669' : '#dc2626',
            }}>
                {detectedBlanks.length > 0
                    ? `✅ Blanks detected: ${detectedBlanks.length} (${detectedBlanks.join(', ')})`
                    : '⚠️ No blanks detected — use ___(1)___, ___(2)___, etc.'}
            </div>

            {/* Word Bank Editor */}
            <div style={{
                padding: '0.75rem',
                background: 'rgba(59,130,246,0.04)',
                borderRadius: '0.5rem',
                border: '1px solid rgba(59,130,246,0.1)',
            }}>
                <label style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#2563eb', marginBottom: '0.375rem', display: 'block' }}>
                    Word Bank
                </label>

                {/* Word chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '0.5rem' }}>
                    {wordBank.map((word, i) => {
                        const count = wordUsageCounts[word] || 0;
                        const isDistractor = distractors.includes(word);
                        return (
                            <span key={i} style={{
                                display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                padding: '0.25rem 0.625rem', borderRadius: '1rem',
                                background: isDistractor
                                    ? 'rgba(251,191,36,0.15)'
                                    : 'rgba(59,130,246,0.12)',
                                color: isDistractor ? '#92400e' : '#2563eb',
                                fontSize: '0.75rem', fontWeight: 600,
                            }}>
                                {word}
                                {/* Render-only usage count decoration — wordBank is NOT mutated */}
                                {count > 1 && <span style={{ fontSize: '0.625rem', color: '#6b7280' }}>×{count}</span>}
                                <button
                                    onClick={() => handleRemoveWord(word)}
                                    style={{
                                        border: 'none', background: 'transparent', cursor: 'pointer',
                                        color: '#ef4444', fontWeight: 700, fontSize: '0.75rem', padding: 0,
                                        lineHeight: 1,
                                    }}
                                >
                                    ×
                                </button>
                            </span>
                        );
                    })}
                    {wordBank.length === 0 && (
                        <span style={{ fontSize: '0.75rem', color: '#9ca3af', fontStyle: 'italic' }}>
                            No words added yet
                        </span>
                    )}
                </div>

                {/* Add word input */}
                <div style={{ display: 'flex', gap: '0.375rem' }}>
                    <TextInput
                        placeholder="Type word, press Enter"
                        value={wordInput}
                        onChange={(e) => setWordInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddWord(wordInput);
                            }
                        }}
                        size="xs"
                        style={{ flex: 1 }}
                    />
                    <button
                        onClick={() => handleAddWord(wordInput)}
                        style={{
                            padding: '0 0.5rem', border: '1px solid rgba(59,130,246,0.3)',
                            borderRadius: '0.375rem', background: 'rgba(59,130,246,0.08)',
                            color: '#2563eb', fontWeight: 700, cursor: 'pointer', fontSize: '0.875rem',
                        }}
                    >
                        +
                    </button>
                </div>

                {/* Distractors display */}
                {distractors.length > 0 && (
                    <div style={{ marginTop: '0.375rem', fontSize: '0.6875rem', color: '#92400e' }}>
                        Distractors: {distractors.map(d => `[${d}]`).join(' ')}
                    </div>
                )}
            </div>

            {/* Blank Mapping Table */}
            {detectedBlanks.length > 0 && wordBank.length > 0 && (
                <div style={{
                    padding: '0.75rem',
                    background: 'rgba(139,92,246,0.04)',
                    borderRadius: '0.5rem',
                    border: '1px solid rgba(139,92,246,0.1)',
                }}>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#7c3aed', marginBottom: '0.375rem', display: 'block' }}>
                        Blank → Correct Word Mapping
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                        {detectedBlanks.map((blankNum) => (
                            <div key={blankNum} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{
                                    fontWeight: 700, fontSize: '0.8125rem', color: '#6366f1',
                                    minWidth: 70,
                                }}>
                                    Blank {blankNum}:
                                </span>
                                <Select
                                    data={wordBank.map(w => ({ value: w, label: w }))}
                                    value={blankMapping[blankNum] || null}
                                    onChange={(val) => handleBlankMapping(blankNum, val || '')}
                                    placeholder="Select correct word"
                                    size="xs"
                                    style={{ flex: 1, maxWidth: 200 }}
                                    clearable
                                />
                                {!blankMapping[blankNum] && (
                                    <span style={{ color: '#dc2626', fontSize: '0.6875rem', fontWeight: 600 }}>
                                        ❌ Not mapped
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Settings */}
            <div style={{
                padding: '0.5rem 0.75rem',
                background: 'rgba(139,92,246,0.04)',
                borderRadius: '0.5rem',
                border: '1px solid rgba(139,92,246,0.1)',
            }}>
                <Switch
                    label="Allow word reuse"
                    description="If enabled, students can select the same word for multiple blanks"
                    checked={question.allowWordReuse || false}
                    onChange={(e) => onUpdate({ ...question, allowWordReuse: e.currentTarget.checked })}
                    size="sm"
                    color="violet"
                />
            </div>

            {/* Validation warnings */}
            {hasUnmappedBlanks && (
                <div style={{
                    padding: '0.375rem 0.75rem', borderRadius: '0.375rem',
                    background: 'rgba(239,68,68,0.08)', color: '#dc2626',
                    fontSize: '0.75rem', fontWeight: 600,
                }}>
                    ❌ Some blanks have no correct word assigned — cannot publish
                </div>
            )}
            {hasNoDistractors && detectedBlanks.length > 0 && (
                <div style={{
                    padding: '0.375rem 0.75rem', borderRadius: '0.375rem',
                    background: 'rgba(251,191,36,0.08)', color: '#92400e',
                    fontSize: '0.75rem', fontWeight: 600,
                }}>
                    ⚠️ No distractors in word bank — consider adding extra words to increase difficulty
                </div>
            )}
        </div>
    );
};

export default THCSClozeWordBankBlock;
