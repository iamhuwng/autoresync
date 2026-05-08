import React, { useMemo, useState } from 'react';
import {
    buildFallbackReadingLabel,
    getReadingQuestionOptions,
    splitReadingOptionLabel,
    type ReadingOptionDisplayValue,
} from '../../utils/readingOptionDisplay';
import { MOBILE_READING_LAYER_Z_INDEX } from './mobile/mobileReadingLayering';

type QuestionOption = ReadingOptionDisplayValue;

interface Question {
    number: number;
    type: string;
    question: string;
    options?: QuestionOption[];
    labeledOptions?: QuestionOption[];
    answer: string | string[] | Record<string, string>;
    passageId: string;
    items?: Array<{ id: string; text: string }>;
    optionLabelFormat?: 'roman' | 'letter';
}

interface MobileMatchingHeadingsInputProps {
    questions: Question[];
    answers: Record<number, string>;
    onAnswerChange: (questionNumber: number, answer: string) => void;
    onQuestionRefChange?: (questionNumber: number, element: HTMLElement | null) => void;
    disabled?: boolean;
    labelType?: 'roman' | 'letter';
    listTitle?: string;
    fontSize?: number;
    lineSpacing?: number;
}

interface HeadingOptionEntry {
    value: string;
    display: string;
    text: string;
}

const primaryBlue = 'rgb(65, 142, 200)';

const modalBackdropStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: MOBILE_READING_LAYER_Z_INDEX.UTILITY_MODAL,
    background: 'rgba(15, 23, 42, 0.52)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    padding: '1rem',
};

const modalCardStyle: React.CSSProperties = {
    width: 'min(100%, 460px)',
    maxHeight: 'min(84dvh, 760px)',
    overflowY: 'auto',
    borderRadius: '1.25rem',
    background: '#ffffff',
    boxShadow: '0 24px 48px rgba(15, 23, 42, 0.24)',
};

const getQuestionOptions = (question?: Question): QuestionOption[] => getReadingQuestionOptions(question);

export const MobileMatchingHeadingsInput: React.FC<MobileMatchingHeadingsInputProps> = ({
    questions,
    answers,
    onAnswerChange,
    onQuestionRefChange,
    disabled = false,
    labelType = 'roman',
    listTitle = 'List of Headings',
    fontSize,
    lineSpacing,
}) => {
    const [openQuestionNumber, setOpenQuestionNumber] = useState<number | null>(null);

    const headingOptions = useMemo<HeadingOptionEntry[]>(() => {
        const firstQuestion = questions[0];
        return getQuestionOptions(firstQuestion).map((option, index) => {
            const split = splitReadingOptionLabel(option);
            const value = split.label || buildFallbackReadingLabel(index, labelType);
            return {
                value,
                display: split.text ? `${value}. ${split.text}` : value,
                text: split.text || value,
            };
        });
    }, [labelType, questions]);

    const selectedValues = useMemo(
        () => Object.values(answers).filter((answer): answer is string => typeof answer === 'string' && answer.length > 0),
        [answers],
    );

    const questionFontSize = fontSize ? `${fontSize}px` : '16px';
    const questionLineHeight = lineSpacing ?? 1.5;
    const activeQuestion = openQuestionNumber === null
        ? null
        : questions.find((question) => question.number === openQuestionNumber) || null;
    const activeAnswer = activeQuestion ? answers[activeQuestion.number] || '' : '';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <details
                style={{
                    background: '#f8fafc',
                    border: '1px solid #d1d5db',
                    borderRadius: '12px',
                    overflow: 'hidden',
                }}
            >
                <summary
                    style={{
                        cursor: 'pointer',
                        listStyle: 'none',
                        padding: '0.875rem 1rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        fontSize: '15px',
                        fontWeight: 700,
                        color: '#0f172a',
                        background: '#f1f5f9',
                    }}
                >
                    <span>{listTitle}</span>
                    <span
                        style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            color: '#475569',
                            background: '#ffffff',
                            border: '1px solid #cbd5e1',
                            borderRadius: '999px',
                            padding: '0.125rem 0.5rem',
                        }}
                    >
                        {headingOptions.length} items
                    </span>
                </summary>

                <div style={{ padding: '0.75rem 1rem 1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {headingOptions.map((option) => (
                            <div
                                key={option.value}
                                style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '0.75rem',
                                    padding: '0.625rem 0.75rem',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '10px',
                                    background: '#ffffff',
                                }}
                            >
                                <div
                                    style={{
                                        flexShrink: 0,
                                        minWidth: '32px',
                                        height: '32px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderRadius: '999px',
                                        background: '#eff6ff',
                                        color: primaryBlue,
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        textTransform: 'uppercase',
                                    }}
                                >
                                    {option.value}
                                </div>
                                <div
                                    style={{
                                        fontSize: '14px',
                                        lineHeight: 1.45,
                                        color: '#334155',
                                        overflowWrap: 'anywhere',
                                    }}
                                >
                                    {option.text}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </details>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                {questions.map((question) => {
                    const currentAnswer = answers[question.number] || '';
                    const selectedHeading = headingOptions.find((option) => option.value === currentAnswer) || null;

                    return (
                        <article
                            key={question.number}
                            ref={(element) => {
                                onQuestionRefChange?.(question.number, element);
                            }}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.75rem',
                                padding: '1rem',
                                border: `1px solid ${selectedHeading ? '#93c5fd' : '#d1d5db'}`,
                                borderRadius: '14px',
                                background: selectedHeading ? '#f8fbff' : '#ffffff',
                                boxShadow: selectedHeading ? '0 1px 2px rgba(65, 142, 200, 0.08)' : 'none',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                                <div
                                    style={{
                                        flexShrink: 0,
                                        minWidth: '28px',
                                        height: '28px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderRadius: '999px',
                                        background: '#e2e8f0',
                                        color: '#0f172a',
                                        fontSize: '13px',
                                        fontWeight: 700,
                                    }}
                                >
                                    {question.number}
                                </div>
                                <div
                                    style={{
                                        flex: 1,
                                        minWidth: 0,
                                        fontSize: questionFontSize,
                                        lineHeight: questionLineHeight,
                                        color: '#0f172a',
                                        fontFamily: 'Arial, sans-serif',
                                        overflowWrap: 'anywhere',
                                    }}
                                >
                                    {question.question}
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <label
                                    style={{
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        letterSpacing: '0.08em',
                                        textTransform: 'uppercase',
                                        color: '#64748b',
                                    }}
                                >
                                    Choose heading
                                </label>

                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <button
                                        type="button"
                                        aria-label={`Heading for question ${question.number}`}
                                        aria-haspopup="dialog"
                                        aria-expanded={openQuestionNumber === question.number}
                                        disabled={disabled}
                                        onClick={() => setOpenQuestionNumber(question.number)}
                                        style={{
                                            flex: '1 1 240px',
                                            minHeight: '44px',
                                            padding: '0.75rem 0.875rem',
                                            borderRadius: '10px',
                                            border: `1px solid ${selectedHeading ? primaryBlue : '#cbd5e1'}`,
                                            background: '#ffffff',
                                            color: '#0f172a',
                                            fontSize: '15px',
                                            fontWeight: 500,
                                            outline: 'none',
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            justifyContent: 'space-between',
                                            gap: '0.75rem',
                                            textAlign: 'left',
                                            cursor: disabled ? 'default' : 'pointer',
                                        }}
                                    >
                                        <span
                                            style={{
                                                flex: 1,
                                                minWidth: 0,
                                                whiteSpace: 'normal',
                                                overflowWrap: 'anywhere',
                                                lineHeight: 1.4,
                                                color: selectedHeading ? '#0f172a' : '#64748b',
                                            }}
                                        >
                                            {selectedHeading ? selectedHeading.display : 'Select a heading'}
                                        </span>
                                        <span
                                            aria-hidden="true"
                                            style={{
                                                flexShrink: 0,
                                                padding: '0.1875rem 0.5rem',
                                                borderRadius: '999px',
                                                background: '#f1f5f9',
                                                color: '#475569',
                                                fontSize: '11px',
                                                fontWeight: 700,
                                                letterSpacing: '0.04em',
                                                textTransform: 'uppercase',
                                            }}
                                        >
                                            {selectedHeading ? 'Edit' : 'Choose'}
                                        </span>
                                    </button>

                                    {currentAnswer && (
                                        <button
                                            type="button"
                                            disabled={disabled}
                                            onClick={() => {
                                                onAnswerChange(question.number, '');
                                                setOpenQuestionNumber(null);
                                            }}
                                            style={{
                                                minHeight: '44px',
                                                padding: '0 0.875rem',
                                                borderRadius: '10px',
                                                border: '1px solid #cbd5e1',
                                                background: '#ffffff',
                                                color: '#475569',
                                                fontSize: '14px',
                                                fontWeight: 600,
                                                cursor: disabled ? 'default' : 'pointer',
                                            }}
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>
                            </div>

                        </article>
                    );
                })}
            </div>

            {activeQuestion && !disabled && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby={`mobile-matching-headings-title-${activeQuestion.number}`}
                    onClick={() => setOpenQuestionNumber(null)}
                    style={modalBackdropStyle}
                >
                    <div onClick={(event) => event.stopPropagation()} style={modalCardStyle}>
                        <div
                            style={{
                                padding: '1.25rem 1.25rem 1rem',
                                borderBottom: '1px solid #e2e8f0',
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    justifyContent: 'space-between',
                                    gap: '0.75rem',
                                }}
                            >
                                <div style={{ minWidth: 0 }}>
                                    <p
                                        style={{
                                            margin: 0,
                                            fontSize: '0.75rem',
                                            fontWeight: 700,
                                            letterSpacing: '0.08em',
                                            textTransform: 'uppercase',
                                            color: '#64748b',
                                        }}
                                    >
                                        Paragraph {activeQuestion.number}
                                    </p>
                                    <h2
                                        id={`mobile-matching-headings-title-${activeQuestion.number}`}
                                        style={{
                                            margin: '0.375rem 0 0',
                                            fontSize: '1rem',
                                            fontWeight: 700,
                                            color: '#0f172a',
                                        }}
                                    >
                                        Choose heading
                                    </h2>
                                </div>

                                <button
                                    type="button"
                                    aria-label="Close heading picker"
                                    onClick={() => setOpenQuestionNumber(null)}
                                    style={{
                                        flexShrink: 0,
                                        minHeight: '40px',
                                        padding: '0 0.875rem',
                                        borderRadius: '999px',
                                        border: '1px solid #cbd5e1',
                                        background: '#ffffff',
                                        color: '#475569',
                                        fontSize: '0.875rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Close
                                </button>
                            </div>

                            <div
                                style={{
                                    marginTop: '0.875rem',
                                    padding: '0.875rem 1rem',
                                    borderRadius: '0.875rem',
                                    background: '#f8fafc',
                                    border: '1px solid #e2e8f0',
                                    fontSize: questionFontSize,
                                    lineHeight: questionLineHeight,
                                    color: '#0f172a',
                                    overflowWrap: 'anywhere',
                                }}
                            >
                                {activeQuestion.question}
                            </div>
                        </div>

                        <div style={{ padding: '1rem 1.25rem 1.25rem' }}>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '0.75rem',
                                    marginBottom: '0.875rem',
                                }}
                            >
                                <div>
                                    <p
                                        style={{
                                            margin: 0,
                                            fontSize: '0.75rem',
                                            fontWeight: 700,
                                            letterSpacing: '0.08em',
                                            textTransform: 'uppercase',
                                            color: '#64748b',
                                        }}
                                    >
                                        {listTitle}
                                    </p>
                                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#475569' }}>
                                        Tap one heading to assign it to this paragraph.
                                    </p>
                                </div>

                                <span
                                    style={{
                                        flexShrink: 0,
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        color: '#475569',
                                        background: '#f8fafc',
                                        border: '1px solid #cbd5e1',
                                        borderRadius: '999px',
                                        padding: '0.25rem 0.625rem',
                                    }}
                                >
                                    {headingOptions.length} items
                                </span>
                            </div>

                            <div
                                role="listbox"
                                aria-label={`Heading options for question ${activeQuestion.number}`}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.5rem',
                                }}
                            >
                                {headingOptions.map((option) => {
                                    const isUsedElsewhere =
                                        selectedValues.includes(option.value) && activeAnswer !== option.value;
                                    const isSelected = activeAnswer === option.value;

                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            disabled={isUsedElsewhere}
                                            onClick={() => {
                                                onAnswerChange(activeQuestion.number, option.value);
                                                setOpenQuestionNumber(null);
                                            }}
                                            style={{
                                                width: '100%',
                                                padding: '0.875rem',
                                                borderRadius: '0.875rem',
                                                border: `1px solid ${isSelected ? primaryBlue : '#dbe4ea'}`,
                                                background: isSelected ? '#eff6ff' : '#ffffff',
                                                color: isUsedElsewhere ? '#94a3b8' : '#0f172a',
                                                cursor: isUsedElsewhere ? 'default' : 'pointer',
                                                display: 'flex',
                                                alignItems: 'flex-start',
                                                gap: '0.75rem',
                                                textAlign: 'left',
                                                opacity: isUsedElsewhere ? 0.6 : 1,
                                            }}
                                        >
                                            <span
                                                style={{
                                                    flexShrink: 0,
                                                    minWidth: '30px',
                                                    height: '30px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    borderRadius: '999px',
                                                    background: isSelected ? '#ffffff' : '#eff6ff',
                                                    color: primaryBlue,
                                                    fontSize: '12px',
                                                    fontWeight: 700,
                                                    textTransform: 'uppercase',
                                                }}
                                            >
                                                {option.value}
                                            </span>
                                            <span
                                                style={{
                                                    flex: 1,
                                                    minWidth: 0,
                                                    fontSize: '14px',
                                                    lineHeight: 1.45,
                                                    whiteSpace: 'normal',
                                                    overflowWrap: 'anywhere',
                                                }}
                                            >
                                                {option.text}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MobileMatchingHeadingsInput;
