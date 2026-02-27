/**
 * Question Navigator Component
 * Grid of question number buttons for IELTS-style test navigation
 * Features:
 * - Visual indicators: answered (green), current (blue), unanswered (gray)
 * - Click to jump to specific question
 * - Responsive grid layout (5-10 columns based on screen size)
 * - Compact design for test interface
 */

import React from 'react';

interface QuestionNavigatorProps {
  /**
   * Total number of questions in the test
   */
  totalQuestions: number;
  
  /**
   * Currently active question number (1-indexed)
   */
  currentQuestion: number;
  
  /**
   * Set of question numbers that have been answered
   */
  answeredQuestions: Set<number>;
  
  /**
   * Callback when a question number is clicked
   */
  onQuestionClick: (questionNumber: number) => void;
  
  /**
   * Optional: Set of flagged question numbers
   */
  flaggedQuestions?: Set<number>;
  
  /**
   * Size variant
   */
  size?: 'sm' | 'md' | 'lg';
}

export const QuestionNavigator: React.FC<QuestionNavigatorProps> = ({
  totalQuestions,
  currentQuestion,
  answeredQuestions,
  onQuestionClick,
  flaggedQuestions = new Set(),
  size = 'md',
}) => {
  
  // Generate array of question numbers
  const questionNumbers = Array.from({ length: totalQuestions }, (_, i) => i + 1);
  
  // Size-based styles
  const sizeStyles = {
    sm: {
      cellSize: '2rem',
      fontSize: '0.75rem',
      gap: '0.375rem',
    },
    md: {
      cellSize: '2.5rem',
      fontSize: '0.875rem',
      gap: '0.5rem',
    },
    lg: {
      cellSize: '3rem',
      fontSize: '1rem',
      gap: '0.625rem',
    },
  };
  
  const currentSize = sizeStyles[size];
  
  /**
   * Get cell styling based on question state
   */
  const getCellStyle = (questionNum: number) => {
    const isCurrent = questionNum === currentQuestion;
    const isAnswered = answeredQuestions.has(questionNum);
    
    // Current question (blue)
    if (isCurrent) {
      return {
        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
        color: 'white',
        border: '2px solid #1d4ed8',
        fontWeight: 700,
        transform: 'scale(1.05)',
        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
      };
    }
    
    // Answered question (green)
    if (isAnswered) {
      return {
        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        color: 'white',
        border: '2px solid #047857',
        fontWeight: 600,
        boxShadow: '0 2px 6px rgba(16, 185, 129, 0.2)',
      };
    }
    
    // Unanswered question (gray)
    return {
      background: 'rgba(241, 245, 249, 0.9)',
      color: '#64748b',
      border: '2px solid #cbd5e1',
      fontWeight: 600,
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    };
  };
  
  /**
   * Get hover style
   */
  const getHoverStyle = (questionNum: number) => {
    const isCurrent = questionNum === currentQuestion;
    const isAnswered = answeredQuestions.has(questionNum);
    
    if (isCurrent) {
      return {
        transform: 'scale(1.08)',
        boxShadow: '0 6px 16px rgba(59, 130, 246, 0.4)',
      };
    }
    
    if (isAnswered) {
      return {
        transform: 'scale(1.05)',
        boxShadow: '0 4px 10px rgba(16, 185, 129, 0.3)',
      };
    }
    
    return {
      transform: 'scale(1.05)',
      background: 'rgba(226, 232, 240, 0.9)',
      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.15)',
    };
  };
  
  return (
    <div
      style={{
        padding: '1rem',
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(8px)',
        borderRadius: '0.75rem',
        border: '1px solid rgba(203, 213, 225, 0.5)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.75rem',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid rgba(203, 213, 225, 0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#64748b"
            strokeWidth="2"
          >
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
          <span
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#475569',
            }}
          >
            Questions
          </span>
        </div>
        
        {/* Progress counter */}
        <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
          <span style={{ color: '#10b981' }}>{answeredQuestions.size}</span>
          <span style={{ margin: '0 0.25rem' }}>/</span>
          <span>{totalQuestions}</span>
        </div>
      </div>
      
      {/* Question grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fill, minmax(${currentSize.cellSize}, 1fr))`,
          gap: currentSize.gap,
        }}
      >
        {questionNumbers.map((num) => {
          const cellStyle = getCellStyle(num);
          const isFlagged = flaggedQuestions.has(num);
          
          return (
            <button
              key={num}
              onClick={() => onQuestionClick(num)}
              style={{
                position: 'relative',
                width: currentSize.cellSize,
                height: currentSize.cellSize,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: currentSize.fontSize,
                borderRadius: '0.5rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                ...cellStyle,
              }}
              onMouseEnter={(e) => {
                const hoverStyle = getHoverStyle(num);
                Object.assign(e.currentTarget.style, hoverStyle);
              }}
              onMouseLeave={(e) => {
                Object.assign(e.currentTarget.style, cellStyle);
              }}
              aria-label={`Go to question ${num}${answeredQuestions.has(num) ? ' (answered)' : ' (unanswered)'}`}
            >
              {num}
              
              {/* Flag indicator */}
              {isFlagged && (
                <div
                  style={{
                    position: 'absolute',
                    top: '-4px',
                    right: '-4px',
                    width: '12px',
                    height: '12px',
                    background: '#f59e0b',
                    borderRadius: '50%',
                    border: '2px solid white',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
                  }}
                  title="Flagged for review"
                />
              )}
            </button>
          );
        })}
      </div>
      
      {/* Legend */}
      <div
        style={{
          display: 'flex',
          gap: '1rem',
          marginTop: '0.75rem',
          paddingTop: '0.75rem',
          borderTop: '1px solid rgba(203, 213, 225, 0.5)',
          fontSize: '0.75rem',
          color: '#64748b',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <div
            style={{
              width: '1rem',
              height: '1rem',
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              borderRadius: '0.25rem',
              border: '1px solid #1d4ed8',
            }}
          />
          <span>Current</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <div
            style={{
              width: '1rem',
              height: '1rem',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              borderRadius: '0.25rem',
              border: '1px solid #047857',
            }}
          />
          <span>Answered</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <div
            style={{
              width: '1rem',
              height: '1rem',
              background: 'rgba(241, 245, 249, 0.9)',
              borderRadius: '0.25rem',
              border: '1px solid #cbd5e1',
            }}
          />
          <span>Unanswered</span>
        </div>
      </div>
    </div>
  );
};
