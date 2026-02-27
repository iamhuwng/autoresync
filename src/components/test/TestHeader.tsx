/**
 * TestHeader Component
 * Displays test information, timer, and submit button
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionService } from '../../services/sessionService';

interface TestHeaderProps {
  testTitle: string;
  testType: string;
  testSkill: string;
  studentName: string;
  answeredCount: number;
  totalQuestions: number;
  timeRemaining: number;
  formatTime: (seconds: number) => string;
  sessionStatus: 'waiting' | 'in-progress' | 'completed';
  isPaused: boolean;
  isSubmitting: boolean;
  testSubmitted: boolean;
  testResults: {
    correctAnswers: number;
    bandScore?: number;
  } | null;
  onSubmit: () => void;
  mode?: 'live' | 'solo';
  onSettingsClick?: () => void;
  onBack?: () => void;
}

export const TestHeader: React.FC<TestHeaderProps> = ({
  testTitle,
  testType,
  testSkill,
  studentName,
  answeredCount,
  totalQuestions,
  timeRemaining,
  formatTime,
  sessionStatus,
  isPaused,
  isSubmitting,
  testSubmitted,
  testResults,
  onSubmit,
  mode = 'live',
  onSettingsClick,
  onBack,
}) => {
  const navigate = useNavigate();

  const isSoloMode = mode === 'solo';

  const handleReturnHome = () => {
    if (isSoloMode) {
      navigate('/student/dashboard');
    } else {
      // Clear session data and return to login
      sessionService.clearSession();
      navigate('/');
    }
  };

  return (
    <div style={{
      height: '60px',
      background: 'white',
      borderBottom: '1px solid #e2e8f0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 1.5rem',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        {/* Back button */}
        {onBack && !testSubmitted && (
          <button
            onClick={onBack}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.4rem',
              color: '#64748b',
              borderRadius: '0.375rem',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#1e293b'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b'; }}
            title="Go back"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
        )}
        <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#1e293b' }}>
          {testTitle}
        </div>
        <div style={{
          fontSize: '0.8125rem',
          fontWeight: 600,
          color: '#64748b',
          padding: '0.25rem 0.75rem',
          background: '#f1f5f9',
        }}>
          {testType} {testSkill}
        </div>

        {isSoloMode && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.1)',
            color: '#10b981',
            fontSize: '0.8125rem',
            fontWeight: 600,
            padding: '0.25rem 0.75rem',
            borderRadius: '0.375rem'
          }}>
            Solo Practice
          </div>
        )}

        <div style={{
          fontSize: '0.875rem',
          fontWeight: 600,
          color: '#8b5cf6',
          padding: '0.25rem 0.75rem',
          background: 'rgba(139, 92, 246, 0.1)',
          borderRadius: '0.375rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
        }}>
          👤 {studentName}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        {/* Answer Counter / Results */}
        <div style={{
          fontSize: '1rem',
          fontWeight: testSubmitted ? 700 : 600,
          color: testSubmitted ? '#ef4444' : '#10b981',
          padding: '0.375rem 0.75rem',
          background: testSubmitted ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
          borderRadius: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.375rem',
        }}>
          {testSubmitted ? (
            <>
              ✓ <span style={{ fontWeight: 700 }}>{testResults?.correctAnswers || 0}</span>/{totalQuestions}
              {testResults?.bandScore !== undefined && (
                <span style={{
                  marginLeft: '0.5rem',
                  padding: '0.25rem 0.5rem',
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                  color: 'white',
                  borderRadius: '0.375rem',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                }}>
                  Band {testResults.bandScore.toFixed(1)}
                </span>
              )}
            </>
          ) : (
            <>
              📝 {answeredCount}/{totalQuestions}
            </>
          )}
        </div>

        {isSoloMode && (
          <button
            onClick={onSettingsClick}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.5rem',
              color: '#64748b',
              borderRadius: '0.375rem',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            title="Practice Settings"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6"></line>
              <line x1="4" y1="12" x2="20" y2="12"></line>
              <line x1="4" y1="18" x2="20" y2="18"></line>
            </svg>
          </button>
        )}

        {/* Timer */}
        <div style={{
          fontSize: '1.125rem',
          fontWeight: 700,
          color: sessionStatus === 'waiting' ? '#94a3b8' : (timeRemaining < 300 ? '#ef4444' : '#1e293b')
        }}>
          ⏱️ {sessionStatus === 'waiting' ? '--:--' : formatTime(timeRemaining)}
          {isPaused && sessionStatus === 'in-progress' && (
            <span style={{
              marginLeft: '0.5rem',
              fontSize: '0.875rem',
              color: '#f59e0b',
              fontWeight: 600,
            }}>
              (PAUSED)
            </span>
          )}
        </div>

        {/* Submit button / Return Home button */}
        {testSubmitted ? (
          <button
            onClick={handleReturnHome}
            style={{
              padding: '0.5rem 1.5rem',
              background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {isSoloMode ? 'Back to Dashboard' : 'Return to Home Page'}
          </button>
        ) : (
          <button
            onClick={onSubmit}
            disabled={isSubmitting || sessionStatus === 'waiting'}
            style={{
              padding: '0.5rem 1.5rem',
              background: (isSubmitting || sessionStatus === 'waiting')
                ? '#94a3b8'
                : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: (isSubmitting || sessionStatus === 'waiting') ? 'not-allowed' : 'pointer',
            }}
          >
            {isSubmitting
              ? 'Submitting...'
              : (sessionStatus === 'waiting' ? 'Waiting to Start' : 'Submit Test')}
          </button>
        )}
      </div>
    </div>
  );
};
