/**
 * Matching Features Input Component
 * For IELTS Reading "Matching Features" question type
 * 
 * Format:
 * - Shows a list of options (people/theories/categories) with letters A, B, C...
 * - Each question has a dropdown to select the matching letter
 * - Different from matching headings which uses drag-and-drop
 */

import React from 'react';
import { hasExistingLabel, indexToLetter } from '../../utils/labelDetection';

interface Question {
    number: number;
    type: string;
    question: string;
    options?: string[];
    answer: string | string[] | Record<string, string>;
    passageId: string;
    items?: Array<{ id: string; text: string }>;
}

interface MatchingFeaturesInputProps {
    questions: Question[];
    answers: Record<number, string>;
    onAnswerChange: (questionNumber: number, answer: string) => void;
    disabled?: boolean;
}

const primaryBlue = 'rgb(65, 142, 200)';

export const MatchingFeaturesInput: React.FC<MatchingFeaturesInputProps> = ({
    questions,
    answers,
    onAnswerChange,
    disabled = false
}) => {
    // Use the first question to get the list of options (they should be identical for the group)
    const options = questions[0]?.options || [];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* List of Options Section */}
            <div style={{
                background: '#f8fafc',
                border: '1px solid #d1d5db',
                borderRadius: '2px',
                padding: '1.25rem'
            }}>
                <div style={{
                    fontSize: '16px',
                    fontWeight: 700,
                    marginBottom: '1rem',
                    color: '#000',
                    fontFamily: 'Arial, sans-serif'
                }}>
                    List of Options
                </div>
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem'
                }}>
                    {options.map((opt, i) => {
                        const letter = indexToLetter(i);
                        return (
                            <div
                                key={`opt-${i}`}
                                style={{
                                    display: 'flex',
                                    gap: '0.75rem',
                                    padding: '0.5rem 0',
                                    fontSize: '15px',
                                    color: '#334155',
                                    fontFamily: 'Arial, sans-serif'
                                }}
                            >
                                {hasExistingLabel(opt, i) ? (
                                    <div style={{ flex: 1 }}>{opt}</div>
                                ) : (
                                    <>
                                        <div style={{
                                            fontWeight: 700,
                                            minWidth: '24px',
                                            color: '#000'
                                        }}>
                                            {letter}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            {opt}
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Questions with Clickable Letter Chips */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                {questions.map(q => {
                    const currentAnswer = answers[q.number] || '';

                    return (
                        <div
                            key={q.number}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.5rem',
                                padding: '0.875rem 0',
                                borderBottom: '1px solid #f1f5f9'
                            }}
                        >
                            <div style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '0.75rem',
                            }}>
                                <div style={{
                                    minWidth: '24px',
                                    fontWeight: 700,
                                    fontSize: '15px',
                                    color: '#333'
                                }}>
                                    {q.number}
                                </div>

                                <div style={{
                                    flex: 1,
                                    fontSize: '16px',
                                    color: '#000',
                                    fontFamily: 'Arial, sans-serif',
                                    lineHeight: 1.5,
                                }}>
                                    {q.question}
                                </div>
                            </div>

                            {/* Letter chip buttons */}
                            <div style={{
                                display: 'flex',
                                gap: '0',
                                marginLeft: '36px',
                            }}>
                                {options.map((_, i) => {
                                    const letter = indexToLetter(i);
                                    const isSelected = currentAnswer === letter;
                                    const isLast = i === options.length - 1;
                                    return (
                                        <button
                                            key={letter}
                                            onClick={() => {
                                                if (disabled) return;
                                                onAnswerChange(q.number, isSelected ? '' : letter);
                                            }}
                                            disabled={disabled}
                                            style={{
                                                width: '44px',
                                                height: '36px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                border: `1px solid ${isSelected ? primaryBlue : '#d1d5db'}`,
                                                borderRight: isLast ? `1px solid ${isSelected ? primaryBlue : '#d1d5db'}` : 'none',
                                                borderRadius: i === 0 ? '4px 0 0 4px' : isLast ? '0 4px 4px 0' : '0',
                                                background: isSelected ? primaryBlue : '#ffffff',
                                                color: isSelected ? '#ffffff' : '#374151',
                                                fontSize: '15px',
                                                fontWeight: 700,
                                                cursor: disabled ? 'default' : 'pointer',
                                                transition: 'all 0.15s ease',
                                                fontFamily: 'Arial, sans-serif',
                                                outline: 'none',
                                                padding: 0,
                                            }}
                                        >
                                            {letter}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

