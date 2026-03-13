import React from 'react';
import { Card, CardBody, Button } from './modern';
import './SessionBanner.css';

const SessionBanner = ({ sessionCode, sessionData, onBackToSessions, onReturnToMonitor, onReturnToQuiz }) => {
  if (!sessionCode) return null;

  const isTest = sessionData?.mode === 'test';

  return (
    <>
      {/* Session Code Banner */}
      <Card
        variant="lavender"
        style={{
          marginBottom: '2rem',
          animation: 'slideUp 0.5s ease-out 0.05s backwards',
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(192, 132, 252, 0.1) 100%)',
          border: '2px solid rgba(139, 92, 246, 0.3)'
        }}
      >
        <CardBody>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
              <div style={{ fontSize: '3rem', filter: 'grayscale(0%)' }}>🎯</div>
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#8b5cf6', marginBottom: '0.25rem' }}>
                  ACTIVE SESSION
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div className="session-banner__code">{sessionCode}</div>
                  <div className={`session-banner__mode-badge ${isTest ? 'session-banner__mode-badge--test' : 'session-banner__mode-badge--quiz'}`}>
                    {isTest ? '📝 Test' : '🎮 Quiz'}
                  </div>
                </div>
                <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.5rem' }}>
                  Share this code with students to join the session
                </div>
                {(sessionData?.quizId === 'pending' || sessionData?.testId === 'pending') && (
                  <div style={{
                    fontSize: '0.875rem', color: '#f59e0b', marginTop: '0.5rem',
                    fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.5rem'
                  }}>
                    <span>⚠️</span>
                    <span>Select a quiz or test below to start</span>
                  </div>
                )}
              </div>
            </div>
            <Button
              variant="glass"
              size="md"
              onClick={onBackToSessions}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '0.5rem' }}>
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              Back to Sessions
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Active Session Alert */}
      {sessionData && (
        sessionData.status === 'in-progress' ||
        (sessionData.mode === 'test' && sessionData.testId && sessionData.testId !== 'pending') ||
        (sessionData.mode === 'quiz' && sessionData.quizId && sessionData.quizId !== 'pending')
      ) && (
        <Card
          variant="glass"
          style={{
            marginBottom: '2rem',
            animation: 'slideUp 0.5s ease-out 0.1s backwards',
            background: isTest
              ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(5, 150, 105, 0.1) 100%)'
              : 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(99, 102, 241, 0.1) 100%)',
            border: isTest
              ? '2px solid rgba(16, 185, 129, 0.3)'
              : '2px solid rgba(139, 92, 246, 0.3)'
          }}
        >
          <CardBody>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: '1.5rem', flexWrap: 'wrap'
            }}>
              <div style={{ flex: '1 1 300px' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem'
                }}>
                  <div
                    className="session-banner__pulse"
                    style={{
                      background: isTest ? '#10b981' : '#8b5cf6',
                      boxShadow: `0 0 0 4px ${isTest ? 'rgba(16, 185, 129, 0.2)' : 'rgba(139, 92, 246, 0.2)'}`,
                    }}
                  />
                  <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#1e293b', margin: 0 }}>
                    {sessionData.status === 'in-progress'
                      ? `${isTest ? '📝 Test' : '🎮 Quiz'} in Progress`
                      : `${isTest ? '📝 Test' : '🎮 Quiz'} Ready`
                    }
                  </h3>
                </div>
                <p style={{ fontSize: '0.875rem', color: '#64748b', margin: 0 }}>
                  {sessionData.status === 'in-progress'
                    ? (isTest
                      ? 'Students are currently taking the test. Click below to return to the monitoring dashboard.'
                      : 'The quiz session is currently active. Click below to return and continue.')
                    : (isTest
                      ? 'Test is selected and ready to start. Click below to return to the monitor page.'
                      : 'Quiz is selected and ready to start. Click below to return to the quiz page.')
                  }
                </p>
              </div>
              <Button
                variant="primary"
                size="lg"
                onClick={() => {
                  if (isTest) {
                    onReturnToMonitor(sessionCode);
                  } else {
                    onReturnToQuiz(sessionCode);
                  }
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.5rem' }}>
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                </svg>
                {sessionData.status === 'in-progress' ? 'Return to' : 'Go to'} {isTest ? 'Monitor' : 'Quiz'}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}
    </>
  );
};

export default SessionBanner;
