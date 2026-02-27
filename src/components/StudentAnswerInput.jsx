import React, { useState, useEffect, useRef } from 'react';
import { useAdaptiveLayout, getFontSizes } from '../hooks/useAdaptiveLayout';

/**
 * StudentAnswerInput Component
 * 
 * Redesigned student quiz interface with:
 * - Quadrant layout for MCQ (2-4 options)
 * - Grid layout for MCQ (5+ options)
 * - Drag-and-drop for matching
 * - Word bank grid for completion
 * - Auto-submit on timer end
 */

// Color schemes for answer buttons
const ANSWER_COLORS = [
  { bg: '#e74c3c', hover: '#c0392b', name: 'Red' },      // Top-left
  { bg: '#3498db', hover: '#2980b9', name: 'Blue' },     // Top-right
  { bg: '#f39c12', hover: '#d68910', name: 'Orange' },   // Bottom-left
  { bg: '#2ecc71', hover: '#27ae60', name: 'Green' }     // Bottom-right
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

/**
 * Multiple Choice Input - Adaptive Layout with useAdaptiveLayout
 */
const MultipleChoiceInput = ({ question, onAnswerSubmit, currentAnswer }) => {
  const { gridColumns, fontScale, containerRef } = useAdaptiveLayout({
    items: question.options || [],
    questionText: question.question,
    isPassageOpen: false,
    questionType: 'multiple-choice'
  });
  
  const fontSizes = getFontSizes(fontScale);
  const [selectedAnswer, setSelectedAnswer] = useState(currentAnswer || null);
  const optionCount = question.options?.length || 0;
  const touchHandledRef = useRef(false);
  const lastSubmittedRef = useRef(null);
  const submissionTimeRef = useRef(0);

  // Log when component renders
  useEffect(() => {
    console.log('MultipleChoiceInput rendered:', {
      optionCount,
      options: question.options,
      currentAnswer
    });
  }, [optionCount, question.options, currentAnswer]);

  const handleSelect = (e, option) => {
    const now = Date.now();
    const timeSinceLastSubmit = now - submissionTimeRef.current;
    
    console.log('handleSelect called:', { 
      eventType: e.type, 
      option, 
      touchHandled: touchHandledRef.current,
      lastSubmitted: lastSubmittedRef.current,
      timeSinceLastSubmit,
      userAgent: navigator.userAgent
    });
    
    // Prevent double-firing on mobile (both touch and click events)
    if (e.type === 'touchend') {
      touchHandledRef.current = true;
      // Reset after a short delay to allow next interaction
      setTimeout(() => {
        touchHandledRef.current = false;
      }, 300);
    } else if (e.type === 'click' && touchHandledRef.current) {
      // Skip click if touch was just handled
      console.log('Skipping click event - touch was already handled');
      return;
    }
    
    // Prevent duplicate submissions of the same answer within 500ms
    if (lastSubmittedRef.current === option && timeSinceLastSubmit < 500) {
      console.log('Skipping duplicate submission - same answer submitted recently');
      return;
    }
    
    // Prevent any default behavior that might interfere
    e.preventDefault();
    e.stopPropagation();
    
    console.log('Submitting answer:', option);
    lastSubmittedRef.current = option;
    submissionTimeRef.current = now;
    setSelectedAnswer(option);
    onAnswerSubmit(option);
  };

  // Determine layout based on option count and grid columns from adaptive layout
  const getLayout = () => {
    if (optionCount === 2) return 'two-row';
    if (optionCount === 3) return 'three-quadrant';
    if (optionCount === 4) return 'four-quadrant';
    return 'grid';
  };

  const layout = getLayout();
  const fontSize = fontSizes.option;

  // Quadrant layout for 2-4 options
  if (layout === 'two-row') {
    return (
      <div ref={containerRef} style={{
        display: 'flex',
        flexDirection: 'column',
        gap: fontScale === 'compact' ? '0.5rem' : 'clamp(0.5rem, 1.5vh, 1rem)',
        height: '100%',
        width: '100%'
      }}>
        {question.options.map((option, index) => (
          <button
            key={index}
            onClick={(e) => handleSelect(e, option)}
            onTouchStart={(e) => {
              // Prevent default to stop click event from firing
              e.preventDefault();
            }}
            onTouchEnd={(e) => handleSelect(e, option)}
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
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'manipulation'
            }}
          >
            {option}
          </button>
        ))}
      </div>
    );
  }

  if (layout === 'three-quadrant') {
    return (
      <div ref={containerRef} style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: fontScale === 'compact' ? '0.5rem' : 'clamp(0.5rem, 1.5vh, 1rem)',
        height: '100%',
        width: '100%'
      }}>
        {question.options.map((option, index) => (
          <button
            key={index}
            onClick={(e) => handleSelect(e, option)}
            onTouchStart={(e) => e.preventDefault()}
            onTouchEnd={(e) => handleSelect(e, option)}
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
              gridColumn: index === 2 ? 'span 2' : 'auto',
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'manipulation'
            }}
          >
            {option}
          </button>
        ))}
      </div>
    );
  }

  if (layout === 'four-quadrant') {
    return (
      <div ref={containerRef} style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: fontScale === 'compact' ? '0.5rem' : 'clamp(0.5rem, 1.5vh, 1rem)',
        height: '100%',
        width: '100%'
      }}>
        {question.options.map((option, index) => (
          <button
            key={index}
            onClick={(e) => handleSelect(e, option)}
            onTouchStart={(e) => e.preventDefault()}
            onTouchEnd={(e) => handleSelect(e, option)}
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
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'manipulation'
            }}
          >
            {option}
          </button>
        ))}
      </div>
    );
  }

  // Grid layout for 5+ options
  return (
    <div ref={containerRef} style={{
      display: 'grid',
      gridTemplateColumns: gridColumns === 3 ? 'repeat(3, 1fr)' : gridColumns === 2 ? 'repeat(2, 1fr)' : '1fr',
      gridAutoRows: optionCount > 8 ? 'minmax(60px, auto)' : '1fr',
      gap: fontScale === 'compact' ? '0.5rem' : 'clamp(0.5rem, 1.5vh, 0.75rem)',
      width: '100%',
      height: '100%',
      maxHeight: '100%',
      alignContent: optionCount > 8 ? 'start' : 'center',
      overflowY: optionCount > 8 ? 'auto' : 'visible',
      overflowX: 'hidden',
      padding: optionCount > 8 ? 'clamp(0.25rem, 1vh, 0.5rem)' : '0'
    }}>
      {question.options.map((option, index) => (
        <button
          key={index}
          onClick={(e) => handleSelect(e, option)}
          onTouchStart={(e) => e.preventDefault()}
          onTouchEnd={(e) => handleSelect(e, option)}
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
            WebkitTapHighlightColor: 'transparent',
            touchAction: 'manipulation'
          }}
        >
          {option}
        </button>
      ))}
    </div>
  );
};

/**
 * Multiple Select Input - Grid with checkboxes and adaptive layout
 */
const MultipleSelectInput = ({ question, onAnswerSubmit, currentAnswer }) => {
  const [selectedAnswers, setSelectedAnswers] = useState(currentAnswer || []);
  
  const { gridColumns, fontScale, containerRef } = useAdaptiveLayout({
    items: question.options || [],
    questionText: question.question,
    isPassageOpen: false,
    questionType: 'multiple-select'
  });
  
  const fontSizes = getFontSizes(fontScale);

  const handleToggle = (option) => {
    const newSelected = selectedAnswers.includes(option)
      ? selectedAnswers.filter(item => item !== option)
      : [...selectedAnswers, option];
    
    setSelectedAnswers(newSelected);
    onAnswerSubmit(newSelected);
  };

  return (
    <div ref={containerRef} style={{
      display: 'grid',
      gridTemplateColumns: gridColumns === 3 ? 'repeat(3, 1fr)' : gridColumns === 2 ? 'repeat(2, 1fr)' : '1fr',
      gap: fontScale === 'compact' ? '0.75rem' : '1rem',
      width: '100%',
      padding: '1rem'
    }}>
      {question.options.map((option, index) => {
        const isSelected = selectedAnswers.includes(option);
        return (
          <button
            key={index}
            onClick={() => handleToggle(option)}
            style={{
              minHeight: fontScale === 'compact' ? '80px' : '100px',
              fontSize: fontSizes.option,
              fontWeight: '600',
              color: 'white',
              backgroundColor: isSelected ? '#27ae60' : GRID_COLORS[index % GRID_COLORS.length].bg,
              border: isSelected ? '4px solid #fff' : 'none',
              borderRadius: '0.75rem',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: isSelected 
                ? '0 6px 20px rgba(39, 174, 96, 0.4), inset 0 0 0 3px rgba(255, 255, 255, 0.3)'
                : '0 3px 10px rgba(0, 0, 0, 0.2)',
              textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
              padding: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              wordBreak: 'break-word',
              position: 'relative'
            }}
            onMouseEnter={(e) => {
              if (!isSelected) {
                e.currentTarget.style.backgroundColor = GRID_COLORS[index % GRID_COLORS.length].hover;
                e.currentTarget.style.transform = 'scale(1.05)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.backgroundColor = GRID_COLORS[index % GRID_COLORS.length].bg;
                e.currentTarget.style.transform = 'scale(1)';
              }
            }}
          >
            {isSelected && (
              <span style={{
                position: 'absolute',
                top: '0.5rem',
                right: '0.5rem',
                fontSize: '1.5rem'
              }}>
                ✓
              </span>
            )}
            {option}
          </button>
        );
      })}
    </div>
  );
};

/**
 * Matching Input - Drag and Drop with adaptive layout
 * Supports two formats:
 * 1. Grouped matching: items + options (drag-and-drop)
 * 2. Individual matching (IELTS): options only (multiple choice style)
 */
const MatchingInput = ({ question, onAnswerSubmit, currentAnswer, disabled = false }) => {
  // Detect format
  const isIndividualFormat = !question.items && Array.isArray(question.options) && question.options.length > 0;
  
  // If individual format (IELTS), render like multiple choice
  if (isIndividualFormat) {
    return <MultipleChoiceInput question={question} onAnswerSubmit={onAnswerSubmit} currentAnswer={currentAnswer} disabled={disabled} />;
  }
  
  // Grouped format: drag-and-drop
  const [matches, setMatches] = useState(currentAnswer || {});
  const [draggedItem, setDraggedItem] = useState(null);
  const [draggedOption, setDraggedOption] = useState(null);
  const [touchStartPos, setTouchStartPos] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const { fontScale, containerRef, textMetrics } = useAdaptiveLayout({
    items: [...(question.items || []), ...(question.options || [])],
    questionText: question.question,
    isPassageOpen: false,
    questionType: 'matching'
  });
  
  const fontSizes = getFontSizes(fontScale);
  const useVerticalLayout = textMetrics.mostAreLong || textMetrics.avgLength > 50;

  const handleDragStart = (e, item, type) => {
    if (disabled) {
      e.preventDefault();
      return;
    }
    if (type === 'item') {
      setDraggedItem(item);
    } else {
      setDraggedOption(item);
    }
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
    }
  };

  // Touch event handlers for mobile
  const handleTouchStart = (e, item, type) => {
    if (disabled) {
      e.preventDefault();
      return;
    }
    const touch = e.touches[0];
    setTouchStartPos({ x: touch.clientX, y: touch.clientY });
    setIsDragging(true);
    
    if (type === 'item') {
      setDraggedItem(item);
    } else {
      setDraggedOption(item);
    }
  };

  const handleTouchMove = (e) => {
    if (disabled || !isDragging) return;
    e.preventDefault(); // Prevent scrolling while dragging
  };

  const handleTouchEnd = (e, target, type) => {
    if (disabled || !isDragging) return;
    
    const touch = e.changedTouches[0];
    const element = document.elementFromPoint(touch.clientX, touch.clientY);
    
    // Find the closest draggable element
    let dropTarget = element;
    while (dropTarget && !dropTarget.dataset.itemId && !dropTarget.dataset.optionId) {
      dropTarget = dropTarget.parentElement;
    }
    
    if (dropTarget) {
      if (dropTarget.dataset.itemId && draggedOption) {
        // Dropping an option onto an item
        const newMatches = { ...matches, [dropTarget.dataset.itemId]: draggedOption.id };
        setMatches(newMatches);
        onAnswerSubmit(newMatches);
      } else if (dropTarget.dataset.optionId && draggedItem) {
        // Dropping an item onto an option
        const newMatches = { ...matches, [draggedItem.id]: dropTarget.dataset.optionId };
        setMatches(newMatches);
        onAnswerSubmit(newMatches);
      }
    }
    
    setDraggedItem(null);
    setDraggedOption(null);
    setIsDragging(false);
    setTouchStartPos(null);
  };

  const handleDragOver = (e) => {
    if (disabled) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, target, type) => {
    if (disabled) return;
    e.preventDefault();
    
    if (type === 'item' && draggedOption) {
      // Dropping an option onto an item
      const newMatches = { ...matches, [target.id]: draggedOption.id };
      setMatches(newMatches);
      onAnswerSubmit(newMatches);
    } else if (type === 'option' && draggedItem) {
      // Dropping an item onto an option
      const newMatches = { ...matches, [draggedItem.id]: target.id };
      setMatches(newMatches);
      onAnswerSubmit(newMatches);
    }
    
    setDraggedItem(null);
    setDraggedOption(null);
  };

  const getMatchedOption = (itemId) => {
    const optionId = matches[itemId];
    return question.options.find(opt => opt.id === optionId);
  };

  return (
    <div ref={containerRef} style={{
      display: 'flex',
      flexDirection: 'column',
      gap: fontScale === 'compact' ? '1rem' : '2rem',
      width: '100%',
      padding: '1rem'
    }}>
      <div style={{
        textAlign: 'center',
        fontSize: fontSizes.label,
        fontWeight: '600',
        color: '#fff',
        background: 'rgba(0, 0, 0, 0.3)',
        padding: fontScale === 'compact' ? '0.75rem' : '1rem',
        borderRadius: '0.5rem'
      }}>
        Drag and drop to match pairs
      </div>

      <div style={{
        display: useVerticalLayout ? 'flex' : 'grid',
        flexDirection: useVerticalLayout ? 'column' : undefined,
        gridTemplateColumns: useVerticalLayout ? undefined : '1fr 1fr',
        gap: fontScale === 'compact' ? '1rem' : '2rem'
      }}>
        {/* Left column: Items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: fontScale === 'compact' ? '0.5rem' : '1rem' }}>
          <h3 style={{ color: '#fff', fontSize: fontSizes.label, marginBottom: '0.5rem' }}>Items</h3>
          {question.items.map((item) => {
            const matchedOption = getMatchedOption(item.id);
            return (
              <div
                key={item.id}
                data-item-id={item.id}
                draggable={!disabled}
                onDragStart={(e) => handleDragStart(e, item, 'item')}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, item, 'item')}
                onTouchStart={(e) => handleTouchStart(e, item, 'item')}
                onTouchMove={handleTouchMove}
                onTouchEnd={(e) => handleTouchEnd(e, item, 'item')}
                style={{
                  padding: fontScale === 'compact' ? '1rem' : '1.5rem',
                  backgroundColor: matchedOption ? '#27ae60' : '#3498db',
                  color: 'white',
                  borderRadius: '0.75rem',
                  cursor: disabled ? 'not-allowed' : 'grab',
                  fontSize: fontSizes.option,
                  fontWeight: '600',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                  transition: 'all 0.3s ease',
                  border: matchedOption ? '3px solid #fff' : 'none',
                  opacity: disabled ? 0.6 : 1
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                <div>{item.text}</div>
                {matchedOption && (
                  <div style={{
                    marginTop: '0.5rem',
                    fontSize: '0.9rem',
                    opacity: 0.9,
                    fontStyle: 'italic'
                  }}>
                    ↔ {matchedOption.text}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Right column: Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: fontScale === 'compact' ? '0.5rem' : '1rem' }}>
          <h3 style={{ color: '#fff', fontSize: fontSizes.label, marginBottom: '0.5rem' }}>Answers</h3>
          {question.options.map((option) => (
            <div
              key={option.id}
              data-option-id={option.id}
              draggable={!disabled}
              onDragStart={(e) => handleDragStart(e, option, 'option')}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, option, 'option')}
              onTouchStart={(e) => handleTouchStart(e, option, 'option')}
              onTouchMove={handleTouchMove}
              onTouchEnd={(e) => handleTouchEnd(e, option, 'option')}
              style={{
                padding: fontScale === 'compact' ? '1rem' : '1.5rem',
                backgroundColor: '#f39c12',
                color: 'white',
                borderRadius: '0.75rem',
                cursor: disabled ? 'not-allowed' : 'grab',
                fontSize: fontSizes.option,
                fontWeight: '600',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
                transition: 'all 0.3s ease',
                opacity: disabled ? 0.6 : 1
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              {option.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * Completion Input - Word Bank Grid or Text Input with adaptive layout
 */
const CompletionInput = ({ question, onAnswerSubmit, currentAnswer }) => {
  const [selectedWord, setSelectedWord] = useState(currentAnswer || null);
  const [typedAnswer, setTypedAnswer] = useState(currentAnswer || '');
  const hasWordBank = question.wordBank && question.wordBank.length > 0;
  
  const { gridColumns, fontScale, containerRef } = useAdaptiveLayout({
    items: hasWordBank ? question.wordBank : [],
    questionText: question.question,
    isPassageOpen: false,
    questionType: 'completion'
  });
  
  const fontSizes = getFontSizes(fontScale);

  const handleWordClick = (word) => {
    setSelectedWord(word);
    onAnswerSubmit(word);
  };

  const handleTextChange = (e) => {
    const value = e.target.value;
    setTypedAnswer(value);
    onAnswerSubmit(value);
  };

  if (hasWordBank) {
    return (
      <div ref={containerRef} style={{
        display: 'grid',
        gridTemplateColumns: gridColumns === 3 ? 'repeat(3, 1fr)' : gridColumns === 2 ? 'repeat(2, 1fr)' : '1fr',
        gap: fontScale === 'compact' ? '0.75rem' : '1rem',
        width: '100%',
        padding: '1rem'
      }}>
        {question.wordBank.map((word, index) => (
          <button
            key={index}
            onClick={() => handleWordClick(word)}
            style={{
              minHeight: fontScale === 'compact' ? '60px' : '80px',
              fontSize: fontSizes.option,
              fontWeight: '600',
              color: 'white',
              backgroundColor: selectedWord === word ? '#27ae60' : GRID_COLORS[index % GRID_COLORS.length].bg,
              border: selectedWord === word ? '4px solid #fff' : 'none',
              borderRadius: '0.75rem',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: selectedWord === word 
                ? '0 6px 20px rgba(39, 174, 96, 0.4), inset 0 0 0 3px rgba(255, 255, 255, 0.3)'
                : '0 3px 10px rgba(0, 0, 0, 0.2)',
              textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
              padding: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              wordBreak: 'break-word'
            }}
            onMouseEnter={(e) => {
              if (selectedWord !== word) {
                e.currentTarget.style.backgroundColor = GRID_COLORS[index % GRID_COLORS.length].hover;
                e.currentTarget.style.transform = 'scale(1.05)';
              }
            }}
            onMouseLeave={(e) => {
              if (selectedWord !== word) {
                e.currentTarget.style.backgroundColor = GRID_COLORS[index % GRID_COLORS.length].bg;
                e.currentTarget.style.transform = 'scale(1)';
              }
            }}
          >
            {word}
          </button>
        ))}
      </div>
    );
  }

  // Text input for no word bank
  return (
    <div style={{ width: '100%', maxWidth: '600px', margin: '0 auto' }}>
      <input
        type="text"
        value={typedAnswer}
        onChange={handleTextChange}
        placeholder="Type your answer here..."
        style={{
          width: '100%',
          padding: '2rem',
          fontSize: '1.8rem',
          fontWeight: '600',
          color: '#1e293b',
          backgroundColor: 'white',
          border: '4px solid #3498db',
          borderRadius: '1rem',
          outline: 'none',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
          textAlign: 'center'
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = '#2980b9';
          e.currentTarget.style.boxShadow = '0 6px 20px rgba(52, 152, 219, 0.4)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = '#3498db';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
        }}
      />
    </div>
  );
};

/**
 * Diagram Labeling Input - Fill in the blank style with adaptive layout
 */
const DiagramLabelingInput = ({ question, onAnswerSubmit, currentAnswer }) => {
  const [answers, setAnswers] = useState(currentAnswer || {});
  
  const { fontScale, containerRef } = useAdaptiveLayout({
    items: question.labels || [],
    questionText: question.question,
    isPassageOpen: false,
    questionType: 'diagram-labeling'
  });
  
  const fontSizes = getFontSizes(fontScale);

  const handleAnswerChange = (labelId, value) => {
    const newAnswers = { ...answers, [labelId]: value };
    setAnswers(newAnswers);
    onAnswerSubmit(newAnswers);
  };

  return (
    <div ref={containerRef} style={{
      display: 'flex',
      flexDirection: 'column',
      gap: fontScale === 'compact' ? '1rem' : '1.5rem',
      width: '100%',
      maxWidth: '600px',
      margin: '0 auto',
      padding: '1rem'
    }}>
      {question.labels?.map((label, index) => (
        <div
          key={label.id}
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            padding: fontScale === 'compact' ? '1rem' : '1.5rem',
            borderRadius: '0.75rem',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)'
          }}
        >
          <div style={{
            fontSize: fontSizes.option,
            fontWeight: '600',
            color: '#1e293b',
            marginBottom: '1rem'
          }}>
            {index + 1}. {label.sentence}
          </div>
          <input
            type="text"
            value={answers[label.id] || ''}
            onChange={(e) => handleAnswerChange(label.id, e.target.value)}
            placeholder="Type your answer..."
            style={{
              width: '100%',
              padding: fontScale === 'compact' ? '0.75rem' : '1rem',
              fontSize: fontSizes.option,
              color: '#1e293b',
              backgroundColor: 'white',
              border: '3px solid #3498db',
              borderRadius: '0.5rem',
              outline: 'none'
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = '#2980b9';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '#3498db';
            }}
          />
        </div>
      ))}
    </div>
  );
};

/**
 * Main StudentAnswerInput Component
 */
const StudentAnswerInput = ({ question, onAnswerSubmit, currentAnswer, disabled = false }) => {
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

  const commonProps = {
    question,
    onAnswerSubmit,
    currentAnswer,
    disabled
  };

  switch (question.type) {
    case 'multiple-choice':
      return <MultipleChoiceInput {...commonProps} />;
    case 'multiple-select':
      return <MultipleSelectInput {...commonProps} />;
    case 'matching':
    case 'matching-headings':
    case 'matching-information':
    case 'matching-features':
    case 'matching-sentence-endings':
      return <MatchingInput {...commonProps} />;
    case 'completion':
    case 'sentence-completion':
    case 'summary-completion-text':
    case 'summary-completion-list':
    case 'note-completion':
    case 'table-completion':
    case 'flowchart-completion':
    case 'short-answer':
      return <CompletionInput {...commonProps} />;
    case 'diagram-labeling':
      return <DiagramLabelingInput {...commonProps} />;
    case 'true-false-not-given':
      // Auto-generate options for True/False/Not Given
      return <MultipleChoiceInput {...commonProps} question={{...question, options: ['True', 'False', 'Not Given']}} />;
    case 'yes-no-not-given':
      // Auto-generate options for Yes/No/Not Given
      return <MultipleChoiceInput {...commonProps} question={{...question, options: ['Yes', 'No', 'Not Given']}} />;
    default:
      return <MultipleChoiceInput {...commonProps} />;
  }
};

export default StudentAnswerInput;
