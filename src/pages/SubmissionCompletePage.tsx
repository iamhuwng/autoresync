/**
 * SubmissionCompletePage
 * Post-submission confirmation page for IELTS Writing tests.
 */

import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ROUTES } from '../constants/routes';
import { useFeatureTracking } from '../hooks/useFeatureTracking';
import { Card, CardBody, Button } from '../components/modern';

interface SubmissionCompleteState {
  sessionCode?: string;
  testId?: string;
  studentName?: string;
}

export const SubmissionCompletePage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { trackAction } = useFeatureTracking('results');
  const state = (location.state as SubmissionCompleteState) || {};
  const { sessionCode, testId, studentName } = state;

  React.useEffect(() => {
    if (!sessionCode && !testId) {
      console.warn('[SubmissionComplete] No state provided, redirecting to login');
      navigate(ROUTES.LOGIN, { replace: true });
    }
  }, [navigate, sessionCode, testId]);

  const handleReturnToDashboard = () => {
    trackAction('returnToDashboard', {
      source: 'submission_complete',
      hasSessionCode: Boolean(sessionCode),
    });
    navigate(ROUTES.STUDENT_DASHBOARD, { replace: true });
  };

  return (
    <div
      className="student-view-root"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f3f4f6',
        padding: '2rem',
      }}
    >
      <Card
        variant="default"
        hover={false}
        style={{
          maxWidth: '600px',
          width: '100%',
          border: '1px solid #e5e7eb',
          borderRadius: '24px',
          boxShadow: '0 20px 45px rgba(15, 23, 42, 0.08)',
        }}
      >
        <CardBody style={{ padding: '3rem', textAlign: 'center' }}>
          <div
            style={{
              marginBottom: '1.5rem',
              display: 'flex',
              justifyContent: 'center',
              animation: 'scaleIn 0.5s ease-out',
            }}
          >
            <div
              style={{
                width: '5rem',
                height: '5rem',
                borderRadius: '999px',
                background: '#dcfce7',
                color: '#166534',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                style={{ width: '2.5rem', height: '2.5rem' }}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>

          <h1
            style={{
              fontSize: '2rem',
              fontWeight: 800,
              color: '#111827',
              marginBottom: '1rem',
              fontFamily: 'Inter, sans-serif',
            }}
          >
            Your work has been submitted
          </h1>

          <p
            style={{
              fontSize: '1.125rem',
              color: '#374151',
              marginBottom: '2rem',
              lineHeight: 1.6,
            }}
          >
            Your IELTS Writing test has been submitted successfully. This test is graded manually by
            your teacher, so there is no instant score or AI feedback after submission.
          </p>

          {studentName && (
            <div
              style={{
                background: '#f9fafb',
                border: '1px solid #e5e7eb',
                borderRadius: '1rem',
                padding: '1rem',
                marginBottom: '2rem',
              }}
            >
              <div
                style={{
                  fontSize: '0.875rem',
                  color: '#6b7280',
                  marginBottom: '0.25rem',
                }}
              >
                Submitted by
              </div>
              <div
                style={{
                  fontSize: '1.125rem',
                  fontWeight: 600,
                  color: '#111827',
                }}
              >
                {studentName}
              </div>
            </div>
          )}

          <div
            style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '1rem',
              padding: '1.25rem',
              marginBottom: '2rem',
              textAlign: 'left',
            }}
          >
            <div
              style={{
                fontSize: '0.875rem',
                color: '#1f2937',
                lineHeight: 1.6,
              }}
            >
              <strong>What happens next?</strong>
              <ul style={{ margin: '0.5rem 0 0 1.25rem', paddingLeft: 0 }}>
                <li>Your teacher will hand-grade your writing submission.</li>
                <li>Your result will appear after your teacher finishes the review.</li>
                <li>Check your dashboard later, or contact your teacher if you need an update.</li>
              </ul>
            </div>
          </div>

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
          </div>
        </CardBody>
      </Card>

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
