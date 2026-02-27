/**
 * Session Control Panel Component
 * Control panel for managing test sessions (teacher view)
 * 
 * Features:
 * - Pause/Resume test
 * - Extend time
 * - End test session
 * - Session status display
 * - Quick actions toolbar
 */

import React, { useState } from 'react';
import { Card, CardBody } from '../modern';
import { Button } from '../modern';

interface SessionControlPanelProps {
  /**
   * Current session status
   */
  sessionStatus: 'active' | 'paused' | 'ended';
  
  /**
   * Whether test is currently paused
   */
  isPaused: boolean;
  
  /**
   * Time remaining in seconds (optional)
   */
  timeRemaining?: number;
  
  /**
   * Pause/resume handler
   */
  onPauseResume: () => void;
  
  /**
   * Extend time handler
   */
  onExtendTime: (minutes: number) => void;
  
  /**
   * End session handler
   */
  onEndSession: () => void;
  
  /**
   * Disabled state (e.g., during loading)
   */
  disabled?: boolean;
}

export const SessionControlPanel: React.FC<SessionControlPanelProps> = ({
  sessionStatus,
  isPaused,
  timeRemaining,
  onPauseResume,
  onExtendTime,
  onEndSession,
  disabled = false,
}) => {
  
  const [showExtendOptions, setShowExtendOptions] = useState(false);
  
  /**
   * Format time
   */
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };
  
  /**
   * Get status color
   */
  const getStatusColor = () => {
    switch (sessionStatus) {
      case 'active':
        return { bg: 'rgba(16, 185, 129, 0.1)', border: '#10b981', text: '#059669' };
      case 'paused':
        return { bg: 'rgba(251, 146, 60, 0.1)', border: '#fb923c', text: '#ea580c' };
      case 'ended':
        return { bg: 'rgba(100, 116, 139, 0.1)', border: '#64748b', text: '#475569' };
      default:
        return { bg: 'rgba(59, 130, 246, 0.1)', border: '#3b82f6', text: '#2563eb' };
    }
  };
  
  const statusColor = getStatusColor();
  
  /**
   * Handle extend time click
   */
  const handleExtendTime = (minutes: number) => {
    onExtendTime(minutes);
    setShowExtendOptions(false);
  };
  
  /**
   * Handle end session with confirmation
   */
  const handleEndSession = () => {
    if (window.confirm('Are you sure you want to end this test session? All students will be able to see their results.')) {
      onEndSession();
    }
  };
  
  return (
    <Card variant="glass">
      <CardBody style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: '#1e293b' }}>
              Session Controls
            </h3>
            
            {/* Status Badge */}
            <div
              style={{
                padding: '0.5rem 1rem',
                background: statusColor.bg,
                border: `2px solid ${statusColor.border}`,
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: statusColor.text,
                textTransform: 'capitalize',
              }}
            >
              {isPaused ? 'Paused' : sessionStatus}
            </div>
          </div>
          
          {/* Time Remaining */}
          {timeRemaining !== undefined && (
            <div
              style={{
                padding: '1rem',
                background: timeRemaining < 300
                  ? 'rgba(239, 68, 68, 0.1)'
                  : 'rgba(56, 189, 248, 0.1)',
                border: timeRemaining < 300
                  ? '2px solid #ef4444'
                  : '2px solid #38bdf8',
                borderRadius: '0.75rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748b' }}>
                Time Remaining
              </span>
              <span
                style={{
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  color: timeRemaining < 300 ? '#ef4444' : '#0284c7',
                  fontFamily: 'monospace',
                }}
              >
                {formatTime(timeRemaining)}
              </span>
            </div>
          )}
          
          {/* Action Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {/* Pause/Resume Button */}
            <Button
              variant={isPaused ? 'success' : 'warning'}
              onClick={onPauseResume}
              disabled={disabled || sessionStatus === 'ended'}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1rem',
              }}
            >
              {isPaused ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Resume
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </svg>
                  Pause
                </>
              )}
            </Button>
            
            {/* Extend Time Button */}
            <div style={{ position: 'relative' }}>
              <Button
                variant="info"
                onClick={() => setShowExtendOptions(!showExtendOptions)}
                disabled={disabled || sessionStatus === 'ended'}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  padding: '0.75rem 1rem',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                Extend Time
              </Button>
              
              {/* Extend Options Dropdown */}
              {showExtendOptions && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    marginTop: '0.5rem',
                    background: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.5rem',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                    zIndex: 10,
                    overflow: 'hidden',
                  }}
                >
                  {[5, 10, 15, 30].map((minutes) => (
                    <button
                      key={minutes}
                      onClick={() => handleExtendTime(minutes)}
                      style={{
                        width: '100%',
                        padding: '0.75rem 1rem',
                        background: 'transparent',
                        border: 'none',
                        textAlign: 'left',
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        color: '#1e293b',
                        cursor: 'pointer',
                        transition: 'background 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(59, 130, 246, 0.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      +{minutes} minutes
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* End Session Button */}
          <Button
            variant="danger"
            onClick={handleEndSession}
            disabled={disabled || sessionStatus === 'ended'}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '0.75rem 1rem',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            End Test Session
          </Button>
          
          {/* Help Text */}
          <div
            style={{
              fontSize: '0.75rem',
              color: '#64748b',
              padding: '0.75rem',
              background: 'rgba(248, 250, 252, 0.8)',
              borderRadius: '0.5rem',
              lineHeight: 1.5,
            }}
          >
            <strong>Tip:</strong> Pause the test to freeze all student timers. Extend time to give students more time to complete. End the session when all students have submitted or time is up.
          </div>
        </div>
      </CardBody>
    </Card>
  );
};
