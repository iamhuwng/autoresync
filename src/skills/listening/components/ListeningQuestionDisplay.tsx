/**
 * ListeningQuestionDisplay Component
 * Enhanced IELTS Listening question display with authentic formatting
 * 
 * Handles:
 * - Note/Form Completion with context display
 * - Matching questions with options box
 * - Map/Diagram labelling with images
 * - Multiple choice/select with proper layout
 * - Sentence completion with inline blanks
 */

import React from 'react';
import { AuthenticAnswerInput } from '../../../components/test/AuthenticAnswerInput';
import { InlineFormCompletion } from './InlineFormCompletion';

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

interface QuestionGroup {
  type: string;
  startNumber: number;
  endNumber: number;
  questions: Question[];
  instructions: string;
}

interface ListeningQuestionDisplayProps {
  group: QuestionGroup;
  answers: Record<number, any>;
  onAnswerChange: (questionNumber: number, answer: any) => void;
  currentQuestionNumber: number;
  testSubmitted?: boolean;
  questionResults?: Record<number, boolean>;
}

/**
 * Check if question type should use inline form completion format
 */
const isCompletionType = (type: string): boolean => {
  const completionTypes = [
    'completion',
    'note-completion',
    'form-completion',
    'table-completion',
    'sentence-completion',
    'summary-completion',
    'short-answer',
  ];
  return completionTypes.includes(type);
};

/**
 * Options Box Component - Shows matching options in a styled box
 */
const OptionsBox: React.FC<{ options: string[]; title?: string }> = ({ options, title = 'Options' }) => {
  return (
    <div style={{
      background: '#f8fafc',
      border: '2px solid #cbd5e1',
      borderRadius: '8px',
      padding: '16px 20px',
      marginBottom: '20px',
    }}>
      <div style={{
        fontWeight: 700,
        fontSize: '14px',
        color: '#1e293b',
        marginBottom: '12px',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}>
        {title}
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '8px',
      }}>
        {options.map((option, index) => {
          const letter = String.fromCharCode(65 + index); // A, B, C...
          return (
            <div
              key={index}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                padding: '8px 12px',
                background: 'white',
                borderRadius: '6px',
                border: '1px solid #e2e8f0',
              }}
            >
              <span style={{
                fontWeight: 700,
                color: '#3b82f6',
                minWidth: '24px',
              }}>
                {letter}.
              </span>
              <span style={{
                color: '#334155',
                fontSize: '14px',
                lineHeight: 1.5,
              }}>
                {option}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Context Display Component - Shows form/notes structure for completion questions
 */
const ContextDisplay: React.FC<{
  context: Question['context'];
}> = ({ context }) => {
  if (!context) return null;

  return (
    <div style={{
      background: '#fffbeb',
      border: '1px solid #fcd34d',
      borderRadius: '8px',
      padding: '16px',
      marginBottom: '16px',
    }}>
      {/* Section Heading */}
      {context.sectionHeading && (
        <div style={{
          fontWeight: 700,
          fontSize: '15px',
          color: '#92400e',
          marginBottom: '12px',
          borderBottom: '1px solid #fcd34d',
          paddingBottom: '8px',
        }}>
          {context.sectionHeading}
        </div>
      )}

      {/* Subsection Label */}
      {context.subsectionLabel && (
        <div style={{
          fontWeight: 600,
          fontSize: '13px',
          color: '#b45309',
          marginBottom: '8px',
          fontStyle: 'italic',
        }}>
          {context.subsectionLabel}
        </div>
      )}

      {/* Context Lines */}
      {context.contextLines && context.contextLines.length > 0 && (
        <div style={{
          fontSize: '14px',
          color: '#78350f',
          lineHeight: 1.8,
        }}>
          {context.contextLines.map((line, idx) => (
            <div
              key={idx}
              style={{
                marginBottom: '4px',
                fontWeight: idx === context.currentLineIndex ? 600 : 400,
                background: idx === context.currentLineIndex ? 'rgba(251, 191, 36, 0.2)' : 'transparent',
                padding: idx === context.currentLineIndex ? '4px 8px' : '0',
                borderRadius: '4px',
              }}
            >
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Map/Diagram Display Component
 */
const MapDiagramDisplay: React.FC<{ imageUrl: string; alt: string }> = ({ imageUrl, alt }) => {
  return (
    <div style={{
      marginBottom: '20px',
      borderRadius: '8px',
      overflow: 'hidden',
      border: '2px solid #e2e8f0',
      background: 'white',
    }}>
      <img
        src={imageUrl}
        alt={alt}
        style={{
          width: '100%',
          height: 'auto',
          display: 'block',
          maxHeight: '400px',
          objectFit: 'contain',
        }}
      />
    </div>
  );
};

/**
 * Single Question Display
 */
const QuestionItem: React.FC<{
  question: Question;
  answer: any;
  onAnswerChange: (answer: any) => void;
  isActive: boolean;
  testSubmitted?: boolean;
  isCorrect?: boolean;
  showContext?: boolean;
}> = ({ question, answer, onAnswerChange, isActive, testSubmitted, isCorrect, showContext = true }) => {
  return (
    <div
      style={{
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '16px 20px',
        boxShadow: isActive ? '0 0 0 2px #8b5cf6' : 'none',
        transition: 'box-shadow 0.2s',
      }}
    >
      {/* Question Context (for completion types) */}
      {showContext && question.context && (
        <ContextDisplay context={question.context} />
      )}

      {/* Question Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '12px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <span style={{
            fontWeight: 700,
            fontSize: '15px',
            color: testSubmitted
              ? isCorrect ? '#16a34a' : '#dc2626'
              : '#6b21a8',
          }}>
            {question.number}.
          </span>
          {testSubmitted && (
            <span style={{
              fontSize: '14px',
              fontWeight: 600,
              color: isCorrect ? '#16a34a' : '#dc2626',
            }}>
              {isCorrect ? '✓ Correct' : '✗ Incorrect'}
            </span>
          )}
        </div>
        {answer && !testSubmitted && (
          <span style={{
            fontSize: '12px',
            padding: '2px 8px',
            background: '#10b981',
            color: 'white',
            borderRadius: '4px',
            fontWeight: 600,
          }}>
            Answered
          </span>
        )}
      </div>

      {/* Question Text */}
      <div style={{
        fontSize: '15px',
        fontWeight: 500,
        color: '#1f2937',
        lineHeight: 1.7,
        marginBottom: '12px',
      }}>
        {question.question}
      </div>

      {/* Question Image (if exists) */}
      {question.imageUrl && (
        <MapDiagramDisplay
          imageUrl={question.imageUrl}
          alt={`Question ${question.number}`}
        />
      )}

      {/* Answer Input */}
      <AuthenticAnswerInput
        question={{
          ...question,
          passageId: question.passageId || 'listening',
        }}
        answer={answer || ''}
        onChange={onAnswerChange}
        disabled={testSubmitted}
      />
    </div>
  );
};

/**
 * Main ListeningQuestionDisplay Component
 */
export const ListeningQuestionDisplay: React.FC<ListeningQuestionDisplayProps> = ({
  group,
  answers,
  onAnswerChange,
  currentQuestionNumber,
  testSubmitted,
  questionResults,
}) => {
  // Instructions are now handled by SectionRubricBlock

  // Check if this group type needs an options box
  const needsOptionsBox = [
    'matching', 'matching-features', 'matching-headings',
    'matching-information', 'map-labelling', 'plan-labelling'
  ].includes(group.type);

  // Get unique options from all questions in the group (for matching/labelling)
  const groupOptions = needsOptionsBox && group.questions.length > 0 && group.questions[0]
    ? group.questions[0].options
    : null;

  // Check if any question has an image (for map/diagram types)
  const groupImage = group.questions.find(q => q.imageUrl)?.imageUrl;

  // Determine options box title based on type
  const getOptionsBoxTitle = () => {
    if (group.type.includes('map') || group.type.includes('plan')) return 'Locations';
    if (group.type.includes('matching')) return 'Options';
    return 'Choices';
  };

  return (
    <div style={{ marginBottom: '32px' }}>
      {/* Instructions are now shown by SectionRubricBlock - removed duplicate */}

      {/* Map/Diagram Image (for the whole group) */}
      {groupImage && (
        <MapDiagramDisplay
          imageUrl={groupImage}
          alt={`${group.type} diagram`}
        />
      )}

      {/* Options Box (for matching/labelling types) */}
      {groupOptions && groupOptions.length > 0 && (
        <OptionsBox options={groupOptions} title={getOptionsBoxTitle()} />
      )}

      {/* Questions - Use inline format for completion types, card format for others */}
      {isCompletionType(group.type) ? (
        /* IELTS-style inline form for completion questions */
        <InlineFormCompletion
          questions={group.questions}
          answers={answers}
          onAnswerChange={onAnswerChange}
          testSubmitted={testSubmitted}
          questionResults={questionResults}
          currentQuestionNumber={currentQuestionNumber}
        />
      ) : (
        /* Card-based format for matching, multiple choice, etc. */
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}>
          {group.questions.map((question) => (
            <QuestionItem
              key={question.number}
              question={question}
              answer={answers[question.number]}
              onAnswerChange={(answer) => onAnswerChange(question.number, answer)}
              isActive={currentQuestionNumber === question.number}
              testSubmitted={testSubmitted}
              isCorrect={questionResults?.[question.number]}
              showContext={!groupImage}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ListeningQuestionDisplay;
