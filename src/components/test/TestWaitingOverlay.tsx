/**
 * TestWaitingOverlay Component
 * Shows overlay when test is waiting to start or paused
 */

import React from 'react';

interface TestWaitingOverlayProps {
  sessionStatus: 'waiting' | 'in-progress' | 'completed';
  isPaused: boolean;
  sessionCode: string | undefined;
}

export const TestWaitingOverlay: React.FC<TestWaitingOverlayProps> = ({
  sessionStatus,
  isPaused,
  sessionCode,
}) => {
  if (sessionStatus !== 'waiting' && !isPaused) {
    return null;
  }

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        background: 'white',
        borderRadius: '1rem',
        padding: '3rem',
        textAlign: 'center',
        maxWidth: '500px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>
          {sessionStatus === 'waiting' ? '⏳' : '⏸️'}
        </div>
        <h2 style={{ 
          fontSize: '1.875rem', 
          fontWeight: '700', 
          color: '#1e293b',
          marginBottom: '0.75rem'
        }}>
          {sessionStatus === 'waiting' ? 'Waiting for Teacher to Start' : 'Test Paused'}
        </h2>
        <p style={{ 
          fontSize: '1.125rem', 
          color: '#64748b',
          marginBottom: '1.5rem'
        }}>
          {sessionStatus === 'waiting' 
            ? 'The test will begin when your teacher starts the session.'
            : 'Your teacher has paused the test. Please wait for them to resume.'}
        </p>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.75rem 1.5rem',
          background: '#f1f5f9',
          borderRadius: '0.5rem',
          fontSize: '0.875rem',
          fontWeight: '600',
          color: '#475569',
        }}>
          <span>Session Code:</span>
          <span style={{ 
            fontFamily: 'monospace', 
            fontSize: '1rem',
            color: '#8b5cf6',
            fontWeight: '700'
          }}>
            {sessionCode}
          </span>
        </div>
      </div>
    </div>
  );
};
