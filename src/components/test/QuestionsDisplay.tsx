/**
 * Questions Display Component
 * Displays current question with navigation and answer status
 * For IELTS-style test interface
 */

import React from 'react';
// @ts-ignore - StudentAnswerInput is a .jsx file
import StudentAnswerInput from '../StudentAnswerInput';

interface StudentAnswers {
  [questionNumber: number]: string | string[];
}

interface Question {
  number: number;
  type: string;
  question: string;
  options?: string[];
  answer: string | string[] | Record<string, string>;
  passageId: string;
  points: number;
}

interface QuestionsDisplayProps {
  questions: Question[];
  currentQuestionNumber: number;
  answers: StudentAnswers;
  onQuestionChange: (questionNumber: number) => void;
  onAnswerChange: (questionNumber: number, answer: string | string[]) => void;
  totalQuestions: number;
}

export const QuestionsDisplay: React.FC<QuestionsDisplayProps> = ({
  questions,
  currentQuestionNumber,
  answers,
  onQuestionChange,
  onAnswerChange,
  totalQuestions,
}) => {
  const currentQuestion = questions.find(q => q.number === currentQuestionNumber);
  
  if (!currentQuestion) {
    return (
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center', 
        justifyContent: 'center',
        height: '100%',
        padding: '2rem',
        textAlign: 'center' 
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❓</div>
        <div style={{ fontSize: '1rem', fontWeight: 600, color: '#64748b' }}>
          Question not found
        </div>
      </div>
    );
  }
  
  const isAnswered = answers[currentQuestionNumber] !== undefined;
  const canGoPrevious = currentQuestionNumber > 1;
  const canGoNext = currentQuestionNumber < totalQuestions;
  
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* Question Header */}
      <div style={{
        padding: '1.5rem 2rem',
        borderBottom: '1px solid #e2e8f0',
        flexShrink: 0,
      }}>
        <div style={{ 
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.75rem'
        }}>
          <div style={{ 
            fontSize: '0.8125rem', 
            fontWeight: 600, 
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            Question {currentQuestionNumber} of {totalQuestions}
          </div>
          
          {isAnswered && (
            <div style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              color: '#10b981',
              background: 'rgba(16, 185, 129, 0.1)',
              padding: '0.25rem 0.75rem',
              borderRadius: '0.375rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem'
            }}>
              <span>✓</span>
              <span>Answered</span>
            </div>
          )}
        </div>
        
        {/* Question Type Badge */}
        <div style={{
          display: 'inline-block',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: '#8b5cf6',
          background: 'rgba(139, 92, 246, 0.1)',
          padding: '0.25rem 0.75rem',
          borderRadius: '0.375rem',
          marginBottom: '1rem'
        }}>
          {formatQuestionType(currentQuestion.type)}
        </div>
        
        {/* Question Text */}
        <div style={{ 
          fontSize: '1.125rem', 
          fontWeight: 600, 
          color: '#1e293b',
          lineHeight: 1.6
        }}>
          {currentQuestion.question}
        </div>
      </div>
      
      {/* Answer Input Area */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '2rem',
      }}>
        <StudentAnswerInput
          question={currentQuestion}
          onAnswerSubmit={(answer: string | string[]) => {
            onAnswerChange(currentQuestionNumber, answer);
          }}
          currentAnswer={answers[currentQuestionNumber]}
          disabled={false}
        />
      </div>
      
      {/* Navigation Footer */}
      <div style={{
        padding: '1.5rem 2rem',
        borderTop: '1px solid #e2e8f0',
        flexShrink: 0,
        background: 'white',
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          gap: '1rem'
        }}>
          <button
            onClick={() => onQuestionChange(currentQuestionNumber - 1)}
            disabled={!canGoPrevious}
            style={{
              flex: 1,
              maxWidth: '200px',
              padding: '0.75rem 1.5rem',
              background: canGoPrevious ? 'white' : '#f1f5f9',
              border: '2px solid #e2e8f0',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: canGoPrevious ? '#1e293b' : '#cbd5e1',
              cursor: canGoPrevious ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              if (canGoPrevious) {
                e.currentTarget.style.borderColor = '#8b5cf6';
                e.currentTarget.style.color = '#8b5cf6';
              }
            }}
            onMouseLeave={(e) => {
              if (canGoPrevious) {
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.color = '#1e293b';
              }
            }}
          >
            ← Previous
          </button>
          
          <button
            onClick={() => onQuestionChange(currentQuestionNumber + 1)}
            disabled={!canGoNext}
            style={{
              flex: 1,
              maxWidth: '200px',
              padding: '0.75rem 1.5rem',
              background: canGoNext ? 'white' : '#f1f5f9',
              border: '2px solid #e2e8f0',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: canGoNext ? '#1e293b' : '#cbd5e1',
              cursor: canGoNext ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              if (canGoNext) {
                e.currentTarget.style.borderColor = '#8b5cf6';
                e.currentTarget.style.color = '#8b5cf6';
              }
            }}
            onMouseLeave={(e) => {
              if (canGoNext) {
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.color = '#1e293b';
              }
            }}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Format question type for display
 */
const formatQuestionType = (type: string): string => {
  const typeMap: Record<string, string> = {
    'multiple-choice': 'Multiple Choice',
    'multiple-select': 'Multiple Select',
    'completion': 'Completion',
    'matching': 'Matching',
    'matching-headings': 'Matching Headings',
    'matching-information': 'Matching Information',
    'matching-features': 'Matching Features',
    'matching-sentence-endings': 'Matching Sentence Endings',
    'true-false-not-given': 'True/False/Not Given',
    'yes-no-not-given': 'Yes/No/Not Given',
    'diagram-labeling': 'Diagram Labeling',
  };
  
  return typeMap[type] || type;
};
