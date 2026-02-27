/**
 * SubmissionCompletePage Component
 * PRD-0019 Task 6.1: Post-submission confirmation page for Writing tests
 * 
 * Displayed after Writing test auto-submission to inform students
 * that their work has been submitted and is awaiting teacher feedback.
 */

import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, CardBody, Button } from '../components/modern';

interface SubmissionCompleteState {
  sessionCode?: string;
  testId?: string;
  studentName?: string;
}

export const SubmissionCompletePage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state as SubmissionCompleteState) || {};
  const { sessionCode, testId, studentName } = state;

  // If no state provided, redirect to home
  React.useEffect(() => {
    if (!sessionCode && !testId) {
      console.warn('[SubmissionComplete] No state provided, redirecting to home');
      navigate('/', { replace: true });
    }
  }, [sessionCode, testId, navigate]);

  const handleReturnToDashboard = () => {
    navigate('/dashboard');
  };

  const handleViewResults = () => {
    if (sessionCode) {
      navigate(`/student-test-results/${sessionCode}`);
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, rgba(250, 245, 255, 0.95) 0%, rgba(240, 249, 255, 0.95) 50%, rgba(240, 253, 250, 0.95) 100%)',
        padding: '2rem',
      }}
    >
      <Card
        variant="glass"
        hover={false}
        style={{
          maxWidth: '600px',
          width: '100%',
        }}
      >
        <CardBody style={{ padding: '3rem', textAlign: 'center' }}>
          {/* Success Icon */}
          <div
            style={{
              fontSize: '5rem',
              marginBottom: '1.5rem',
              animation: 'scaleIn 0.5s ease-out',
            }}
          >
            ✅
          </div>

          {/* Heading */}
          <h1
            style={{
              fontSize: '2rem',
              fontWeight: 800,
              color: '#1e293b',
              marginBottom: '1rem',
              fontFamily: 'Poppins, Inter, sans-serif',
            }}
          >
            Your work has been submitted
          </h1>

          {/* Message */}
          <p
            style={{
              fontSize: '1.125rem',
              color: '#64748b',
              marginBottom: '2rem',
              lineHeight: 1.6,
            }}
          >
            Your test has been successfully submitted and is now awaiting teacher feedback.
            You will be notified once your work has been reviewed.
          </p>

          {/* Student Name (if available) */}
          {studentName && (
            <div
              style={{
                background: 'rgba(139, 92, 246, 0.1)',
                borderRadius: '0.75rem',
                padding: '1rem',
                marginBottom: '2rem',
              }}
            >
              <div
                style={{
                  fontSize: '0.875rem',
                  color: '#64748b',
                  marginBottom: '0.25rem',
                }}
              >
                Submitted by
              </div>
              <div
                style={{
                  fontSize: '1.125rem',
                  fontWeight: 600,
                  color: '#8b5cf6',
                }}
              >
                {studentName}
              </div>
            </div>
          )}

          {/* Info Box */}
          <div
            style={{
              background: 'rgba(59, 130, 246, 0.1)',
              borderLeft: '4px solid #3b82f6',
              borderRadius: '0.5rem',
              padding: '1rem',
              marginBottom: '2rem',
              textAlign: 'left',
            }}
          >
            <div
              style={{
                fontSize: '0.875rem',
                color: '#1e293b',
                lineHeight: 1.6,
              }}
            >
              <strong>What happens next?</strong>
              <ul style={{ margin: '0.5rem 0 0 1.25rem', paddingLeft: 0 }}>
                <li>Your teacher will review your submission</li>
                <li>You'll receive feedback and your score</li>
                <li>Check your dashboard for updates</li>
              </ul>
            </div>
          </div>

          {/* Action Buttons */}
          <div
            style={{
              display: 'flex',
              gap: '1rem',
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <Button
              variant="primary"
              size="lg"
              onClick={handleReturnToDashboard}
              style={{ minWidth: '200px' }}
            >
              Return to Dashboard
            </Button>

            {sessionCode && (
              <Button
                variant="outline"
                size="lg"
                onClick={handleViewResults}
                style={{ minWidth: '200px' }}
              >
                View Results
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      {/* CSS Animations */}
      <style>{`
        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.5);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
};

export default SubmissionCompletePage;
