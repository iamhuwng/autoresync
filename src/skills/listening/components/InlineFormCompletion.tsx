import React from 'react';
import { getReadingOptionLabel, getReadingOptionText, type ReadingOptionDisplayFormat } from '../../../utils/readingOptionDisplay';
import { listeningBlanks, listeningContextKey, listeningContextLineIndex, type ListeningQuestionContext } from '../utils/listeningQuestionContext';

interface Question {
  number: number;
  type: string;
  question: string;
  options?: string[];
  optionLabelFormat?: ReadingOptionDisplayFormat;
  answer: string | string[] | Record<string, string>;
  points: number;
  sectionNumber?: number;
  sectionId?: string;
  context?: ListeningQuestionContext;
}

interface InlineFormCompletionProps {
  questions: Question[];
  answers: Record<number, any>;
  onAnswerChange: (questionNumber: number, answer: any) => void;
  testSubmitted?: boolean;
  disabled?: boolean;
  questionResults?: Record<number, boolean>;
  currentQuestionNumber?: number;
}

const InlineInput: React.FC<{
  question: Question;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  isCorrect?: boolean;
  testSubmitted?: boolean;
  isActive?: boolean;
}> = ({ question, value, onChange, disabled, isCorrect, testSubmitted, isActive }) => {
  const borderColor = testSubmitted
    ? isCorrect === true ? '#10b981' : isCorrect === false ? '#ef4444' : '#d1d5db'
    : isActive ? '#3b82f6' : value ? '#6366f1' : '#d1d5db';
  const backgroundColor = testSubmitted
    ? isCorrect === true ? '#ecfdf5' : isCorrect === false ? '#fef2f2' : '#fff'
    : isActive ? '#eff6ff' : value ? '#f5f3ff' : '#fff';
  const style: React.CSSProperties = {
    width: 120, minWidth: 80, maxWidth: 200, padding: '4px 8px',
    border: '1px solid ' + borderColor, borderRadius: 4, fontSize: 14, fontFamily: 'inherit',
    backgroundColor, color: '#1f2937', textAlign: 'center',
    boxShadow: isActive ? '0 0 0 2px rgba(59, 130, 246, 0.2)' : 'none',
  };
  return (
    <span style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      {question.type === 'summary-completion-list' && question.options?.length ? (
        <select aria-label={'Answer ' + question.number} value={value || ''} disabled={disabled} style={style}
          onChange={event => onChange(event.target.value)}>
          <option value="">{question.number}</option>
          {question.options.map((option, index) => {
            const label = getReadingOptionLabel(option, index, question.optionLabelFormat);
            return <option key={index} value={label}>{label}. {getReadingOptionText(option)}</option>;
          })}
        </select>
      ) : (
        <input type="text" aria-label={'Answer ' + question.number} value={value || ''}
          onChange={event => onChange(event.target.value)} disabled={disabled}
          placeholder={String(question.number)} autoComplete="off" spellCheck={false} style={style} />
      )}
    </span>
  );
};

/** The native context is shared presentation; every answer still belongs to one question number. */
export const InlineFormCompletion: React.FC<InlineFormCompletionProps> = ({
  questions, answers, onAnswerChange, testSubmitted, disabled, questionResults, currentQuestionNumber,
}) => {
  const shownNumbers = new Set<number>();
  const shownContexts = new Set<string>();
  const input = (question: Question) => {
    shownNumbers.add(question.number);
    return <InlineInput key={'answer-' + question.number} question={question} value={answers[question.number] || ''}
      onChange={value => onAnswerChange(question.number, value)} disabled={Boolean(testSubmitted || disabled)}
      isCorrect={questionResults?.[question.number]} testSubmitted={testSubmitted}
      isActive={currentQuestionNumber === question.number} />;
  };
  const renderText = (text: string, members: Question[], fallback?: Question, lineIndex?: number) => {
    const blanks = listeningBlanks(text);
    const parts: React.ReactNode[] = [];
    let end = 0;
    for (const blank of blanks) {
      parts.push(<span key={'text-' + blank.index}>{text.slice(end, blank.index)}</span>);
      let question = blank.number === undefined ? fallback : members.find(member => member.number === blank.number);
      if (blank.number === undefined && !question && blanks.length === 1 && lineIndex !== undefined) {
        const indexed = members.filter(member => listeningContextLineIndex(member) === lineIndex);
        if (indexed.length === 1) question = indexed[0];
      }
      parts.push(question && !shownNumbers.has(question.number)
        ? input(question)
        : <span key={'blank-' + blank.index}>{blank.text}</span>);
      end = blank.index + blank.text.length;
    }
    parts.push(<span key="remaining">{text.slice(end)}</span>);
    if (lineIndex !== undefined && blanks.length === 0) {
      const indexed = members.filter(member => listeningContextLineIndex(member) === lineIndex);
      if (indexed.length === 1 && !shownNumbers.has(indexed[0]!.number)) parts.push(' ', input(indexed[0]!));
    }
    if (fallback && !shownNumbers.has(fallback.number)) parts.push(' ', input(fallback));
    return parts;
  };
  const row = (question: Question) => {
    const active = currentQuestionNumber === question.number;
    const correct = questionResults?.[question.number];
    return (
      <div key={question.number} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '10px 12px',
        marginBottom: 4, borderRadius: 6, backgroundColor: active ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
        borderLeft: active ? '3px solid #3b82f6' : '3px solid transparent' }}>
        <span style={{ fontWeight: 700, fontSize: 14, minWidth: 28,
          color: testSubmitted ? correct ? '#10b981' : '#ef4444' : active ? '#3b82f6' : '#6b7280' }}>{question.number}.</span>
        <div style={{ flex: 1, fontSize: 14, lineHeight: 1.8, color: '#374151' }}>
          {renderText(question.question, [question], question)}
        </div>
        {testSubmitted && <span style={{ fontSize: 14, marginLeft: 8 }}>{correct ? '✓' : '✗'}</span>}
      </div>
    );
  };
  return (
    <div style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '16px 20px' }}>
      {questions.map(question => {
        const key = listeningContextKey(question);
        if (!key) return row(question);
        if (shownContexts.has(key)) return null;
        shownContexts.add(key);
        const members = questions.filter(member => listeningContextKey(member) === key);
        const context = question.context!;
        return (
          <div key={'context-' + question.number} style={{ marginBottom: 16 }}>
            {context.sectionHeading && <h3 style={{ fontSize: 16, fontWeight: 700, color: '#1f2937',
              margin: '0 0 12px', paddingBottom: 8, borderBottom: '1px solid #e5e7eb' }}>{context.sectionHeading}</h3>}
            {context.subsectionLabel && <div style={{ fontSize: 14, fontWeight: 600, color: '#4b5563', marginBottom: 8 }}>
              {context.subsectionLabel}</div>}
            {context.contextLines!.map((line, index) => (
              <div key={index} style={{ fontSize: 14, lineHeight: 1.8, color: '#374151', padding: '2px 0',
                whiteSpace: 'pre-wrap', marginLeft: /^[-•]/u.test(line) ? 16 : 0 }}>
                {renderText(line, members, undefined, index)}
              </div>
            ))}
            {members.filter(member => !shownNumbers.has(member.number)).map(row)}
          </div>
        );
      })}
    </div>
  );
};

export default InlineFormCompletion;
