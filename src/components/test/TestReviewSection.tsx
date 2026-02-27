/**
 * Test Review Section
 * Final review and editing before publishing
 * Shows passages, questions, and metadata summary
 */

import React, { useState } from 'react';
import { Card, CardBody } from '../modern';
import { Button } from '../modern';
import type { Passage, ParsedQuestion } from '../../types/document.types';

interface TestMetadata {
  title: string;
  type: 'IELTS' | 'TOEFL' | 'Custom';
  skill: 'Reading' | 'Listening' | 'Writing' | 'Speaking';
  duration: number;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  description: string;
}

interface TestReviewSectionProps {
  metadata: TestMetadata;
  passages: Passage[];
  questions: ParsedQuestion[];
  onPublish: () => void;
  onEdit: () => void;
  isPublishing?: boolean;
}

export const TestReviewSection: React.FC<TestReviewSectionProps> = ({
  metadata,
  passages,
  questions,
  onPublish,
  onEdit,
  isPublishing = false,
}) => {
  const [expandedPassage, setExpandedPassage] = useState<number | null>(null);
  const [expandedQuestions, setExpandedQuestions] = useState(false);

  const togglePassage = (index: number) => {
    setExpandedPassage(expandedPassage === index ? null : index);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <Card variant="glass">
        <CardBody>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📝</div>
            <h3 style={{
              fontSize: '1.25rem',
              fontWeight: '700',
              color: '#1e293b',
              marginBottom: '0.5rem',
              margin: 0
            }}>
              Review Your Test
            </h3>
            <p style={{
              fontSize: '0.875rem',
              color: '#64748b',
              margin: '0.5rem 0 0 0'
            }}>
              Review all test content before publishing. You can edit any section if needed.
            </p>
          </div>
        </CardBody>
      </Card>

      {/* Summary Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
        <Card variant="sky">
          <CardBody>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: '700', color: '#3b82f6', marginBottom: '0.25rem' }}>
                {passages.length}
              </div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                Passages
              </div>
            </div>
          </CardBody>
        </Card>

        <Card variant="mint">
          <CardBody>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: '700', color: '#10b981', marginBottom: '0.25rem' }}>
                {questions.length}
              </div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                Questions
              </div>
            </div>
          </CardBody>
        </Card>

        <Card variant="lavender">
          <CardBody>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: '700', color: '#8b5cf6', marginBottom: '0.25rem' }}>
                {metadata.duration}
              </div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                Minutes
              </div>
            </div>
          </CardBody>
        </Card>

        <Card variant="peach">
          <CardBody>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: '700', color: '#f97316', marginBottom: '0.25rem' }}>
                {metadata.type}
              </div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                Type
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Test Metadata */}
      <Card variant="glass">
        <CardBody>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b', margin: 0 }}>
              Test Information
            </h4>
            <button
              onClick={onEdit}
              style={{
                background: 'transparent',
                border: '2px solid #8b5cf6',
                borderRadius: '0.375rem',
                padding: '0.375rem 0.75rem',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: '#8b5cf6',
                cursor: 'pointer',
              }}
            >
              Edit
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.75rem', fontSize: '0.875rem' }}>
            <span style={{ color: '#64748b', fontWeight: 600 }}>Title:</span>
            <span style={{ color: '#1e293b' }}>{metadata.title}</span>
            
            <span style={{ color: '#64748b', fontWeight: 600 }}>Skill:</span>
            <span style={{ color: '#1e293b' }}>{metadata.skill}</span>
            
            <span style={{ color: '#64748b', fontWeight: 600 }}>Difficulty:</span>
            <span style={{ color: '#1e293b' }}>{metadata.difficulty}</span>
          </div>
        </CardBody>
      </Card>

      {/* Passages */}
      <Card variant="glass">
        <CardBody>
          <h4 style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b', marginBottom: '1rem', margin: '0 0 1rem 0' }}>
            Passages ({passages.length})
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {passages.map((passage, index) => (
              <div
                key={index}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.5rem',
                  overflow: 'hidden',
                }}
              >
                <button
                  onClick={() => togglePassage(index)}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    background: 'rgba(248, 250, 252, 0.5)',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e293b' }}>
                    Passage {index + 1}: {passage.title || 'Untitled'}
                  </span>
                  <span style={{ fontSize: '0.875rem', color: '#64748b' }}>
                    {expandedPassage === index ? '▼' : '▶'}
                  </span>
                </button>
                {expandedPassage === index && (
                  <div style={{ padding: '0.75rem', fontSize: '0.8125rem', color: '#475569', lineHeight: 1.6 }}>
                    {passage.content.slice(0, 300)}
                    {passage.content.length > 300 && '...'}
                    <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#64748b' }}>
                      {passage.content.split(' ').length} words
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Questions */}
      <Card variant="glass">
        <CardBody>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h4 style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b', margin: 0 }}>
              Questions ({questions.length})
            </h4>
            <button
              onClick={() => setExpandedQuestions(!expandedQuestions)}
              style={{
                background: 'transparent',
                border: '2px solid #e2e8f0',
                borderRadius: '0.375rem',
                padding: '0.375rem 0.75rem',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: '#64748b',
                cursor: 'pointer',
              }}
            >
              {expandedQuestions ? 'Collapse' : 'Expand'} All
            </button>
          </div>

          {/* Question type breakdown */}
          <div style={{ 
            display: 'flex', 
            flexWrap: 'wrap', 
            gap: '0.5rem', 
            marginBottom: '1rem',
            paddingBottom: '1rem',
            borderBottom: '1px solid #e2e8f0'
          }}>
            {Array.from(new Set(questions.map(q => q.type))).map(type => {
              const count = questions.filter(q => q.type === type).length;
              return (
                <span
                  key={type}
                  style={{
                    display: 'inline-block',
                    padding: '0.25rem 0.75rem',
                    background: 'rgba(139, 92, 246, 0.1)',
                    borderRadius: '0.375rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#8b5cf6',
                  }}
                >
                  {type}: {count}
                </span>
              );
            })}
          </div>

          {/* Questions list (preview) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {questions.slice(0, expandedQuestions ? questions.length : 5).map((question, index) => (
              <div
                key={index}
                style={{
                  padding: '0.75rem',
                  background: 'rgba(248, 250, 252, 0.5)',
                  borderRadius: '0.375rem',
                  fontSize: '0.8125rem',
                }}
              >
                <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '0.25rem' }}>
                  Q{question.number || index + 1}: {question.question.slice(0, 80)}
                  {question.question.length > 80 && '...'}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Type: {question.type} • Answer: {typeof question.answer === 'string' ? question.answer : 'Multiple answers'}
                </div>
              </div>
            ))}
            {!expandedQuestions && questions.length > 5 && (
              <div style={{ textAlign: 'center', padding: '0.5rem', fontSize: '0.8125rem', color: '#64748b' }}>
                + {questions.length - 5} more questions
              </div>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Publish Actions */}
      <Card variant="glass">
        <CardBody>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#1e293b', marginBottom: '0.25rem' }}>
                Ready to Publish?
              </div>
              <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                Once published, this test will be available for creating sessions.
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <Button
                variant="glass"
                onClick={onEdit}
                disabled={isPublishing}
              >
                Back to Edit
              </Button>
              <Button
                variant="primary"
                onClick={onPublish}
                disabled={isPublishing}
                style={{
                  background: isPublishing 
                    ? '#94a3b8' 
                    : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  border: 'none',
                  padding: '0.75rem 2rem',
                }}
              >
                {isPublishing ? 'Publishing...' : '✓ Publish Test'}
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
};
