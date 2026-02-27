/**
 * WaitTimePopup Component
 * Shows a countdown popup between IELTS Listening sections
 * 
 * Features:
 * - Bottom-right positioning
 * - Slowly disappearing animation
 * - Countdown timer display
 * - Pauses main test timer
 */

import React, { useState, useEffect } from 'react';

interface WaitTimePopupProps {
  waitTime: number; // seconds
  currentSection: number;
  nextSection: number;
  onComplete: () => void;
  isVisible: boolean;
}

export const WaitTimePopup: React.FC<WaitTimePopupProps> = ({
  waitTime,
  currentSection,
  nextSection,
  onComplete,
  isVisible
}) => {
  const [timeRemaining, setTimeRemaining] = useState(waitTime);
  const [opacity, setOpacity] = useState(1);
  const [isAnimating, setIsAnimating] = useState(false);

  // Reset when popup becomes visible
  useEffect(() => {
    if (isVisible) {
      setTimeRemaining(waitTime);
      setOpacity(1);
      setIsAnimating(false);
    }
  }, [isVisible, waitTime]);

  // Countdown timer
  useEffect(() => {
    if (!isVisible || timeRemaining <= 0) return;

    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          // Start fade out animation in last 2 seconds
          setIsAnimating(true);
          return 0;
        }
        
        // Start fading at 3 seconds
        if (prev <= 3) {
          setOpacity((prev - 1) / 2);
        }
        
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isVisible, timeRemaining]);

  // Call onComplete when countdown reaches zero (outside of setState to avoid React warning)
  useEffect(() => {
    if (isVisible && timeRemaining === 0) {
      onComplete();
    }
  }, [isVisible, timeRemaining, onComplete]);

  // Don't render if not visible
  if (!isVisible) return null;

  return (
    <div
      className="wait-time-popup"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(12px)',
        color: 'white',
        padding: '20px 24px',
        borderRadius: '12px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 10px 10px -5px rgba(0, 0, 0, 0.2)',
        minWidth: '280px',
        maxWidth: '320px',
        opacity: opacity,
        transform: isAnimating ? 'translateY(20px)' : 'translateY(0)',
        transition: 'all 0.5s ease-out',
        zIndex: 9999
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '12px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ fontSize: '20px' }}>⏳</span>
          <span style={{
            fontSize: '14px',
            fontWeight: '600',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            Section Break
          </span>
        </div>
        <div style={{
          backgroundColor: 'rgba(59, 130, 246, 0.2)',
          padding: '4px 8px',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: '600'
        }}>
          {timeRemaining}s
        </div>
      </div>

      {/* Progress Bar */}
      <div style={{
        height: '4px',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '2px',
        overflow: 'hidden',
        marginBottom: '12px'
      }}>
        <div style={{
          height: '100%',
          backgroundColor: '#3b82f6',
          borderRadius: '2px',
          width: `${(timeRemaining / waitTime) * 100}%`,
          transition: 'width 1s linear'
        }} />
      </div>

      {/* Message */}
      <div style={{
        fontSize: '13px',
        color: 'rgba(255, 255, 255, 0.9)',
        marginBottom: '8px'
      }}>
        Preparing <strong>Section {nextSection}</strong>
      </div>
      
      <div style={{
        fontSize: '11px',
        color: 'rgba(255, 255, 255, 0.6)',
        lineHeight: '1.4'
      }}>
        You may review your answers from Section {currentSection} during this break.
      </div>

      {/* Timer Status */}
      <div style={{
        marginTop: '12px',
        paddingTop: '12px',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '11px',
        color: 'rgba(255, 255, 255, 0.5)'
      }}>
        <div style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: '#fbbf24',
          animation: 'pulse 2s infinite'
        }} />
        Test timer paused
      </div>

      {/* Animation keyframes */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};
