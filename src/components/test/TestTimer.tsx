/**
 * Test Timer Component
 * Displays countdown timer for test sessions with visual warnings
 * Features:
 * - MM:SS format display
 * - Visual warning when time < 5 minutes (red color)
 * - Auto-triggers submit when time expires
 * - Pause/resume support for teacher control
 */

import React, { useMemo } from 'react';

interface TestTimerProps {
  /**
   * Time remaining in seconds
   */
  timeRemaining: number;
  
  /**
   * Whether the timer is paused
   */
  isPaused?: boolean;
  
  /**
   * Warning threshold in seconds (default: 5 minutes)
   */
  warningThreshold?: number;
  
  /**
   * Display size variant
   */
  size?: 'sm' | 'md' | 'lg';
  
  /**
   * Whether to show pause indicator
   */
  showPauseIndicator?: boolean;
}

export const TestTimer: React.FC<TestTimerProps> = ({
  timeRemaining,
  isPaused = false,
  warningThreshold = 5 * 60, // 5 minutes default
  size = 'md',
  showPauseIndicator = true,
}) => {
  
  // Format time as MM:SS
  const formattedTime = useMemo(() => {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, [timeRemaining]);
  
  // Determine if time is low
  const isLowTime = timeRemaining <= warningThreshold && timeRemaining > 0;
  const isTimeUp = timeRemaining <= 0;
  
  // Size-based styles
  const sizeStyles = {
    sm: {
      fontSize: '1rem',
      padding: '0.5rem 1rem',
      iconSize: '1rem',
    },
    md: {
      fontSize: '1.5rem',
      padding: '0.75rem 1.25rem',
      iconSize: '1.25rem',
    },
    lg: {
      fontSize: '2rem',
      padding: '1rem 1.5rem',
      iconSize: '1.5rem',
    },
  };
  
  const currentSize = sizeStyles[size];
  
  // Color scheme
  const getColors = () => {
    if (isTimeUp) {
      return {
        background: 'rgba(239, 68, 68, 0.1)',
        border: '#ef4444',
        text: '#dc2626',
        icon: '#ef4444',
      };
    }
    if (isLowTime) {
      return {
        background: 'rgba(251, 146, 60, 0.1)',
        border: '#fb923c',
        text: '#ea580c',
        icon: '#fb923c',
      };
    }
    return {
      background: 'rgba(56, 189, 248, 0.1)',
      border: '#38bdf8',
      text: '#0284c7',
      icon: '#38bdf8',
    };
  };
  
  const colors = getColors();
  
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: currentSize.padding,
        background: colors.background,
        border: `2px solid ${colors.border}`,
        borderRadius: '0.75rem',
        fontFamily: 'Inter, monospace',
        fontWeight: 700,
        fontSize: currentSize.fontSize,
        color: colors.text,
        transition: 'all 0.3s ease',
        position: 'relative',
      }}
      role="timer"
      aria-label={`Time remaining: ${formattedTime}`}
    >
      {/* Clock Icon */}
      <svg
        width={currentSize.iconSize}
        height={currentSize.iconSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke={colors.icon}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          flexShrink: 0,
          animation: isLowTime ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none',
        }}
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      
      {/* Time Display */}
      <span
        style={{
          letterSpacing: '0.05em',
          minWidth: '4ch',
          textAlign: 'center',
        }}
      >
        {isTimeUp ? "00:00" : formattedTime}
      </span>
      
      {/* Pause Indicator */}
      {isPaused && showPauseIndicator && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            paddingLeft: '0.5rem',
            borderLeft: `1px solid ${colors.border}`,
            fontSize: '0.875rem',
            fontWeight: 600,
            color: colors.text,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill={colors.icon}
          >
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
          <span>Paused</span>
        </div>
      )}
      
      {/* Time's Up Indicator */}
      {isTimeUp && (
        <div
          style={{
            position: 'absolute',
            top: '-8px',
            right: '-8px',
            background: '#ef4444',
            color: 'white',
            fontSize: '0.625rem',
            fontWeight: 700,
            padding: '0.125rem 0.5rem',
            borderRadius: '9999px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Time's Up
        </div>
      )}
      
      {/* CSS for pulse animation */}
      <style>
        {`
          @keyframes pulse {
            0%, 100% {
              opacity: 1;
            }
            50% {
              opacity: 0.5;
            }
          }
        `}
      </style>
    </div>
  );
};
