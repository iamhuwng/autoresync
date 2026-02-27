import React, { useEffect, useState } from 'react';
import { Text, Stack } from '@mantine/core';
import { Button } from './modern';

const QuestionJumpPanel = ({ isOpen, onClose, questions, currentQuestionIndex, onJumpToQuestion, buttonRef, type = 'previous' }) => {
  const [position, setPosition] = useState({ bottom: '90px', right: '20px', tailRight: '30px' });

  useEffect(() => {
    if (isOpen && buttonRef) {
      const rect = buttonRef.getBoundingClientRect();
      const tailOffset = 30;
      const panelWidth = 300; // maxWidth from the panel style
      const padding = 20; // minimum padding from screen edge
      
      // Calculate position to center the tail above the button
      const buttonCenter = rect.left + (rect.width / 2);
      let rightPosition = window.innerWidth - buttonCenter - tailOffset;
      
      // Store original right position for tail calculation
      const originalRightPosition = rightPosition;
      
      // Prevent overflow on the left side
      const leftEdge = window.innerWidth - rightPosition - panelWidth;
      if (leftEdge < padding) {
        rightPosition = window.innerWidth - panelWidth - padding;
      }
      
      // Prevent overflow on the right side
      if (rightPosition < padding) {
        rightPosition = padding;
      }
      
      // Calculate tail position relative to the panel
      // Tail should point to button center regardless of panel position
      const panelRightEdge = window.innerWidth - rightPosition;
      const tailRight = panelRightEdge - buttonCenter;
      
      setPosition({
        bottom: '90px',
        right: `${rightPosition}px`,
        tailRight: `${Math.max(10, Math.min(tailRight, panelWidth - 10))}px` // Keep tail within panel bounds
      });
    }
  }, [isOpen, buttonRef]);

  if (!isOpen) return null;

  const questionsToShow = type === 'previous' 
    ? questions.slice(0, currentQuestionIndex)
    : questions.slice(currentQuestionIndex + 1);

  return (
    <div style={{
      position: 'fixed',
      bottom: position.bottom,
      right: position.right,
      zIndex: 1300,
      maxWidth: '300px',
      minWidth: '250px'
    }}>
      {/* Speech Bubble Container */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.98)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: '0.75rem',
        border: '2px solid rgba(139, 92, 246, 0.3)',
        boxShadow: '0 20px 60px rgba(139, 92, 246, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.5) inset',
        padding: '1.25rem',
        position: 'relative',
        animation: 'popIn 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55)'
      }}>
        {/* Speech Bubble Tail */}
        <div style={{
          position: 'absolute',
          bottom: '-12px',
          right: position.tailRight,
          width: 0,
          height: 0,
          borderLeft: '12px solid transparent',
          borderRight: '12px solid transparent',
          borderTop: '12px solid rgba(139, 92, 246, 0.3)'
        }} />
        <div style={{
          position: 'absolute',
          bottom: '-9px',
          right: `calc(${position.tailRight} + 2px)`,
          width: 0,
          height: 0,
          borderLeft: '10px solid transparent',
          borderRight: '10px solid transparent',
          borderTop: '10px solid rgba(255, 255, 255, 0.98)'
        }} />

        {/* Header */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '1rem',
          paddingBottom: '0.75rem',
          borderBottom: '2px solid rgba(139, 92, 246, 0.2)'
        }}>
          <Text fw={700} size="md" style={{ color: '#1e293b' }}>
            Jump to {type === 'previous' ? 'Previous' : 'Next'} Question
          </Text>
          <Button size="sm" variant="glass" onClick={onClose} style={{ padding: '0.25rem 0.5rem' }}>
            ✕
          </Button>
        </div>

        {/* Question List */}
        <Stack spacing="xs" style={{ maxHeight: '300px', overflowY: 'auto', paddingRight: '0.25rem' }}>
          {questionsToShow.length > 0 ? (
            questionsToShow.map((q, idx) => {
              const questionIndex = type === 'previous' ? idx : currentQuestionIndex + 1 + idx;
              return (
                <div
                  key={questionIndex}
                  onClick={() => {
                    onJumpToQuestion(questionIndex);
                    onClose();
                  }}
                  style={{
                    padding: '0.75rem',
                    background: 'rgba(139, 92, 246, 0.05)',
                    border: '1px solid rgba(139, 92, 246, 0.2)',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.1)';
                    e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(139, 92, 246, 0.05)';
                    e.currentTarget.style.borderColor = 'rgba(139, 92, 246, 0.2)';
                  }}
                >
                  <Text fw={600} size="sm" style={{ color: '#1e293b' }}>
                    Question {questionIndex + 1}
                  </Text>
                  <Text size="xs" style={{ color: '#64748b', marginTop: '0.25rem' }}>
                    {q.question?.substring(0, 50)}{q.question?.length > 50 ? '...' : ''}
                  </Text>
                </div>
              );
            })
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#64748b' }}>
              <Text size="sm">No {type === 'previous' ? 'previous' : 'next'} questions.</Text>
            </div>
          )}
        </Stack>
      </div>
    </div>
  );
};

export default QuestionJumpPanel;
