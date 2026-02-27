/**
 * ReMarkingModal Component
 * Shows re-marking information when teacher updates scores
 */

import React from 'react';

interface ReMarkingData {
  score: number;
  maxScore: number;
  correctCount: number;
  reMarkDetails?: Record<string, number>;
}

interface ReMarkingModalProps {
  show: boolean;
  reMarkingData: ReMarkingData | null;
  totalQuestions: number;
  onClose: () => void;
}

export const ReMarkingModal: React.FC<ReMarkingModalProps> = ({
  show,
  reMarkingData,
  totalQuestions,
  onClose,
}) => {
  if (!show || !reMarkingData) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      backdropFilter: 'blur(4px)'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '1rem',
        padding: '2rem',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '80vh',
        overflow: 'auto',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)'
      }}>
        <div style={{
          textAlign: 'center',
          marginBottom: '2rem'
        }}>
          <div style={{
            fontSize: '3rem',
            marginBottom: '1rem'
          }}>
            📝
          </div>
          <h2 style={{
            fontSize: '2rem',
            fontWeight: 700,
            background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            marginBottom: '0.5rem'
          }}>
            Test Re-marked!
          </h2>
          <p style={{
            fontSize: '1rem',
            color: '#64748b'
          }}>
            Your teacher has updated your test marking
          </p>
        </div>
        
        <div style={{
          background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(99, 102, 241, 0.1) 100%)',
          borderRadius: '0.5rem',
          padding: '1.5rem',
          marginBottom: '2rem'
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1.5rem',
            marginBottom: '1rem'
          }}>
            <div>
              <div style={{ fontSize: '0.875rem', color: '#64748b' }}>Total Score</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#7c3aed' }}>
                {reMarkingData.score} / {reMarkingData.maxScore}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', color: '#64748b' }}>Correct Answers</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: '#7c3aed' }}>
                {reMarkingData.correctCount} / {totalQuestions}
              </div>
            </div>
          </div>
          <div style={{
            fontSize: '1.25rem',
            fontWeight: 600,
            color: '#10b981',
            textAlign: 'center'
          }}>
            {Math.round((reMarkingData.score / reMarkingData.maxScore) * 100)}% Score
          </div>
        </div>
        
        {reMarkingData.reMarkDetails && Object.keys(reMarkingData.reMarkDetails).length > 0 && (
          <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>
              Question Adjustments:
            </h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
              gap: '0.5rem'
            }}>
              {Object.entries(reMarkingData.reMarkDetails).map(([qNum, score]) => (
                <div
                  key={qNum}
                  style={{
                    padding: '0.5rem',
                    background: Number(score) > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    borderRadius: '0.25rem',
                    textAlign: 'center',
                    fontSize: '0.875rem'
                  }}
                >
                  <div style={{ fontWeight: 600 }}>Q{qNum}</div>
                  <div style={{ color: Number(score) > 0 ? '#10b981' : '#ef4444' }}>
                    {Number(score) > 0 ? '✓' : '✗'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <button
          onClick={onClose}
          style={{
            width: '100%',
            padding: '1rem',
            background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '0.5rem',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'transform 0.2s ease'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          Got it!
        </button>
      </div>
    </div>
  );
};
