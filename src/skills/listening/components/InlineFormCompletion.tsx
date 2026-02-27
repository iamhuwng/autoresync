/**
 * InlineFormCompletion Component - IELTS CBT Style
 * 
 * Displays questions in an authentic IELTS note/form completion format
 * with inline input fields embedded directly in the text.
 * 
 * Example Layout:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ Phone call about second-hand furniture                          │
 * │                                                                  │
 * │ Items:                                                           │
 * │ Dining table:    - [___1___] shape                               │
 * │                  - medium size                                   │
 * │                  - [___2___] old                                 │
 * │                  - price: £25.00                                 │
 * │                                                                  │
 * │ Dining chairs:   - set of [___3___] chairs                       │
 * │                  - seats covered in [___4___] material           │
 * └─────────────────────────────────────────────────────────────────┘
 * 
 * For questions without rich context, falls back to simple inline format.
 */

import React from 'react';

interface Question {
    number: number;
    type: string;
    question: string;
    options?: string[];
    answer: string | string[] | Record<string, string>;
    passageId?: string;
    sectionId?: string;
    points: number;
    imageUrl?: string;
    context?: {
        sectionHeading?: string;
        subsectionLabel?: string;
        contextLines?: string[];
        currentLineIndex?: number;
    };
    items?: Array<{ id: string; text: string }>;
}

interface InlineFormCompletionProps {
    questions: Question[];
    answers: Record<number, any>;
    onAnswerChange: (questionNumber: number, answer: any) => void;
    testSubmitted?: boolean;
    questionResults?: Record<number, boolean>;
    currentQuestionNumber?: number;
}

/**
 * Inline Input Component - Matches IELTS text entry style
 */
const InlineInput: React.FC<{
    questionNumber: number;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    isCorrect?: boolean;
    testSubmitted?: boolean;
    isActive?: boolean;
}> = ({ questionNumber, value, onChange, disabled, isCorrect, testSubmitted, isActive }) => {
    // Determine border color based on state
    let borderColor = '#d1d5db';
    let backgroundColor = '#ffffff';

    if (testSubmitted) {
        if (isCorrect === true) {
            borderColor = '#10b981';
            backgroundColor = '#ecfdf5';
        } else if (isCorrect === false) {
            borderColor = '#ef4444';
            backgroundColor = '#fef2f2';
        }
    } else if (isActive) {
        borderColor = '#3b82f6';
        backgroundColor = '#eff6ff';
    } else if (value) {
        borderColor = '#6366f1';
        backgroundColor = '#f5f3ff';
    }

    return (
        <span style={{ display: 'inline-block', verticalAlign: 'middle' }}>
            <input
                type="text"
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                placeholder={String(questionNumber)}
                autoComplete="off"
                spellCheck={false}
                style={{
                    width: '120px',
                    minWidth: '80px',
                    maxWidth: '200px',
                    padding: '4px 8px',
                    border: `1px solid ${borderColor}`,
                    borderRadius: '4px',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    backgroundColor,
                    color: '#1f2937',
                    textAlign: 'center',
                    outline: 'none',
                    transition: 'all 0.2s',
                    boxShadow: isActive ? '0 0 0 2px rgba(59, 130, 246, 0.2)' : 'none',
                }}
                onFocus={(e) => {
                    e.target.style.borderColor = '#3b82f6';
                    e.target.style.boxShadow = '0 0 0 2px rgba(59, 130, 246, 0.2)';
                }}
                onBlur={(e) => {
                    e.target.style.borderColor = borderColor;
                    e.target.style.boxShadow = isActive ? '0 0 0 2px rgba(59, 130, 246, 0.2)' : 'none';
                }}
            />
        </span>
    );
};

/**
 * Parse question text and render with inline input
 * Replaces placeholder patterns like ___1___, (1), [1], etc. with input fields
 */
const renderQuestionWithInput = (
    question: Question,
    answer: any,
    onAnswerChange: (value: string) => void,
    testSubmitted?: boolean,
    isCorrect?: boolean,
    isActive?: boolean
) => {
    const text = question.question;

    // Pattern to find blanks: ___X___, (X), [X], _X_, or just leave the text as-is
    // For simple questions, just show the question text with an input after

    // Check if question text contains a blank pattern
    const blankPatterns = [
        /_{2,}\d*_{0,}/g,  // ___1___ or ____
        /\(\s*\d+\s*\)/g,   // (1)
        /\[\s*\d+\s*\]/g,   // [1]
    ];

    let hasBlank = false;
    for (const pattern of blankPatterns) {
        if (pattern.test(text)) {
            hasBlank = true;
            break;
        }
    }

    if (hasBlank) {
        // Replace blanks with input fields
        const parts: React.ReactNode[] = [];
        let lastIndex = 0;
        const allPattern = /_{2,}\d*_{0,}|\(\s*\d+\s*\)|\[\s*\d+\s*\]/g;
        let match;
        let inputRendered = false;

        while ((match = allPattern.exec(text)) !== null) {
            // Add text before the match
            if (match.index > lastIndex) {
                parts.push(
                    <span key={`text-${lastIndex}`}>
                        {text.slice(lastIndex, match.index)}
                    </span>
                );
            }

            // Add input field (only once per question)
            if (!inputRendered) {
                parts.push(
                    <InlineInput
                        key={`input-${question.number}`}
                        questionNumber={question.number}
                        value={answer || ''}
                        onChange={onAnswerChange}
                        disabled={testSubmitted}
                        isCorrect={isCorrect}
                        testSubmitted={testSubmitted}
                        isActive={isActive}
                    />
                );
                inputRendered = true;
            }

            lastIndex = match.index + match[0].length;
        }

        // Add remaining text
        if (lastIndex < text.length) {
            parts.push(
                <span key={`text-end`}>
                    {text.slice(lastIndex)}
                </span>
            );
        }

        return parts;
    }

    // No blank pattern found - show question text with input at end
    return (
        <>
            <span>{text} </span>
            <InlineInput
                questionNumber={question.number}
                value={answer || ''}
                onChange={onAnswerChange}
                disabled={testSubmitted}
                isCorrect={isCorrect}
                testSubmitted={testSubmitted}
                isActive={isActive}
            />
        </>
    );
};

/**
 * Context Form Display - Shows structured form/notes content
 */
const ContextFormDisplay: React.FC<{
    context: Question['context'];
    question: Question;
    answer: any;
    onAnswerChange: (value: string) => void;
    testSubmitted?: boolean;
    isCorrect?: boolean;
    isActive?: boolean;
}> = ({ context, question, answer, onAnswerChange, testSubmitted, isCorrect, isActive }) => {
    if (!context || !context.contextLines) {
        return null;
    }

    return (
        <div style={{ fontFamily: 'inherit' }}>
            {/* Section Heading */}
            {context.sectionHeading && (
                <h3 style={{
                    fontSize: '16px',
                    fontWeight: 700,
                    color: '#1f2937',
                    marginBottom: '12px',
                    paddingBottom: '8px',
                    borderBottom: '1px solid #e5e7eb',
                }}>
                    {context.sectionHeading}
                </h3>
            )}

            {/* Subsection Label */}
            {context.subsectionLabel && (
                <div style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#4b5563',
                    marginBottom: '8px',
                }}>
                    {context.subsectionLabel}
                </div>
            )}

            {/* Context Lines */}
            {context.contextLines.map((line, idx) => {
                const isCurrentLine = idx === context.currentLineIndex;

                // Check if this line should have the input
                const lineHasBlank = /_{2,}|\(\s*\d+\s*\)|\[\s*\d+\s*\]/.test(line);

                return (
                    <div
                        key={idx}
                        style={{
                            fontSize: '14px',
                            lineHeight: 1.8,
                            color: '#374151',
                            padding: isCurrentLine ? '4px 8px' : '2px 0',
                            marginLeft: line.startsWith('-') || line.startsWith('•') ? '16px' : '0',
                            backgroundColor: isCurrentLine ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                            borderRadius: '4px',
                        }}
                    >
                        {lineHasBlank ? (
                            renderQuestionWithInput(
                                { ...question, question: line },
                                answer,
                                onAnswerChange,
                                testSubmitted,
                                isCorrect,
                                isActive
                            )
                        ) : (
                            line
                        )}
                    </div>
                );
            })}
        </div>
    );
};

/**
 * Main InlineFormCompletion Component
 */
export const InlineFormCompletion: React.FC<InlineFormCompletionProps> = ({
    questions,
    answers,
    onAnswerChange,
    testSubmitted,
    questionResults,
    currentQuestionNumber,
}) => {
    // Check if any question has context for form rendering
    const hasContext = questions.some(q => q.context?.contextLines);

    if (hasContext) {
        // Form/Notes mode: Group by context and render structured content
        // For now, render each question with its context
        return (
            <div style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '20px 24px',
            }}>
                {questions.map((question, idx) => {
                    const isActive = currentQuestionNumber === question.number;
                    const isCorrect = questionResults?.[question.number];

                    return (
                        <div
                            key={question.number}
                            style={{
                                marginBottom: idx < questions.length - 1 ? '16px' : 0,
                            }}
                        >
                            {question.context ? (
                                <ContextFormDisplay
                                    context={question.context}
                                    question={question}
                                    answer={answers[question.number]}
                                    onAnswerChange={(value) => onAnswerChange(question.number, value)}
                                    testSubmitted={testSubmitted}
                                    isCorrect={isCorrect}
                                    isActive={isActive}
                                />
                            ) : (
                                // Simple inline format for questions without context
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'baseline',
                                    gap: '8px',
                                    padding: '8px',
                                    backgroundColor: isActive ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
                                    borderRadius: '6px',
                                }}>
                                    <span style={{
                                        fontWeight: 600,
                                        fontSize: '14px',
                                        color: testSubmitted
                                            ? (isCorrect ? '#10b981' : '#ef4444')
                                            : '#6b7280',
                                        minWidth: '24px',
                                    }}>
                                        {question.number}.
                                    </span>
                                    <div style={{ flex: 1, fontSize: '14px', lineHeight: 1.8 }}>
                                        {renderQuestionWithInput(
                                            question,
                                            answers[question.number],
                                            (value) => onAnswerChange(question.number, value),
                                            testSubmitted,
                                            isCorrect,
                                            isActive
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    }

    // Simple list mode: Render as compact inline questions
    return (
        <div style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            padding: '16px 20px',
        }}>
            {questions.map((question, idx) => {
                const isActive = currentQuestionNumber === question.number;
                const isCorrect = questionResults?.[question.number];

                return (
                    <div
                        key={question.number}
                        style={{
                            display: 'flex',
                            alignItems: 'baseline',
                            gap: '8px',
                            padding: '10px 12px',
                            marginBottom: idx < questions.length - 1 ? '4px' : 0,
                            backgroundColor: isActive ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
                            borderRadius: '6px',
                            borderLeft: isActive ? '3px solid #3b82f6' : '3px solid transparent',
                            transition: 'all 0.2s',
                        }}
                    >
                        {/* Question Number */}
                        <span style={{
                            fontWeight: 700,
                            fontSize: '14px',
                            color: testSubmitted
                                ? (isCorrect ? '#10b981' : '#ef4444')
                                : (isActive ? '#3b82f6' : '#6b7280'),
                            minWidth: '28px',
                        }}>
                            {question.number}.
                        </span>

                        {/* Question Content with Inline Input */}
                        <div style={{ flex: 1, fontSize: '14px', lineHeight: 1.8, color: '#374151' }}>
                            {renderQuestionWithInput(
                                question,
                                answers[question.number],
                                (value) => onAnswerChange(question.number, value),
                                testSubmitted,
                                isCorrect,
                                isActive
                            )}
                        </div>

                        {/* Status indicator */}
                        {testSubmitted && (
                            <span style={{
                                fontSize: '14px',
                                marginLeft: '8px',
                            }}>
                                {isCorrect ? '✓' : '✗'}
                            </span>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default InlineFormCompletion;
