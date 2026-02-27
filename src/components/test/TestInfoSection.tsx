/**
 * Test Info Section
 * Displays test metadata summary (read-only)
 */

import React from 'react';
import { Card, CardBody } from '../modern';

interface TestMetadata {
  title: string;
  type: 'IELTS' | 'TOEFL' | 'Custom';
  skill: 'Reading' | 'Listening' | 'Writing' | 'Speaking';
  duration: number;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  description: string;
  targetBand?: string;
  estimatedScore?: string;
}

interface TestInfoSectionProps {
  metadata: TestMetadata;
  onEdit?: () => void;
}

export const TestInfoSection: React.FC<TestInfoSectionProps> = ({ metadata, onEdit }) => {
  return (
    <Card variant="glass" style={{ marginBottom: '1.5rem' }}>
      <CardBody>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
            Test Information
          </h3>
          {onEdit && (
            <button
              onClick={onEdit}
              style={{
                background: 'transparent',
                border: '2px solid #8b5cf6',
                borderRadius: '0.5rem',
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#8b5cf6',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#8b5cf6';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#8b5cf6';
              }}
            >
              Edit
            </button>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
          {/* Title */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
              Title
            </div>
            <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#1e293b' }}>
              {metadata.title}
            </div>
          </div>

          {/* Type */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
              Test Type
            </div>
            <div style={{ 
              fontSize: '0.9375rem', 
              fontWeight: 600, 
              color: '#1e293b',
              display: 'inline-block',
              padding: '0.25rem 0.75rem',
              background: metadata.type === 'IELTS' ? 'rgba(59, 130, 246, 0.1)' : metadata.type === 'TOEFL' ? 'rgba(139, 92, 246, 0.1)' : 'rgba(100, 116, 139, 0.1)',
              borderRadius: '0.375rem',
            }}>
              {metadata.type}
            </div>
          </div>

          {/* Skill */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
              Skill
            </div>
            <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#1e293b' }}>
              {metadata.skill}
            </div>
          </div>

          {/* Duration */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
              Duration
            </div>
            <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#1e293b' }}>
              {metadata.duration} minutes
            </div>
          </div>

          {/* Difficulty */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
              Difficulty
            </div>
            <div style={{ 
              fontSize: '0.9375rem', 
              fontWeight: 600,
              color: metadata.difficulty === 'Beginner' ? '#10b981' : metadata.difficulty === 'Advanced' ? '#ef4444' : '#f59e0b'
            }}>
              {metadata.difficulty}
            </div>
          </div>

          {/* IELTS-specific fields */}
          {metadata.type === 'IELTS' && metadata.targetBand && (
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                Target Band
              </div>
              <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#1e293b' }}>
                {metadata.targetBand}
              </div>
            </div>
          )}

          {metadata.type === 'IELTS' && metadata.estimatedScore && (
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '0.25rem', textTransform: 'uppercase' }}>
                Estimated Score
              </div>
              <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#1e293b' }}>
                {metadata.estimatedScore}
              </div>
            </div>
          )}
        </div>

        {/* Description (if provided) */}
        {metadata.description && (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
              Description
            </div>
            <div style={{ fontSize: '0.875rem', color: '#475569', lineHeight: 1.6 }}>
              {metadata.description}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
};
