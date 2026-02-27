import React, { useState, useEffect } from 'react';

/**
 * StudentAnswerInputSimple - Simplified version using radio buttons
 * For maximum compatibility with mobile devices
 */

const ANSWER_COLORS = [
  { bg: '#e74c3c', hover: '#c0392b', name: 'Red' },
  { bg: '#3498db', hover: '#2980b9', name: 'Blue' },
  { bg: '#f39c12', hover: '#d68910', name: 'Orange' },
  { bg: '#2ecc71', hover: '#27ae60', name: 'Green' }
];

const GRID_COLORS = [
  { bg: '#e74c3c', hover: '#c0392b' },
  { bg: '#3498db', hover: '#2980b9' },
  { bg: '#f39c12', hover: '#d68910' },
  { bg: '#2ecc71', hover: '#27ae60' },
  { bg: '#9b59b6', hover: '#8e44ad' },
  { bg: '#1abc9c', hover: '#16a085' },
  { bg: '#e67e22', hover: '#d35400' },
  { bg: '#34495e', hover: '#2c3e50' }
];

const MultipleChoiceInputSimple = ({ question, onAnswerSubmit, currentAnswer }) => {
  const [selectedAnswer, setSelectedAnswer] = useState(currentAnswer || null);
  const optionCount = question.options?.length || 0;

  useEffect(() => {
    console.log('MultipleChoiceInputSimple rendered:', {
      optionCount,
      options: question.options,
      currentAnswer
    });
  }, [optionCount, question.options, currentAnswer]);

  const handleChange = (option) => {
    console.log('Radio button changed to:', option);
    setSelectedAnswer(option);
    onAnswerSubmit(option);
  };

  const getLayout = () => {
    if (optionCount === 2) return 'two-row';
    if (optionCount === 3) return 'three-quadrant';
    if (optionCount === 4) return 'four-quadrant';
    return 'grid';
  };

  const layout = getLayout();
  const fontSize = optionCount >= 6 ? 'clamp(1rem, 3vw, 1.4rem)' : 'clamp(1.25rem, 4vw, 2rem)';

  // Two-row layout
  if (layout === 'two-row') {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'clamp(0.5rem, 1.5vh, 1rem)',
        height: '100%',
        width: '100%'
      }}>
        {question.options.map((option, index) => (
          <label
            key={index}
            style={{
              flex: 1,
              minHeight: '0',
              fontSize: fontSize,
              fontWeight: '700',
              color: 'white',
              backgroundColor: selectedAnswer === option ? '#27ae60' : ANSWER_COLORS[index].bg,
              border: selectedAnswer === option ? 'clamp(3px, 0.5vw, 6px) solid #fff' : 'none',
              borderRadius: 'clamp(0.75rem, 2vw, 1rem)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: selectedAnswer === option 
                ? '0 4px 16px rgba(39, 174, 96, 0.4)'
                : '0 2px 8px rgba(0, 0, 0, 0.2)',
              textShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
              padding: 'clamp(0.75rem, 2vh, 1.5rem) clamp(0.5rem, 2vw, 1rem)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              wordBreak: 'break-word',
              position: 'relative'
            }}
          >
            <input
              type="radio"
              name="answer"
              value={option}
              checked={selectedAnswer === option}
              onChange={() => handleChange(option)}
              style={{
                position: 'absolute',
                opacity: 0,
                width: '100%',
                height: '100%',
                cursor: 'pointer',
                margin: 0
              }}
            />
            <span style={{ pointerEvents: 'none' }}>{option}</span>
          </label>
        ))}
      </div>
    );
  }

  // Four-quadrant layout
  if (layout === 'four-quadrant' || layout === 'three-quadrant') {
    return (
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: 'clamp(0.5rem, 1.5vh, 1rem)',
        height: '100%',
        width: '100%'
      }}>
        {question.options.map((option, index) => (
          <label
            key={index}
            style={{
              minHeight: '0',
              fontSize: fontSize,
              fontWeight: '700',
              color: 'white',
              backgroundColor: selectedAnswer === option ? '#27ae60' : ANSWER_COLORS[index].bg,
              border: selectedAnswer === option ? 'clamp(3px, 0.5vw, 6px) solid #fff' : 'none',
              borderRadius: 'clamp(0.75rem, 2vw, 1rem)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: selectedAnswer === option 
                ? '0 4px 16px rgba(39, 174, 96, 0.4)'
                : '0 2px 8px rgba(0, 0, 0, 0.2)',
              textShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
              padding: 'clamp(0.75rem, 2vh, 1.5rem) clamp(0.5rem, 2vw, 1rem)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              wordBreak: 'break-word',
              gridColumn: layout === 'three-quadrant' && index === 2 ? 'span 2' : 'auto',
              position: 'relative'
            }}
          >
            <input
              type="radio"
              name="answer"
              value={option}
              checked={selectedAnswer === option}
              onChange={() => handleChange(option)}
              style={{
                position: 'absolute',
                opacity: 0,
                width: '100%',
                height: '100%',
                cursor: 'pointer',
                margin: 0
              }}
            />
            <span style={{ pointerEvents: 'none' }}>{option}</span>
          </label>
        ))}
      </div>
    );
  }

  // Grid layout for 5+ options
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: optionCount <= 6 ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(min(150px, 45%), 1fr))',
      gridAutoRows: optionCount > 8 ? 'minmax(60px, auto)' : '1fr',
      gap: 'clamp(0.5rem, 1.5vh, 0.75rem)',
      width: '100%',
      height: '100%',
      maxHeight: '100%',
      alignContent: optionCount > 8 ? 'start' : 'center',
      overflowY: optionCount > 8 ? 'auto' : 'visible',
      overflowX: 'hidden',
      padding: optionCount > 8 ? 'clamp(0.25rem, 1vh, 0.5rem)' : '0'
    }}>
      {question.options.map((option, index) => (
        <label
          key={index}
          style={{
            minHeight: optionCount > 8 ? '60px' : '0',
            fontSize: fontSize,
            fontWeight: '700',
            color: 'white',
            backgroundColor: selectedAnswer === option ? '#27ae60' : GRID_COLORS[index % GRID_COLORS.length].bg,
            border: selectedAnswer === option ? 'clamp(3px, 0.5vw, 6px) solid #fff' : 'none',
            borderRadius: 'clamp(0.75rem, 2vw, 1rem)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: selectedAnswer === option 
              ? '0 4px 16px rgba(39, 174, 96, 0.4)'
              : '0 2px 8px rgba(0, 0, 0, 0.2)',
            textShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
            padding: 'clamp(0.75rem, 2vh, 1.5rem) clamp(0.5rem, 2vw, 1rem)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            wordBreak: 'break-word',
            position: 'relative'
          }}
        >
          <input
            type="radio"
            name="answer"
            value={option}
            checked={selectedAnswer === option}
            onChange={() => handleChange(option)}
            style={{
              position: 'absolute',
              opacity: 0,
              width: '100%',
              height: '100%',
              cursor: 'pointer',
              margin: 0
            }}
          />
          <span style={{ pointerEvents: 'none' }}>{option}</span>
        </label>
      ))}
    </div>
  );
};

const StudentAnswerInputSimple = ({ question, onAnswerSubmit, currentAnswer }) => {
  if (!question) {
    return (
      <div style={{
        color: 'white',
        fontSize: '1.5rem',
        textAlign: 'center',
        padding: '2rem'
      }}>
        Waiting for question...
      </div>
    );
  }

  // For now, only handle multiple-choice
  // Other question types can be added later
  if (question.type === 'multiple-choice' || !question.type) {
    return (
      <MultipleChoiceInputSimple
        question={question}
        onAnswerSubmit={onAnswerSubmit}
        currentAnswer={currentAnswer}
      />
    );
  }

  // Fallback for other question types
  return (
    <div style={{
      color: 'white',
      fontSize: '1.5rem',
      textAlign: 'center',
      padding: '2rem'
    }}>
      Question type "{question.type}" not yet supported in simple mode
    </div>
  );
};

export default StudentAnswerInputSimple;
