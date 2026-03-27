/**
 * Authentic IELTS Answer Input Components
 * Replicated from Inspera IELTS CBT design.
 */

import React, { useRef, useEffect } from 'react';
import { DragDropMatchingInput } from './DragDropMatchingInput';
import { MatchingInformationInput } from './MatchingInformationInput';
import type { ReadingSectionReference } from '../../types/document.types';
import {
  getReadingOptionDisplayText,
  getReadingQuestionOptions,
  getReadingOptionSelectionValue,
  splitReadingOptionLabel,
  type ReadingOptionDisplayFormat,
  type ReadingOptionDisplayValue,
} from '../../utils/readingOptionDisplay';

type QuestionOption = ReadingOptionDisplayValue;

interface Question {
  number: number;
  type: string;
  question: string;
  options?: QuestionOption[];
  labeledOptions?: QuestionOption[];
  sectionReferences?: ReadingSectionReference[];
  optionLabelFormat?: ReadingOptionDisplayFormat;
  answer: string | string[] | Record<string, string>;
  passageId: string;
  points: number;
  items?: Array<{ id: string; text: string }>;
  wordLimit?: number;
}

interface AuthenticAnswerInputProps {
  question: Question;
  answer: string | string[] | Record<string, string>;
  onChange: (answer: string | string[] | Record<string, string>) => void;
  disabled?: boolean;
  usedAnswers?: string[];
  showReferencePanel?: boolean;
  skill?: string;
}

const primaryBlue = 'rgb(65, 142, 200)';
const buildFallbackLetterLabel = (index: number): string => String.fromCharCode(65 + index);

const getOptionDisplayText = (
  option: QuestionOption,
  index: number,
  format: ReadingOptionDisplayFormat = 'letter',
): string => {
  return getReadingOptionDisplayText(option, index, format);
};

const getOptionSelectionValue = (
  option: QuestionOption,
  index: number,
  preferLabelValue: boolean,
  format: ReadingOptionDisplayFormat = 'letter',
): string => {
  return getReadingOptionSelectionValue(option, index, format, preferLabelValue);
};

const getSummaryListSelectionValue = (option: QuestionOption, index: number): string => {
  const split = splitReadingOptionLabel(option);
  return split.label || buildFallbackLetterLabel(index);
};

const renderOptionLabel = (option: QuestionOption, index: number): React.ReactNode => {
  const split = splitReadingOptionLabel(option);
  if (split.label) {
    return split.text ? `${split.label}. ${split.text}` : split.label;
  }

  return <><strong style={{ color: primaryBlue }}>{buildFallbackLetterLabel(index)}</strong>  {split.text}</>;
};

const getQuestionOptions = (question: Question): QuestionOption[] => (
  getReadingQuestionOptions(question)
);

/**
 * Derive the maximum allowed word count from the IELTS question type.
 * Each type has a standard word-limit instruction; this encodes those.
 */
const getMaxWordsForType = (type: string, manualLimit?: number): number => {
  if (manualLimit !== undefined && manualLimit > 0) return manualLimit;
  switch (type) {
    case 'sentence-completion':
    case 'diagram-labeling':
      return 1; // ONE WORD ONLY
    case 'summary-completion-text':
    case 'note-completion':
    case 'table-completion':
    case 'flowchart-completion':
    case 'completion':
      return 2; // NO MORE THAN TWO WORDS
    case 'short-answer':
      return 3; // NO MORE THAN THREE WORDS AND/OR A NUMBER
    default:
      return 3; // Safe default
  }
};


/**
 * Clean instruction prefixes from question text
 * These prefixes are already shown in the section header, so we strip them from individual questions
 */
const cleanQuestionText = (text: string): string => {
  if (!text) return '';

  // Common instruction prefixes to remove (these are shown in the header)
  const instructionPrefixes = [
    /^Choose (ONE WORD ONLY|NO MORE THAN (ONE|TWO|THREE) WORDS?( AND\/OR A NUMBER)?|ONE WORD AND\/OR A NUMBER) from the passage( for (each|the) answer)?:\s*/i,
    /^Write the correct letter,?\s*(A[\s–-]+[A-Z])?\s*\.?\s*/i,
    /^Choose the correct (letter|option|answer),?\s*(A[\s,–-]+B[\s,–-]+C[\s,–-]+D?)?\s*\.?\s*/i,
    /^Write:\s*(TRUE|FALSE|NOT GIVEN|YES|NO)\s+if.*/i,
    /^Select (ONE|TWO|THREE) (letters?|options?|answers?) from the list\.?\s*/i,
    /^Answer the questions? below\.?\s*/i,
    /^Complete the (sentences?|summary|notes?|table|flow-?chart|diagram) below\.?\s*/i,
  ];

  let cleaned = text;
  for (const prefix of instructionPrefixes) {
    cleaned = cleaned.replace(prefix, '');
  }

  return cleaned.trim();
};

/**
 * True/False/Not Given - Horizontal bordered cells with color-coded selection
 * Per IELTS design doc: radio buttons in horizontal layout with visual feedback
 */
const TrueFalseInput: React.FC<AuthenticAnswerInputProps> = ({
  question,
  onChange,
  answer,
  disabled = false
}) => {
  const selected = answer as string || '';
  const options: Array<{ label: string; color: string; bgSelected: string; borderSelected: string }> = [
    { label: 'TRUE', color: '#16a34a', bgSelected: '#f0fdf4', borderSelected: '#86efac' },
    { label: 'FALSE', color: '#dc2626', bgSelected: '#fef2f2', borderSelected: '#fca5a5' },
    { label: 'NOT GIVEN', color: '#6b7280', bgSelected: '#f3f4f6', borderSelected: '#d1d5db' },
  ];

  return (
    <div style={{ display: 'flex', gap: '0', padding: '0.25rem 0' }}>
      {options.map((option, index) => {
        const isSelected = selected === option.label;
        return (
          <label
            key={option.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              border: `1px solid ${isSelected ? option.borderSelected : '#d1d5db'}`,
              borderRight: index < options.length - 1 ? 'none' : `1px solid ${isSelected ? option.borderSelected : '#d1d5db'}`,
              borderRadius: index === 0 ? '4px 0 0 4px' : index === options.length - 1 ? '0 4px 4px 0' : '0',
              background: isSelected ? option.bgSelected : '#ffffff',
              cursor: disabled ? 'default' : 'pointer',
              transition: 'all 0.15s ease',
              minWidth: '100px',
              userSelect: 'none' as const,
            }}
          >
            <input
              type="radio"
              name={`q-${question.number}`}
              value={option.label}
              checked={isSelected}
              onChange={(e) => !disabled && onChange(e.target.value)}
              disabled={disabled}
              style={{ width: '14px', height: '14px', accentColor: isSelected ? option.color : primaryBlue, cursor: 'pointer' }}
            />
            <span style={{
              fontSize: '14px',
              fontWeight: isSelected ? 700 : 500,
              color: isSelected ? option.color : '#374151',
              fontFamily: 'Arial, sans-serif',
              whiteSpace: 'nowrap',
            }}>
              {option.label}
            </span>
          </label>
        );
      })}
    </div>
  );
};

/**
 * Yes/No/Not Given - Horizontal bordered cells with color-coded selection
 * Per IELTS design doc: identical structure to T/F/NG but different labels
 */
const YesNoInput: React.FC<AuthenticAnswerInputProps> = ({
  question,
  onChange,
  answer,
  disabled = false
}) => {
  const selected = answer as string || '';
  const options: Array<{ label: string; color: string; bgSelected: string; borderSelected: string }> = [
    { label: 'YES', color: '#16a34a', bgSelected: '#f0fdf4', borderSelected: '#86efac' },
    { label: 'NO', color: '#dc2626', bgSelected: '#fef2f2', borderSelected: '#fca5a5' },
    { label: 'NOT GIVEN', color: '#6b7280', bgSelected: '#f3f4f6', borderSelected: '#d1d5db' },
  ];

  return (
    <div style={{ display: 'flex', gap: '0', padding: '0.25rem 0' }}>
      {options.map((option, index) => {
        const isSelected = selected === option.label;
        return (
          <label
            key={option.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              border: `1px solid ${isSelected ? option.borderSelected : '#d1d5db'}`,
              borderRight: index < options.length - 1 ? 'none' : `1px solid ${isSelected ? option.borderSelected : '#d1d5db'}`,
              borderRadius: index === 0 ? '4px 0 0 4px' : index === options.length - 1 ? '0 4px 4px 0' : '0',
              background: isSelected ? option.bgSelected : '#ffffff',
              cursor: disabled ? 'default' : 'pointer',
              transition: 'all 0.15s ease',
              minWidth: '100px',
              userSelect: 'none' as const,
            }}
          >
            <input
              type="radio"
              name={`q-${question.number}`}
              value={option.label}
              checked={isSelected}
              onChange={(e) => !disabled && onChange(e.target.value)}
              disabled={disabled}
              style={{ width: '14px', height: '14px', accentColor: isSelected ? option.color : primaryBlue, cursor: 'pointer' }}
            />
            <span style={{
              fontSize: '14px',
              fontWeight: isSelected ? 700 : 500,
              color: isSelected ? option.color : '#374151',
              fontFamily: 'Arial, sans-serif',
              whiteSpace: 'nowrap',
            }}>
              {option.label}
            </span>
          </label>
        );
      })}
    </div>
  );
};

/**
 * Multiple Choice - Bordered card options with selected highlight
 * Per IELTS design doc: options in bordered cards for clear separation
 */
const MultipleChoiceInput: React.FC<AuthenticAnswerInputProps> = ({
  question,
  onChange,
  answer,
  disabled = false,
}) => {
  const selected = answer as string || '';
  const options = getQuestionOptions(question);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0', padding: '0.25rem 0' }}>
      {options.map((option, index) => {
        const optionValue = getOptionSelectionValue(option, index, true, question.optionLabelFormat);
        const isSelected = selected === optionValue;
        const isLast = index === options.length - 1;
        return (
          <label
            key={index}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              padding: '0.625rem 0.875rem',
              border: `1px solid ${isSelected ? primaryBlue : '#d1d5db'}`,
              borderBottom: isLast ? `1px solid ${isSelected ? primaryBlue : '#d1d5db'}` : 'none',
              borderRadius: index === 0 ? '4px 4px 0 0' : isLast ? '0 0 4px 4px' : '0',
              background: isSelected ? 'rgba(65, 142, 200, 0.06)' : '#ffffff',
              cursor: disabled ? 'default' : 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <input
              type="radio"
              name={`q-${question.number}`}
              value={optionValue}
              checked={isSelected}
              onChange={(e) => !disabled && onChange(e.target.value)}
              disabled={disabled}
              style={{ width: '14px', height: '14px', marginTop: '3px', accentColor: primaryBlue, cursor: 'pointer', flexShrink: 0 }}
            />
            <span style={{
              fontSize: '15px',
              color: isSelected ? '#1e3a5f' : '#000000',
              lineHeight: 1.5,
              fontFamily: 'Arial, sans-serif',
              fontWeight: isSelected ? 600 : 400,
            }}>
              {renderOptionLabel(option, index)}
            </span>
          </label>
        );
      })}
    </div>
  );
};

/**
 * Multiple Select - Bordered card options with selection counter
 * Per IELTS design doc: checkbox list in bordered cards with exact count warning
 */
const MultipleSelectInput: React.FC<AuthenticAnswerInputProps> = ({
  question,
  onChange,
  answer,
  disabled = false,
}) => {
  const selected = Array.isArray(answer) ? answer : (answer ? [answer as string] : []);
  // Determine required count from instructions (default 2 for IELTS)
  const requiredCount = 2;
  const options = getQuestionOptions(question);

  const handleToggle = (optionValue: string) => {
    const newSelected = selected.includes(optionValue)
      ? selected.filter(i => i !== optionValue)
      : [...selected, optionValue];
    onChange(newSelected);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0', padding: '0.25rem 0' }}>
      {options.map((option, index) => {
        const optionValue = getOptionSelectionValue(option, index, true, question.optionLabelFormat);
        const isChecked = selected.includes(optionValue);
        const isLast = index === options.length - 1;
        return (
          <label
            key={index}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              padding: '0.625rem 0.875rem',
              border: `1px solid ${isChecked ? primaryBlue : '#d1d5db'}`,
              borderBottom: isLast ? `1px solid ${isChecked ? primaryBlue : '#d1d5db'}` : 'none',
              borderRadius: index === 0 ? '4px 4px 0 0' : isLast ? '0 0 4px 4px' : '0',
              background: isChecked ? 'rgba(65, 142, 200, 0.06)' : '#ffffff',
              cursor: disabled ? 'default' : 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => !disabled && handleToggle(optionValue)}
              disabled={disabled}
              style={{ width: '14px', height: '14px', marginTop: '3px', accentColor: primaryBlue, cursor: 'pointer', flexShrink: 0 }}
            />
            <span style={{
              fontSize: '15px',
              color: isChecked ? '#1e3a5f' : '#000000',
              lineHeight: 1.5,
              fontFamily: 'Arial, sans-serif',
              fontWeight: isChecked ? 600 : 400,
            }}>
              {renderOptionLabel(option, index)}
            </span>
          </label>
        );
      })}
      {/* Selection counter with visual feedback */}
      <div style={{
        marginTop: '0.5rem',
        padding: '0.375rem 0.75rem',
        fontSize: '13px',
        fontWeight: 600,
        color: selected.length === requiredCount ? '#16a34a' : selected.length > requiredCount ? '#dc2626' : '#64748b',
        background: selected.length === requiredCount ? '#f0fdf4' : selected.length > requiredCount ? '#fef2f2' : '#f8fafc',
        border: `1px solid ${selected.length === requiredCount ? '#bbf7d0' : selected.length > requiredCount ? '#fecaca' : '#e2e8f0'}`,
        borderRadius: '4px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.375rem',
        alignSelf: 'flex-start',
      }}>
        Selected: {selected.length}/{requiredCount}
        {selected.length === requiredCount && ' ✓'}
        {selected.length > requiredCount && ' (too many)'}
      </div>
    </div>
  );
};

/**
 * Dropdown Matching
 */
const DropdownMatchingInput: React.FC<AuthenticAnswerInputProps> = ({
  question,
  onChange,
  answer,
  disabled = false,
}) => {
  const matches = typeof answer === 'object' && !Array.isArray(answer) ? answer : {};
  const options = getQuestionOptions(question);

  const handleMatch = (itemId: string, optId: string) => {
    onChange({ ...matches, [itemId]: optId });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', padding: '0.5rem 0' }}>
      {question.items?.map(item => (
        <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <div style={{ flex: 1, fontSize: '16px', color: '#000000' }}>{item.text}</div>
          <select
            value={matches[item.id] || ''}
            onChange={(e) => !disabled && handleMatch(item.id, e.target.value)}
            disabled={disabled}
            style={{
              minWidth: '150px',
              padding: '4px 8px',
              border: '1px solid rgb(83, 83, 83)',
              borderRadius: '3px',
              fontSize: '15px'
            }}
          >
            <option value="">Select...</option>
            {options.map((opt, i) => {
              const value = getOptionSelectionValue(opt, i, true, question.optionLabelFormat);
              return (
                <option key={i} value={value}>{getOptionDisplayText(opt, i, question.optionLabelFormat)}</option>
              );
            })}
          </select>
        </div>
      ))}
    </div>
  );
};

/**
 * Inline Completion (Box style)
 * Per IELTS design doc: input with word limit reminder
 */
const InlineCompletionInput: React.FC<AuthenticAnswerInputProps> = ({
  question,
  onChange,
  answer,
  disabled = false
}) => {
  const val = answer as string || '';
  const inputRef = useRef<HTMLInputElement>(null);
  const wordCount = val.trim() ? val.trim().split(/\s+/).length : 0;
  const maxWords = getMaxWordsForType(question.type, question.wordLimit);

  useEffect(() => {
    if (inputRef.current) {
      const width = Math.max(120, val.length * 9 + 20);
      inputRef.current.style.width = `${width}px`;
    }
  }, [val]);

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', verticalAlign: 'middle', padding: '2px 0' }}>
      <input
        ref={inputRef}
        type="text"
        value={val}
        onChange={(e) => !disabled && onChange(e.target.value)}
        disabled={disabled}
        autoComplete="off"
        style={{
          border: '1px solid rgb(83, 83, 83)',
          borderRadius: '3px',
          padding: '0 8px',
          fontSize: '15px',
          height: '24px',
          boxSizing: 'border-box',
          outline: 'none',
          transition: 'border-color 0.2s, box-shadow 0.2s'
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = primaryBlue;
          e.currentTarget.style.boxShadow = `0 0 0 1px ${primaryBlue}`;
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'rgb(83, 83, 83)';
          e.currentTarget.style.boxShadow = 'none';
        }}
      />
      {val && (
        <span style={{
          fontSize: '11px',
          color: wordCount > maxWords ? '#dc2626' : '#94a3b8',
          marginTop: '2px',
          fontStyle: 'italic',
        }}>
          {wordCount}/{maxWords} words{wordCount > maxWords ? ' ⚠' : ''}
        </span>
      )}
    </div>
  );
};

/**
 * Short Answer Input
 */
const ShortAnswerInput: React.FC<AuthenticAnswerInputProps> = ({
  question,
  onChange,
  answer,
  disabled = false
}) => {
  const val = answer as string || '';
  // Count words for the live word counter
  const wordCount = val.trim() ? val.trim().split(/\s+/).length : 0;
  const maxWords = getMaxWordsForType(question.type, question.wordLimit);

  return (
    <div style={{ padding: '0.5rem 0' }}>
      <input
        type="text"
        value={val}
        onChange={(e) => !disabled && onChange(e.target.value)}
        disabled={disabled}
        style={{
          width: '100%',
          maxWidth: '400px',
          border: '1px solid rgb(83, 83, 83)',
          borderRadius: '3px',
          padding: '8px 12px',
          fontSize: '16px',
          outline: 'none'
        }}
        onFocus={(e) => e.currentTarget.style.borderColor = primaryBlue}
        onBlur={(e) => e.currentTarget.style.borderColor = 'rgb(83, 83, 83)'}
      />
      {/* Word limit indicator per IELTS design doc */}
      <div style={{
        marginTop: '4px',
        fontSize: '12px',
        color: wordCount > maxWords ? '#dc2626' : '#94a3b8',
        fontStyle: 'italic',
      }}>
        {wordCount}/{maxWords} words
        {wordCount > maxWords && ' (exceeds limit)'}
      </div>
    </div>
  );
};

/**
 * Inline Context Completion (Inspera style: embedded in text)
 */
const InlineContextCompletionInput: React.FC<AuthenticAnswerInputProps> = ({
  question,
  onChange,
  answer,
  disabled = false
}) => {
  // Clean the question text first to remove instruction prefixes
  const cleanedText = cleanQuestionText(question.question);

  // Split text by blank placeholder (one or more underscores)
  const parts = cleanedText.split(/_{3,}/);
  const blankCount = parts.length - 1;

  // If no underscores found, fallback to standard layout
  if (blankCount < 1) {
    return <InlineCompletionInput question={question} onChange={onChange} answer={answer} disabled={disabled} />;
  }

  // ── Multi-blank support ──
  // For questions with N blanks, we store the combined answer as pipe-delimited: "word1|word2"
  // For single-blank questions, we store as a plain string (backward compatible)
  const rawVal = answer as string || '';
  const answerParts = blankCount > 1 ? rawVal.split('|') : [rawVal];
  // Pad array to match blank count
  while (answerParts.length < blankCount) answerParts.push('');

  const maxWords = getMaxWordsForType(question.type, question.wordLimit);

  const handleBlankChange = (blankIdx: number, newValue: string) => {
    if (blankCount === 1) {
      // Single blank — store as plain string (backward compatible)
      onChange(newValue);
    } else {
      // Multi-blank — store as pipe-delimited
      const updated = [...answerParts];
      updated[blankIdx] = newValue;
      onChange(updated.join('|'));
    }
  };

  return (
    <div style={{
      fontSize: '16px',
      color: '#000000',
      lineHeight: 1.8,
      fontFamily: 'Arial, sans-serif'
    }}>
      {parts.map((part, idx) => (
        <React.Fragment key={idx}>
          <span>{part}</span>
          {idx < blankCount && (() => {
            const blankVal = answerParts[idx] || '';
            const wordCount = blankVal.trim() ? blankVal.trim().split(/\s+/).length : 0;
            // Dynamic width based on content
            const inputWidth = Math.max(80, blankVal.length * 9 + 30);
            return (
              <span style={{
                display: 'inline-flex',
                flexDirection: 'column',
                verticalAlign: 'middle',
                margin: '0 4px',
                position: 'relative',
              }}>
                <span style={{ display: 'inline-flex', position: 'relative' }}>
                  <input
                    type="text"
                    value={blankVal}
                    onChange={(e) => !disabled && handleBlankChange(idx, e.target.value)}
                    disabled={disabled}
                    autoComplete="off"
                    style={{
                      border: `1px solid ${blankVal ? primaryBlue : 'rgb(83, 83, 83)'}`,
                      borderRadius: '3px',
                      padding: '0 8px 0 24px',
                      fontSize: '15px',
                      height: '24px',
                      width: `${inputWidth}px`,
                      boxSizing: 'border-box',
                      outline: 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                      fontWeight: 500,
                      color: primaryBlue,
                      background: blankVal ? 'rgba(65, 142, 200, 0.05)' : 'white',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = primaryBlue;
                      e.currentTarget.style.boxShadow = `0 0 0 1px ${primaryBlue}`;
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = blankVal ? primaryBlue : 'rgb(83, 83, 83)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                  <span style={{
                    position: 'absolute',
                    left: '6px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#666666',
                    pointerEvents: 'none'
                  }}>
                    {question.number}{blankCount > 1 ? String.fromCharCode(97 + idx) : ''}
                  </span>
                </span>
                {blankVal && wordCount > maxWords && (
                  <span style={{
                    fontSize: '10px',
                    color: '#dc2626',
                    marginTop: '1px',
                    fontStyle: 'italic',
                    whiteSpace: 'nowrap',
                  }}>
                    {wordCount}/{maxWords} ⚠
                  </span>
                )}
              </span>
            );
          })()}
        </React.Fragment>
      ))}
    </div>
  );
};

/**
 * Summary Completion from List - Dropdown with visible options reference
 * Per IELTS design doc: Dropdown select with option list displayed prominently
 * Smart dropdown: options currently selected by THIS question are kept, but the component
 * only knows its own selection. Group-level dedup is handled by passing usedAnswers.
 */
const SummaryCompletionListInput: React.FC<AuthenticAnswerInputProps & { usedAnswers?: string[]; showReferencePanel?: boolean }> = ({
  question,
  onChange,
  answer,
  disabled = false,
  usedAnswers = [],
  showReferencePanel = true,
}) => {
  const val = answer as string || '';
  const options = getQuestionOptions(question);
  const cleanedText = cleanQuestionText(question.question);
  const parts = cleanedText.split(/_{3,}/);
  const hasInlineBlanks = parts.length >= 2;

  // Smart dropdown: filter out options used by OTHER questions (not this one)
  const isOptionAvailable = (letter: string) => {
    if (letter === val) return true; // Keep our own selection visible
    return !usedAnswers.includes(letter);
  };

  const renderDropdown = (inline: boolean) => (
    <select
      value={val}
      onChange={(e) => !disabled && onChange(e.target.value)}
      disabled={disabled}
      style={inline ? {
        margin: '0 6px',
        padding: '2px 8px',
        border: `1px solid ${val ? primaryBlue : 'rgb(83, 83, 83)'}`,
        borderRadius: '3px',
        fontSize: '15px',
        height: '26px',
        minWidth: '140px',
        outline: 'none',
        background: val ? 'rgba(65, 142, 200, 0.05)' : 'white',
        cursor: disabled ? 'default' : 'pointer',
      } : {
        padding: '6px 10px',
        border: '1px solid rgb(83, 83, 83)',
        borderRadius: '3px',
        fontSize: '15px',
        maxWidth: '400px',
        outline: 'none',
      }}
    >
      <option value="">Select...</option>
            {options.map((opt, i) => {
              const letter = getSummaryListSelectionValue(opt, i);
              const available = isOptionAvailable(letter);
              return (
          <option
            key={i}
            value={letter}
            disabled={!available}
            style={{ color: available ? '#000' : '#94a3b8' }}
          >
            {getOptionDisplayText(opt, i)}{!available ? ' (used)' : ''}
          </option>
        );
      })}
    </select>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Inline text with dropdown if blanks exist */}
      {hasInlineBlanks ? (
        <div style={{
          fontSize: '16px',
          color: '#000000',
          lineHeight: 1.6,
          fontFamily: 'Arial, sans-serif',
        }}>
          {parts[0]}
          {renderDropdown(true)}
          {parts.slice(1).join(' ')}
        </div>
      ) : (
        renderDropdown(false)
      )}

      {/* Visible options reference panel per IELTS design doc */}
      {showReferencePanel && options.length > 0 && (
        <div style={{
          background: '#f8fafc',
          border: '1px solid #d1d5db',
          borderRadius: '3px',
          padding: '0.75rem 1rem',
        }}>
          <div style={{
            fontSize: '13px',
            fontWeight: 700,
            color: '#374151',
            marginBottom: '0.5rem',
            borderBottom: '1px solid #e5e7eb',
            paddingBottom: '0.375rem',
          }}>
            List of Phrases
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '0.375rem 1.5rem',
          }}>
            {options.map((opt, i) => {
              const displayLabel = renderOptionLabel(opt, i);
              const letter = getSummaryListSelectionValue(opt, i);
              const isUsed = usedAnswers.includes(letter);
              return (
                <div key={i} style={{
                  fontSize: '14px',
                  color: isUsed ? '#94a3b8' : '#000000',
                  textDecoration: isUsed ? 'line-through' : 'none',
                  lineHeight: 1.5,
                  fontFamily: 'Arial, sans-serif',
                }}>
                  {displayLabel}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export const AuthenticAnswerInput: React.FC<AuthenticAnswerInputProps> = (props) => {
  const { question } = props;
  const questionOptions = getQuestionOptions(question);
  switch (question.type) {
    case 'true-false-not-given': return <TrueFalseInput {...props} />;
    case 'yes-no-not-given': return <YesNoInput {...props} />;
    case 'multiple-choice': return <MultipleChoiceInput {...props} />;
    case 'multiple-select': return <MultipleSelectInput {...props} />;
    case 'matching-information':
      return (
        <MatchingInformationInput
          questions={[question]}
          answers={{ [question.number]: props.answer as string }}
          onAnswerChange={(_num, ans) => props.onChange(ans)}
          disabled={props.disabled}
        />
      );
    case 'matching':
    case 'matching-headings':
    case 'matching-features':
    case 'matching-sentence-endings':
      // ── DIAGNOSTIC: Log matching type routing ──
      if (question.type === 'matching-headings') {
        console.log(`🔀 [AuthenticAnswerInput] matching-headings Q${question.number}:`, {
          hasItems: !!(question.items && question.items.length > 0),
          itemsCount: (question.items || []).length,
          hasOptions: questionOptions.length > 0,
          optionsCount: questionOptions.length,
          willUseDragDrop: !!(question.items && question.items.length > 0 && questionOptions.length > 0),
          question: question.question.substring(0, 60),
          answer: props.answer,
        });
      }
      // Use DragDropMatchingInput for matching types if items and options are available
      if (question.items && question.items.length > 0 && questionOptions.length > 0) {
        return <DragDropMatchingInput
          questions={[{ ...question, options: question.options, labeledOptions: question.labeledOptions }]}
          answers={{ [question.number]: props.answer as string }}
          onAnswerChange={(_num, ans) => props.onChange(ans)}
          disabled={props.disabled}
          labelType={(question.optionLabelFormat || (question.type === 'matching-headings' ? 'roman' : 'letter')) === 'roman' ? 'roman' : 'letter'}
        />;
      }
      return <DropdownMatchingInput {...props} />;
    case 'short-answer': return <ShortAnswerInput {...props} />;
    case 'completion':
    case 'sentence-completion':
    case 'summary-completion-text':
      // If the question text contains underscores, use the inline context renderer
      if (question.question.includes('___')) {
        return <InlineContextCompletionInput {...props} />;
      }
      return <InlineCompletionInput {...props} />;
    case 'summary-completion-list':
      // Dedicated component with dropdown + visible options panel per IELTS design doc
      return <SummaryCompletionListInput {...props} usedAnswers={props.usedAnswers} showReferencePanel={props.showReferencePanel} />;
    case 'note-completion':
    case 'table-completion':
    case 'flowchart-completion':
    case 'diagram-labeling':
      // If the question text contains underscores, use the inline context renderer
      if (question.question.includes('___')) {
        return <InlineContextCompletionInput {...props} />;
      }
      return <InlineCompletionInput {...props} />;
    default: return <ShortAnswerInput {...props} />;
  }
};

