/**
 * Student Progress Card Component
 * Displays individual student's progress in test monitoring dashboard
 * 
 * Features:
 * - Student name with avatar initial
 * - Progress bar and percentage
 * - Answered question count
 * - Time elapsed display
 * - Status indicator (working/submitted/disconnected)
 * - Click to view details
 */

import React from 'react';
import { Card, CardBody } from '../modern';
import { IntegrityBadge } from './IntegrityBadge'; // PRD-0036

interface StudentProgressCardProps {
  /**
   * Student ID (for future use in detail modals)
   */
  studentId?: string;

  /**
   * Student name
   */
  name: string;

  /**
   * Progress percentage (0-100)
   */
  progress: number;

  /**
   * Number of questions answered
   */
  answeredCount: number;

  /**
   * Total number of questions
   */
  totalQuestions: number;

  /**
   * Time elapsed in milliseconds
   */
  timeElapsed: number;

  /**
   * Student status
   */
  status: 'working' | 'submitted' | 'disconnected';

  /**
   * Current question number (optional)
   */
  currentQuestion?: number;

  /**
   * Recent answers (last 3 answers with question numbers)
   */
  recentAnswers?: Array<{
    questionNumber: number;
    answer: string | string[];
    timestamp: number;
  }>;

  /**
   * IELTS band score (if submitted)
   */
  bandScore?: number;

  /**
   * Click handler to view student details
   */
  onClick?: () => void;

  /**
   * Student accommodation settings
   */
  accommodations?: {
    extraTime?: number;
    unlimitedReplays?: boolean;
    maxReplays?: number;
    fullAudioControls?: boolean;
  } | null;

  /**
   * PRD-0019: Whether base test time has expired
   */
  baseTimeExpired?: boolean;

  /**
   * PRD-0019: Extra time remaining in seconds (for students with accommodations)
   */
  extraTimeRemaining?: number;

  /** PRD-0036: Integrity data for badge display */
  integrityData?: { violationCount: number; riskLevel: 'low' | 'medium' | 'high' };

  /** PRD-0036: Open integrity detail panel */
  onIntegrityClick?: () => void;

  /** PRD-0036: Force-submit this student (teacher action) */
  onForceSubmit?: () => void;

  /** PRD-0036: Reset this student's submission (teacher action) */
  onResetSubmit?: () => void;
}

export const StudentProgressCard: React.FC<StudentProgressCardProps> = ({
  studentId: _studentId,
  name,
  progress,
  answeredCount,
  totalQuestions,
  timeElapsed,
  status,
  currentQuestion,
  recentAnswers: _recentAnswers, // Kept for API compatibility, not displayed
  bandScore,
  onClick,
  accommodations,
  baseTimeExpired, // PRD-0019
  extraTimeRemaining, // PRD-0019
  integrityData, // PRD-0036
  onIntegrityClick,
  onForceSubmit, // PRD-0036
  onResetSubmit, // PRD-0036
}) => {

  /**
   * Get status color
   */
  const getStatusColor = (): { bg: string; border: string; text: string; icon: string } => {
    switch (status) {
      case 'submitted':
        return {
          bg: 'rgba(16, 185, 129, 0.1)',
          border: '#10b981',
          text: '#059669',
          icon: '✓',
        };
      case 'disconnected':
        return {
          bg: 'rgba(239, 68, 68, 0.1)',
          border: '#ef4444',
          text: '#dc2626',
          icon: '⚠',
        };
      default: // working
        return {
          bg: 'rgba(59, 130, 246, 0.1)',
          border: '#3b82f6',
          text: '#2563eb',
          icon: '✎',
        };
    }
  };

  const statusColors = getStatusColor();
  const showForceSubmitAction = (status === 'working' || status === 'disconnected') && !!onForceSubmit;
  const showResetAction = status === 'submitted' && !!onResetSubmit;

  /**
   * Format time elapsed
   */
  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  /**
   * Get avatar initial
   */
  const getInitial = (): string => {
    return name.charAt(0).toUpperCase();
  };

  /**
   * Get avatar color based on name
   */
  const getAvatarColor = (): string => {
    const colors: string[] = [
      '#8b5cf6', // purple
      '#06b6d4', // cyan
      '#10b981', // green
      '#f59e0b', // orange
      '#ef4444', // red
      '#ec4899', // pink
    ];

    // Simple hash based on name
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const index = hash % colors.length;
    return colors[index] as string;
  };

  const handleKeyboardOpen = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onClick || (event.key !== 'Enter' && event.key !== ' ')) {
      return;
    }

    event.preventDefault();
    onClick();
  };

  return (
    <div
      onClick={onClick}
      onKeyDown={handleKeyboardOpen}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `Open details for ${name}` : undefined}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        height: '100%',
        outlineOffset: '3px',
      }}
    >
      <Card
        variant="glass"
        hover={!!onClick}
        style={{
          transition: 'all 0.2s ease',
          height: '100%',
          // PRD-0019: Amber border for students in extra time
          ...(baseTimeExpired && accommodations?.extraTime && extraTimeRemaining && extraTimeRemaining > 0 ? {
            border: '3px solid #f59e0b',
            boxShadow: '0 0 0 1px #fbbf24, 0 4px 12px rgba(251, 191, 36, 0.3)',
          } : {}),
        }}
      >
        <CardBody style={{ padding: '1.25rem' }}>
          {/* Header: Avatar + Name + Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
            {/* Avatar */}
            <div
              style={{
                width: '3rem',
                height: '3rem',
                borderRadius: '50%',
                background: getAvatarColor(),
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.25rem',
                fontWeight: 700,
                flexShrink: 0,
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
              }}
            >
              {getInitial()}
            </div>

            {/* Name + Status */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: '1rem',
                  fontWeight: 700,
                  color: '#1e293b',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginBottom: '0.25rem',
                }}
                title={name || 'Student'}
              >
                {name}
              </div>

              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  padding: '0.125rem 0.5rem',
                  borderRadius: '9999px',
                  background: statusColors.bg,
                  border: `1px solid ${statusColors.border}`,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: statusColors.text,
                }}
              >
                <span>{statusColors.icon}</span>
                <span style={{ textTransform: 'capitalize' }}>{status}</span>
              </div>

              {/* PRD-0036: Integrity Badge */}
              {integrityData && (
                <IntegrityBadge
                  violationCount={integrityData.violationCount}
                  riskLevel={integrityData.riskLevel}
                  onClick={
                    onIntegrityClick
                      ? (event) => {
                          event.stopPropagation();
                          onIntegrityClick();
                        }
                      : undefined
                  }
                />
              )}
            </div>
          </div>


          {/* Accommodations Badge */}
          {accommodations && (
            <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
              {accommodations.extraTime && accommodations.extraTime > 0 && (
                <div
                  style={{
                    padding: '0.125rem 0.375rem',
                    fontSize: '0.625rem',
                    fontWeight: 600,
                    color: '#92400e',
                    background: '#fef3c7',
                    border: '1px solid #fab1a0',
                    borderRadius: '0.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                >
                  <span>⏱️</span>
                  <span>+{Math.round(accommodations.extraTime / 60)}m</span>
                </div>
              )}

              {(accommodations.unlimitedReplays || (accommodations.maxReplays && accommodations.maxReplays > 2)) && (
                <div
                  style={{
                    padding: '0.125rem 0.375rem',
                    fontSize: '0.625rem',
                    fontWeight: 600,
                    color: '#1e40af',
                    background: '#dbeafe',
                    border: '1px solid #bfdbfe',
                    borderRadius: '0.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                >
                  <span>🎧</span>
                  <span>{accommodations.unlimitedReplays ? '∞ Replays' : `${accommodations.maxReplays} Replays`}</span>
                </div>
              )}

              {accommodations.fullAudioControls && (
                <div
                  style={{
                    padding: '0.125rem 0.375rem',
                    fontSize: '0.625rem',
                    fontWeight: 600,
                    color: '#166534',
                    background: '#dcfce7',
                    border: '1px solid #bbf7d0',
                    borderRadius: '0.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                >
                  <span>🎛️</span>
                  <span>Controls</span>
                </div>
              )}
            </div>
          )}

          {/* Progress Bar */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>
                Progress
              </span>
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1e293b' }}>
                {progress}%
              </span>
            </div>

            {/* Progress Bar */}
            <div
              style={{
                width: '100%',
                height: '0.5rem',
                background: '#e2e8f0',
                borderRadius: '9999px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: status === 'submitted'
                    ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                    : status === 'disconnected'
                      ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                      : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  transition: 'width 0.3s ease',
                  borderRadius: '9999px',
                }}
              />
            </div>
          </div>

          {/* Band Score (if submitted) */}
          {bandScore !== undefined && status === 'submitted' && (
            <div
              style={{
                marginBottom: '0.75rem',
                padding: '0.75rem',
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(124, 58, 237, 0.1) 100%)',
                border: '2px solid rgba(139, 92, 246, 0.3)',
                borderRadius: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.5rem' }}>🎯</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#64748b' }}>
                  IELTS Band Score
                </span>
              </div>
              <div
                style={{
                  fontSize: '1.5rem',
                  fontWeight: 800,
                  color: '#8b5cf6',
                  padding: '0.25rem 0.75rem',
                  background: 'white',
                  borderRadius: '0.5rem',
                  boxShadow: '0 2px 4px rgba(139, 92, 246, 0.2)',
                }}
              >
                {bandScore.toFixed(1)}
              </div>
            </div>
          )}

          {/* Current Question (if available) */}
          {currentQuestion && status === 'working' && (
            <div
              style={{
                marginBottom: '0.75rem',
                padding: '0.625rem',
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(147, 51, 234, 0.08) 100%)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2">
                <path d="M9 11H3v2h6v-2zm0 4H3v2h6v-2zm0-8H3v2h6V7zm12 6h-6v2h6v-2zm0 4h-6v2h6v-2zm0-8h-6v2h6V7z" />
              </svg>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#1e293b' }}>
                Currently on Q{currentQuestion}
              </span>
              <div
                style={{
                  marginLeft: 'auto',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#3b82f6',
                  animation: 'pulse 2s ease-in-out infinite',
                }}
              />
            </div>
          )}


          {/* Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            {/* Questions Answered */}
            <div
              style={{
                padding: '0.75rem',
                background: 'rgba(248, 250, 252, 0.8)',
                borderRadius: '0.5rem',
                border: '1px solid #e2e8f0',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>
                Questions
              </div>
              <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#1e293b' }}>
                {answeredCount}/{totalQuestions}
              </div>
            </div>

            {/* Time Elapsed */}
            <div
              style={{
                padding: '0.75rem',
                background: 'rgba(248, 250, 252, 0.8)',
                borderRadius: '0.5rem',
                border: '1px solid #e2e8f0',
              }}
            >
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.25rem' }}>
                Time
              </div>
              <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#1e293b' }}>
                {formatTime(timeElapsed)}
              </div>
            </div>
          </div>

          {/* Add pulse animation */}
          <style>{`
          @keyframes pulse {
            0%, 100% {
              opacity: 1;
              transform: scale(1);
            }
            50% {
              opacity: 0.5;
              transform: scale(1.2);
            }
          }
        `}</style>

          {/* PRD-0036: Teacher submission controls */}
          {(showForceSubmitAction || showResetAction) && (
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              {showForceSubmitAction && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm('Force submit this student? Their current answers will be submitted.')) {
                      onForceSubmit();
                    }
                  }}
                  style={{
                    border: '1px solid #ef4444',
                    color: '#ef4444',
                    background: 'transparent',
                    fontSize: '0.75rem',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Force Submit
                </button>
              )}
              {showResetAction && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm('Reset this student\'s submission? They will be returned to the active test if it is still running.')) {
                      onResetSubmit();
                    }
                  }}
                  style={{
                    border: '1px solid #94a3b8',
                    color: '#64748b',
                    background: 'transparent',
                    fontSize: '0.75rem',
                    padding: '4px 8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Reset
                </button>
              )}
            </div>
          )}

          {/* Click hint */}
          {onClick && (
            <div
              style={{
                marginTop: '1rem',
                paddingTop: '0.75rem',
                borderTop: '1px solid #e2e8f0',
                fontSize: '0.75rem',
                color: '#64748b',
                textAlign: 'center',
                fontWeight: 500,
              }}
            >
              Click to view details →
            </div>
          )}

          {/* PRD-0019: Extra Time Remaining Badge (shown when base time expired) */}
          {baseTimeExpired && accommodations?.extraTime && extraTimeRemaining !== undefined && extraTimeRemaining > 0 && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.75rem',
                background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                borderRadius: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 2px 8px rgba(251, 191, 36, 0.3)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.25rem' }}>⏰</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#78350f' }}>
                  Extra Time
                </span>
              </div>
              <div
                style={{
                  fontSize: '1.25rem',
                  fontWeight: 800,
                  color: '#ffffff',
                  padding: '0.25rem 0.75rem',
                  background: 'rgba(255, 255, 255, 0.25)',
                  borderRadius: '0.375rem',
                }}
              >
                {Math.floor(extraTimeRemaining / 60)}:{String(extraTimeRemaining % 60).padStart(2, '0')}
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
};
