/**
 * Test Parsing Section
 * Displays parsing progress with AI integration
 * Leverages hybrid parser and progress tracking
 */

import React from 'react';
import { Card, CardBody } from '../modern';

interface TestParsingSectionProps {
  isParsing: boolean;
  progress: number;
  stage: string;
}

export const TestParsingSection: React.FC<TestParsingSectionProps> = ({
  isParsing,
  progress,
  stage,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Parsing Header */}
      <Card variant="glass">
        <CardBody>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
              {isParsing ? '⚙️' : progress === 100 ? '✅' : '⏸️'}
            </div>
            <h3 style={{
              fontSize: '1.25rem',
              fontWeight: '700',
              color: '#1e293b',
              marginBottom: '0.5rem',
              margin: 0
            }}>
              {isParsing ? 'Parsing Document...' : progress === 100 ? 'Parsing Complete!' : 'Ready to Parse'}
            </h3>
            <p style={{
              fontSize: '0.875rem',
              color: '#64748b',
              margin: '0.5rem 0 0 0'
            }}>
              {isParsing ? 'Our AI is analyzing your test document' : progress === 100 ? 'Document successfully parsed and validated' : 'Click continue to start parsing'}
            </p>
          </div>
        </CardBody>
      </Card>

      {/* Progress Bar */}
      {isParsing && (
        <Card variant="glass">
          <CardBody>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e293b' }}>
                  Progress
                </span>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#8b5cf6' }}>
                  {progress}%
                </span>
              </div>
              
              {/* Progress bar */}
              <div style={{
                width: '100%',
                height: '0.5rem',
                background: '#e2e8f0',
                borderRadius: '0.25rem',
                overflow: 'hidden',
                position: 'relative',
              }}>
                <div style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #8b5cf6 0%, #6366f1 100%)',
                  transition: 'width 0.3s ease',
                  position: 'relative',
                }}>
                  {/* Animated shimmer effect */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
                    animation: 'shimmer 2s infinite',
                  }} />
                </div>
              </div>
            </div>

            {/* Current stage */}
            <div style={{
              fontSize: '0.8125rem',
              color: '#64748b',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}>
              <span style={{ 
                display: 'inline-block',
                width: '0.5rem',
                height: '0.5rem',
                background: '#10b981',
                borderRadius: '50%',
                animation: 'pulse 2s infinite'
              }} />
              {stage || 'Processing...'}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Parsing Steps Info */}
      {isParsing && (
        <Card variant="mint">
          <CardBody>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e293b', marginBottom: '0.75rem', margin: 0 }}>
              What we're doing:
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'start', gap: '0.5rem', fontSize: '0.8125rem', color: '#475569' }}>
                <span style={{ opacity: progress > 0 ? 1 : 0.4 }}>
                  {progress > 10 ? '✅' : progress > 0 ? '⏳' : '⏸️'}
                </span>
                <span style={{ opacity: progress > 0 ? 1 : 0.4 }}>
                  Analyzing document structure
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'start', gap: '0.5rem', fontSize: '0.8125rem', color: '#475569' }}>
                <span style={{ opacity: progress > 20 ? 1 : 0.4 }}>
                  {progress > 50 ? '✅' : progress > 20 ? '⏳' : '⏸️'}
                </span>
                <span style={{ opacity: progress > 20 ? 1 : 0.4 }}>
                  Extracting passages and questions
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'start', gap: '0.5rem', fontSize: '0.8125rem', color: '#475569' }}>
                <span style={{ opacity: progress > 60 ? 1 : 0.4 }}>
                  {progress > 80 ? '✅' : progress > 60 ? '⏳' : '⏸️'}
                </span>
                <span style={{ opacity: progress > 60 ? 1 : 0.4 }}>
                  Detecting question types
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'start', gap: '0.5rem', fontSize: '0.8125rem', color: '#475569' }}>
                <span style={{ opacity: progress > 85 ? 1 : 0.4 }}>
                  {progress === 100 ? '✅' : progress > 85 ? '⏳' : '⏸️'}
                </span>
                <span style={{ opacity: progress > 85 ? 1 : 0.4 }}>
                  Validating test structure
                </span>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Success message */}
      {progress === 100 && !isParsing && (
        <Card variant="mint">
          <CardBody>
            <div style={{ display: 'flex', alignItems: 'start', gap: '1rem' }}>
              <span style={{ fontSize: '1.5rem' }}>🎉</span>
              <div>
                <h4 style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#1e293b', marginBottom: '0.5rem', margin: 0 }}>
                  Parsing Complete!
                </h4>
                <p style={{ fontSize: '0.8125rem', color: '#475569', margin: '0.5rem 0 0 0', lineHeight: 1.6 }}>
                  Your test has been successfully parsed and validated. 
                  Review the results in the next step before publishing.
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};
