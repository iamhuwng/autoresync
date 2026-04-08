import React from 'react';
import type { ReadingSectionReference } from '../../types/document.types';
import {
    buildFallbackReadingLabel,
    getReadingQuestionOptions,
    splitReadingOptionLabel,
    type ReadingOptionDisplayFormat,
    type ReadingOptionDisplayValue,
} from '../../utils/readingOptionDisplay';

interface Question {
    number: number;
    type: string;
    question: string;
    options?: ReadingOptionDisplayValue[];
    labeledOptions?: ReadingOptionDisplayValue[];
    sectionReferences?: ReadingSectionReference[];
    optionLabelFormat?: ReadingOptionDisplayFormat;
    answer: string | string[] | Record<string, string>;
    passageId: string;
    items?: Array<{ id: string; text: string }>;
}

interface MatchingInformationInputProps {
    questions: Question[];
    answers: Record<number, string>;
    onAnswerChange: (questionNumber: number, answer: string) => void;
    onQuestionRefChange?: (questionNumber: number, element: HTMLDivElement | null) => void;
    disabled?: boolean;
    fontSize?: number;
    lineSpacing?: number;
}

interface ResolvedSectionReference {
    label: string;
    title?: string;
    paragraph?: string;
}

const primaryBlue = 'rgb(65, 142, 200)';

const getSectionReferences = (question?: Question): ResolvedSectionReference[] => {
    if (question?.sectionReferences && question.sectionReferences.length > 0) {
        return question.sectionReferences.map((section, index) => ({
            label: section.label?.trim() || buildFallbackReadingLabel(index, question.optionLabelFormat || 'letter'),
            title: section.title?.trim() || undefined,
            paragraph: section.paragraph?.trim() || undefined,
        }));
    }

    return getReadingQuestionOptions(question).map((option, index) => {
        const split = splitReadingOptionLabel(option);
        return {
            label: split.label || buildFallbackReadingLabel(index, question?.optionLabelFormat || 'letter'),
            title: split.text || undefined,
        };
    });
};

const getSectionDisplayText = (section: ResolvedSectionReference): string =>
    section.title ? `${section.label}. ${section.title}` : section.label;

export const MatchingInformationInput: React.FC<MatchingInformationInputProps> = ({
    questions,
    answers,
    onAnswerChange,
    onQuestionRefChange,
    disabled = false,
    fontSize,
    lineSpacing,
}) => {
    const sectionReferences = getSectionReferences(questions[0]);
    const questionFontSize = fontSize ? `${fontSize}px` : '16px';
    const questionLineHeight = lineSpacing ?? 1.5;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div
                style={{
                    background: '#f8fafc',
                    border: '1px solid #d1d5db',
                    borderRadius: '2px',
                    padding: '1.25rem',
                }}
            >
                <div
                    style={{
                        fontSize: '16px',
                        fontWeight: 700,
                        marginBottom: '1rem',
                        color: '#000',
                        fontFamily: 'Arial, sans-serif',
                    }}
                >
                    List of Options
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {sectionReferences.map((section, index) => (
                        <div
                            key={`${section.label}-${index}`}
                            style={{
                                display: 'flex',
                                gap: section.title || section.paragraph ? '0.75rem' : '0',
                                padding: '0.5rem 0',
                                fontSize: '15px',
                                color: '#334155',
                                fontFamily: 'Arial, sans-serif',
                                alignItems: 'flex-start',
                            }}
                        >
                            <div
                                style={{
                                    fontWeight: 700,
                                    minWidth: '24px',
                                    color: '#000',
                                }}
                            >
                                {section.label}
                            </div>
                            {(section.title || section.paragraph) && (
                                <div style={{ flex: 1 }}>
                                    {section.title && (
                                        <div style={{ color: '#334155' }}>{section.title}</div>
                                    )}
                                    {section.paragraph && (
                                        <div style={{ color: '#64748b', fontSize: '13px', marginTop: '0.125rem' }}>
                                            {section.paragraph}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
                {questions.map((question) => {
                    const currentAnswer = answers[question.number] || '';

                    return (
                        <div
                            key={question.number}
                            ref={(element) => {
                                onQuestionRefChange?.(question.number, element);
                            }}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.5rem',
                                padding: '0.875rem 0',
                                borderBottom: '1px solid #f1f5f9',
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '0.75rem',
                                }}
                            >
                                <div
                                    style={{
                                        minWidth: '24px',
                                        fontWeight: 700,
                                        fontSize: '15px',
                                        color: '#333',
                                    }}
                                >
                                    {question.number}
                                </div>

                                <div
                                    style={{
                                        flex: 1,
                                        fontSize: questionFontSize,
                                        color: '#000',
                                        fontFamily: 'Arial, sans-serif',
                                        lineHeight: questionLineHeight,
                                    }}
                                >
                                    {question.question}
                                </div>
                            </div>

                            <div
                                style={{
                                    display: 'flex',
                                    gap: '0',
                                    marginLeft: '36px',
                                    flexWrap: 'wrap',
                                }}
                            >
                                {sectionReferences.map((section, index) => {
                                    const label = section.label || buildFallbackReadingLabel(index, 'letter');
                                    const isSelected = currentAnswer === label;
                                    const isLast = index === sectionReferences.length - 1;
                                    return (
                                        <button
                                            key={label}
                                            onClick={() => {
                                                if (disabled) return;
                                                onAnswerChange(question.number, isSelected ? '' : label);
                                            }}
                                            disabled={disabled}
                                            title={getSectionDisplayText(section)}
                                            style={{
                                                width: '44px',
                                                height: '36px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                border: `1px solid ${isSelected ? primaryBlue : '#d1d5db'}`,
                                                borderRight: isLast ? `1px solid ${isSelected ? primaryBlue : '#d1d5db'}` : 'none',
                                                borderRadius: index === 0 ? '4px 0 0 4px' : isLast ? '0 4px 4px 0' : '0',
                                                background: isSelected ? primaryBlue : '#ffffff',
                                                color: isSelected ? '#ffffff' : '#374151',
                                                fontSize: '15px',
                                                fontWeight: 700,
                                                cursor: disabled ? 'default' : 'pointer',
                                                transition: 'all 0.15s ease',
                                                fontFamily: 'Arial, sans-serif',
                                                outline: 'none',
                                                padding: 0,
                                                marginBottom: '0.375rem',
                                            }}
                                        >
                                            {label}
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

export default MatchingInformationInput;
