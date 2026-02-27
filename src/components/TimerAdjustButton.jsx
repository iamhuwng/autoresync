import React, { useState, useRef } from 'react';
import { Button } from './modern';
import { TextInput } from '@mantine/core';

/**
 * TimerAdjustButton Component
 * 
 * A button that:
 * - Single click: adjusts timer by 1 second
 * - Double click: shows input field for custom adjustment
 */
const TimerAdjustButton = ({ 
  type = 'add', // 'add' or 'subtract'
  onAdjust,
  disabled = false,
  size = 'sm',
  isCompact = false
}) => {
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const clickTimeoutRef = useRef(null);
  const clickCountRef = useRef(0);

  const handleClick = () => {
    clickCountRef.current += 1;

    // Clear existing timeout
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
    }

    // Set new timeout
    clickTimeoutRef.current = setTimeout(() => {
      if (clickCountRef.current === 1) {
        // Single click - adjust by 1 second
        const adjustment = type === 'add' ? 1 : -1;
        onAdjust(adjustment);
      } else if (clickCountRef.current >= 2) {
        // Double click - show input
        setShowInput(true);
      }
      clickCountRef.current = 0;
    }, 300); // 300ms to detect double click
  };

  const handleInputSubmit = (e) => {
    e.preventDefault();
    const value = parseInt(inputValue, 10);
    if (!isNaN(value) && value > 0) {
      const adjustment = type === 'add' ? value : -value;
      onAdjust(adjustment);
    }
    setInputValue('');
    setShowInput(false);
  };

  const handleInputBlur = () => {
    setShowInput(false);
    setInputValue('');
  };

  if (showInput) {
    return (
      <form onSubmit={handleInputSubmit} style={{ display: 'inline-block' }}>
        <TextInput
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onBlur={handleInputBlur}
          autoFocus
          placeholder="Seconds"
          type="number"
          min="1"
          size="xs"
          style={{ 
            width: '70px',
            height: isCompact ? '30px' : '34px'
          }}
          styles={{
            input: {
              height: isCompact ? '30px' : '34px',
              minHeight: isCompact ? '30px' : '34px',
              padding: '0 0.5rem',
              fontSize: isCompact ? '0.75rem' : '0.875rem'
            }
          }}
        />
      </form>
    );
  }

  return (
    <Button
      onClick={handleClick}
      disabled={disabled}
      variant="glass"
      size={size}
      style={{
        padding: isCompact ? '0.25rem 0.5rem' : '0.5rem 0.75rem',
        minWidth: isCompact ? '30px' : '34px',
        height: isCompact ? '30px' : '34px',
        minHeight: isCompact ? '30px' : '34px',
        fontSize: isCompact ? '0.875rem' : '1rem',
        fontWeight: 'bold',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
      }}
      title={`Click to ${type === 'add' ? 'add' : 'subtract'} 1 second, double-click for custom amount`}
    >
      {type === 'add' ? '+' : '−'}
    </Button>
  );
};

export default TimerAdjustButton;
