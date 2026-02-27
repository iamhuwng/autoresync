/**
 * Test Builder Router
 * Routes to appropriate builder based on skill selection
 * Immediate implementation with progressive enhancement
 */

import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import TestCreationPage from './TestCreationPage'; // PRD-0020: New Reading test builder
import ListeningTestBuilder from '../skills/listening/builders/ListeningTestBuilder'; // Listening builder with Google Sign-In
import WritingTestBuilder from './WritingTestBuilder'; // PRD-0030: IELTS Writing Test System
import { Card, CardBody, Button } from '../components/modern';

interface TestBuilderRouterProps {
  // Props from parent if needed
}

const TestBuilderRouter: React.FC<TestBuilderRouterProps> = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Get skill from URL params or state
  const searchParams = new URLSearchParams(location.search);
  const skill = searchParams.get('skill') || 'Reading';
  const testType = searchParams.get('type') || 'IELTS';

  // Skill availability map - easily toggle as you build features
  const skillAvailability = {
    'Reading': {
      available: true,
      component: TestCreationPage,
      features: ['document-upload', 'ai-parsing', 'manual-entry'],
      status: 'production',
      expectedDate: undefined
    },
    'Listening': {
      available: true,
      component: ListeningTestBuilder,
      features: ['google-drive-audio', 'upload-progress', 'audio-preview', 'google-sign-in', 'url-validation', 'ai-question-parsing'],
      status: 'production',
      expectedDate: undefined
    },
    'Writing': {
      available: true,
      component: WritingTestBuilder,
      features: ['task-prompts', 'image-upload', 'model-answers', 'auto-save'],
      status: 'production',
      expectedDate: undefined
    },
    'Speaking': {
      available: false,
      component: null, // SpeakingTestBuilder when ready
      features: ['recording-interface', 'part-structure', 'timing-controls'],
      status: 'planned',
      expectedDate: 'January 2025'
    }
  };

  const currentSkill = skillAvailability[skill as keyof typeof skillAvailability];

  // If skill is available, render its builder
  if (currentSkill?.available && currentSkill.component) {
    const Component = currentSkill.component;
    return <Component />;
  }

  // Otherwise, show coming soon page with feature preview
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #faf5ff 0%, #f0f9ff 25%, #f0fdfa 50%, #fff7ed 75%, #faf5ff 100%)',
      backgroundAttachment: 'fixed',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem'
    }}>
      <Card variant="glass" style={{ maxWidth: '600px', width: '100%' }}>
        <CardBody style={{ padding: '3rem', textAlign: 'center' }}>
          {/* Icon based on skill */}
          <div style={{ fontSize: '4rem', marginBottom: '1.5rem' }}>
            {skill === 'Listening' && '🎧'}
            {skill === 'Writing' && '✍️'}
            {skill === 'Speaking' && '🎙️'}
            {skill === 'Reading' && '📖'}
          </div>

          <h1 style={{
            fontSize: '2rem',
            fontWeight: '700',
            color: '#1e293b',
            marginBottom: '0.5rem'
          }}>
            {testType} {skill} Test Builder
          </h1>

          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '0.5rem 1rem',
            background: currentSkill?.status === 'coming-soon'
              ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)'
              : 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)',
            borderRadius: '9999px',
            color: 'white',
            fontWeight: '600',
            fontSize: '0.875rem',
            marginBottom: '1.5rem'
          }}>
            {currentSkill?.status === 'coming-soon' ? '🚧 Coming Soon' : '📅 Planned'}
            {currentSkill?.expectedDate && ` - ${currentSkill.expectedDate}`}
          </div>

          <p style={{
            fontSize: '1.125rem',
            color: '#64748b',
            marginBottom: '2rem',
            lineHeight: 1.6
          }}>
            The {skill} test builder is currently under development.
            This feature will enable you to create comprehensive {testType} {skill.toLowerCase()} tests with:
          </p>

          {/* Feature preview */}
          <div style={{
            background: 'rgba(139, 92, 246, 0.05)',
            borderRadius: '1rem',
            padding: '1.5rem',
            marginBottom: '2rem'
          }}>
            <h3 style={{
              fontSize: '1rem',
              fontWeight: '600',
              color: '#8b5cf6',
              marginBottom: '1rem'
            }}>
              Upcoming Features
            </h3>
            <div style={{ textAlign: 'left' }}>
              {currentSkill?.features.map((feature, idx) => (
                <div key={idx} style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginBottom: '0.5rem',
                  color: '#64748b'
                }}>
                  <span style={{ color: '#10b981', marginRight: '0.5rem' }}>✓</span>
                  {feature.split('-').map(word =>
                    word.charAt(0).toUpperCase() + word.slice(1)
                  ).join(' ')}
                </div>
              ))}
            </div>
          </div>

          {/* Alternative actions */}
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <Button
              variant="glass"
              onClick={() => navigate('/sessions')}
            >
              ← Back to Sessions
            </Button>

            <Button
              variant="primary"
              onClick={() => navigate('/create-test?skill=Reading')}
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                border: 'none'
              }}
            >
              Create Reading Test Instead
            </Button>
          </div>

          {/* Notification signup (optional) */}
          {currentSkill?.status === 'coming-soon' && (
            <p style={{
              marginTop: '2rem',
              fontSize: '0.875rem',
              color: '#94a3b8'
            }}>
              Want to be notified when this feature launches?{' '}
              <a href="#" style={{ color: '#8b5cf6', textDecoration: 'underline' }}>
                Join the waitlist
              </a>
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
};

export default TestBuilderRouter;
