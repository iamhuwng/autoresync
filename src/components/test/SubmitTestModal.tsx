/**
 * Submit Test Modal Component
 * Confirmation dialog for test submission with answer summary
 * 
 * Features:
 * - Shows answered vs unanswered questions count
 * - Warns about time remaining
 * - Displays list of unanswered questions
 * - Final confirmation step
 * - Cancel option to continue test
 */

import React from 'react';
import { Modal } from '@mantine/core';
import { Button } from '../modern';

interface SubmitTestModalProps {
  /**
   * Whether the modal is open
   */
  opened: boolean;
  
  /**
   * Callback when modal is closed
   */
  onClose: () => void;
  
  /**
   * Callback when test is submitted
   */
  onSubmit: () => void;
  
  /**
   * Total number of questions in test
   */
  totalQuestions: number;
  
  /**
   * Number of answered questions
   */
  answeredCount: number;
  
  /**
   * Array of unanswered question numbers
   */
  unansweredQuestions: number[];
  
  /**
   * Time remaining in seconds (optional)
   */
  timeRemaining?: number;
  
  /**
   * Whether submission is in progress
   */
  isSubmitting?: boolean;
}

export const SubmitTestModal: React.FC<SubmitTestModalProps> = ({
  opened,
  onClose,
  onSubmit,
  totalQuestions,
  answeredCount,
  unansweredQuestions,
  timeRemaining,
  isSubmitting = false,
}) => {
  
  const completionPercentage = Math.round((answeredCount / totalQuestions) * 100);
  const hasUnansweredQuestions = unansweredQuestions.length > 0;
  
  /**
   * Format time remaining
   */
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  };
  
  /**
   * Get warning message based on completion
   */
  const getWarningMessage = (): { text: string; color: string; icon: string } => {
    if (answeredCount === 0) {
      return {
        text: 'You have not answered any questions yet!',
        color: '#ef4444',
        icon: '⚠️',
      };
    }
    
    if (completionPercentage < 50) {
      return {
        text: `Only ${completionPercentage}% of questions answered. Are you sure?`,
        color: '#f59e0b',
        icon: '⚠️',
      };
    }
    
    if (hasUnansweredQuestions) {
      return {
        text: `${unansweredQuestions.length} question${unansweredQuestions.length === 1 ? '' : 's'} left unanswered.`,
        color: '#f59e0b',
        icon: '⚠️',
      };
    }
    
    return {
      text: 'All questions answered. Ready to submit!',
      color: '#10b981',
      icon: '✓',
    };
  };
  
  const warning = getWarningMessage();
  
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Submit Test"
      size="md"
      padding={0}
      closeOnClickOutside={!isSubmitting}
      closeOnEscape={!isSubmitting}
      styles={{
        title: {
          fontSize: '1.5rem',
          fontWeight: 700,
          background: 'linear-gradient(135deg, #8b5cf6 0%, #c084fc 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        },
        header: {
          padding: '1.5rem',
          background: 'rgba(139, 92, 246, 0.05)',
          borderBottom: '1px solid rgba(139, 92, 246, 0.2)',
        },
        body: {
          padding: 0,
        },
        content: {
          borderRadius: '1rem',
          overflow: 'hidden',
        },
      }}
    >
      <div style={{ padding: '1.5rem' }}>
        {/* Warning Message */}
        <div
          style={{
            padding: '1rem',
            marginBottom: '1.5rem',
            background: `${warning.color}15`,
            border: `2px solid ${warning.color}40`,
            borderRadius: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <span style={{ fontSize: '1.5rem' }}>{warning.icon}</span>
          <span
            style={{
              fontSize: '0.9375rem',
              fontWeight: 600,
              color: warning.color,
            }}
          >
            {warning.text}
          </span>
        </div>

        {/* Progress Summary */}
        <div
          style={{
            marginBottom: '1.5rem',
            padding: '1.25rem',
            background: 'rgba(248, 250, 252, 0.8)',
            borderRadius: '0.75rem',
            border: '1px solid #e2e8f0',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.75rem',
            }}
          >
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#475569' }}>
              Progress
            </span>
            <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b' }}>
              {completionPercentage}%
            </span>
          </div>

          {/* Progress Bar */}
          <div
            style={{
              width: '100%',
              height: '0.75rem',
              background: '#e2e8f0',
              borderRadius: '9999px',
              overflow: 'hidden',
              marginBottom: '1rem',
            }}
          >
            <div
              style={{
                width: `${completionPercentage}%`,
                height: '100%',
                background: completionPercentage === 100
                  ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                  : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>

          {/* Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div
              style={{
                padding: '0.75rem',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '0.5rem',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981' }}>
                {answeredCount}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                Answered
              </div>
            </div>

            <div
              style={{
                padding: '0.75rem',
                background: 'rgba(100, 116, 139, 0.1)',
                border: '1px solid rgba(100, 116, 139, 0.3)',
                borderRadius: '0.5rem',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#64748b' }}>
                {unansweredQuestions.length}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                Unanswered
              </div>
            </div>
          </div>
        </div>

        {/* Time Remaining */}
        {timeRemaining !== undefined && timeRemaining > 0 && (
          <div
            style={{
              marginBottom: '1.5rem',
              padding: '1rem',
              background: timeRemaining < 300 
                ? 'rgba(239, 68, 68, 0.1)' 
                : 'rgba(56, 189, 248, 0.1)',
              border: timeRemaining < 300
                ? '1px solid rgba(239, 68, 68, 0.3)'
                : '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '0.5rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#475569' }}>
              Time Remaining
            </span>
            <span
              style={{
                fontSize: '1.125rem',
                fontWeight: 700,
                color: timeRemaining < 300 ? '#ef4444' : '#0284c7',
                fontFamily: 'monospace',
              }}
            >
              {formatTime(timeRemaining)}
            </span>
          </div>
        )}

        {/* Unanswered Questions List */}
        {hasUnansweredQuestions && unansweredQuestions.length <= 20 && (
          <div
            style={{
              marginBottom: '1.5rem',
              padding: '1rem',
              background: 'rgba(251, 146, 60, 0.05)',
              border: '1px solid rgba(251, 146, 60, 0.2)',
              borderRadius: '0.5rem',
            }}
          >
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#475569', marginBottom: '0.5rem' }}>
              Unanswered Questions:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
              {unansweredQuestions.map((num) => (
                <span
                  key={num}
                  style={{
                    padding: '0.25rem 0.5rem',
                    background: 'rgba(251, 146, 60, 0.2)',
                    border: '1px solid rgba(251, 146, 60, 0.4)',
                    borderRadius: '0.375rem',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    color: '#ea580c',
                  }}
                >
                  Q{num}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Confirmation Message */}
        <div
          style={{
            padding: '1rem',
            background: 'rgba(139, 92, 246, 0.05)',
            border: '1px solid rgba(139, 92, 246, 0.2)',
            borderRadius: '0.5rem',
            fontSize: '0.875rem',
            color: '#475569',
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: '#1e293b' }}>Important:</strong> Once submitted, you cannot
          change your answers. Make sure you've reviewed all questions before proceeding.
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '1.5rem',
          borderTop: '1px solid rgba(139, 92, 246, 0.2)',
          background: 'rgba(139, 92, 246, 0.05)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '0.75rem',
        }}
      >
        <Button
          variant="glass"
          onClick={onClose}
          disabled={isSubmitting}
        >
          Continue Test
        </Button>
        <Button
          variant="primary"
          onClick={onSubmit}
          disabled={isSubmitting}
          style={{
            background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
            border: 'none',
          }}
        >
          {isSubmitting ? (
            <>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                style={{ marginRight: '0.5rem', animation: 'spin 1s linear infinite' }}
              >
                <circle cx="12" cy="12" r="10" opacity="0.25" />
                <path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Submitting...
            </>
          ) : (
            <>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
                style={{ marginRight: '0.5rem' }}
              >
                <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />
              </svg>
              Submit Test
            </>
          )}
        </Button>
      </div>

      {/* CSS for spin animation */}
      <style>
        {`
          @keyframes spin {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }
        `}
      </style>
    </Modal>
  );
};
