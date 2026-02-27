/**
 * Skill Not Available Component
 * Shows when user selects a skill that's not implemented yet
 */

import React from 'react';
import { Card, CardBody, Button } from '../modern';

interface SkillNotAvailableProps {
  skill: 'Listening' | 'Writing' | 'Speaking';
  testType: string;
  onBack: () => void;
  onSelectReading: () => void;
}

const SkillNotAvailable: React.FC<SkillNotAvailableProps> = ({
  skill,
  testType,
  onBack,
  onSelectReading
}) => {
  const features = {
    'Listening': [
      'Audio file upload (MP3, WAV, M4A)',
      'Automatic transcript generation',
      'Section markers and timestamps',
      'Question-audio synchronization',
      'Playback rules configuration'
    ],
    'Writing': [
      'Task prompt templates',
      'Rubric builder with criteria',
      'Sample response library',
      'AI-powered evaluation setup',
      'Visual input for Task 1 (graphs/diagrams)'
    ],
    'Speaking': [
      'Browser-based recording interface',
      'Part-based test structure',
      'Preparation and speaking timers',
      'Automatic transcription',
      'Pronunciation scoring'
    ]
  };

  const icons = {
    'Listening': '🎧',
    'Writing': '✍️',
    'Speaking': '🎙️'
  };

  const expectedDates = {
    'Listening': 'December 2024',
    'Writing': 'January 2025',
    'Speaking': 'January 2025'
  };

  return (
    <Card variant="glass" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <CardBody style={{ padding: '3rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ fontSize: '5rem', marginBottom: '1rem' }}>
            {icons[skill]}
          </div>
          <h2 style={{
            fontSize: '2rem',
            fontWeight: '700',
            color: '#1e293b',
            marginBottom: '1rem'
          }}>
            {testType} {skill} Test Builder
          </h2>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '0.5rem 1.5rem',
            background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
            borderRadius: '9999px',
            color: 'white',
            fontWeight: '600',
            fontSize: '0.9rem'
          }}>
            🚧 Coming {expectedDates[skill]}
          </div>
        </div>

        <div style={{
          background: 'rgba(139, 92, 246, 0.05)',
          borderRadius: '1rem',
          padding: '2rem',
          marginBottom: '2rem'
        }}>
          <h3 style={{
            fontSize: '1.125rem',
            fontWeight: '600',
            color: '#8b5cf6',
            marginBottom: '1.25rem'
          }}>
            Features in Development
          </h3>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {features[skill].map((feature, idx) => (
              <div key={idx} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem'
              }}>
                <span style={{
                  color: '#10b981',
                  fontSize: '1.25rem',
                  lineHeight: '1'
                }}>✓</span>
                <span style={{
                  color: '#64748b',
                  fontSize: '0.95rem',
                  lineHeight: '1.5'
                }}>
                  {feature}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          background: 'rgba(16, 185, 129, 0.05)',
          borderRadius: '0.75rem',
          padding: '1.25rem',
          marginBottom: '2rem'
        }}>
          <p style={{
            color: '#047857',
            fontWeight: '600',
            marginBottom: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <span>💡</span>
            Reading Tests Available Now
          </p>
          <p style={{
            color: '#64748b',
            fontSize: '0.9rem',
            lineHeight: '1.5'
          }}>
            While {skill} tests are in development, you can create Reading tests with our fully-featured document parser and AI-powered question extraction.
          </p>
        </div>

        <div style={{
          display: 'flex',
          gap: '1rem',
          justifyContent: 'center'
        }}>
          <Button
            variant="glass"
            onClick={onBack}
            size="lg"
          >
            ← Change Selection
          </Button>
          <Button
            variant="primary"
            onClick={onSelectReading}
            size="lg"
            style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              border: 'none'
            }}
          >
            Create Reading Test
          </Button>
        </div>
      </CardBody>
    </Card>
  );
};

export default SkillNotAvailable;
