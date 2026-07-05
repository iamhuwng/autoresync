/**
 * Create Session Modal
 * Modal for creating new test sessions
 */

import React, { useState, useEffect } from 'react';
import { Modal, Select } from '@mantine/core';
import { useForm } from '@mantine/form';
import { Button } from '../modern';
// @ts-ignore - sessionManager.js doesn't have type declarations (TODO: convert to TypeScript)
import { createSession, SessionMode } from '../../services/sessionManager';
import { getClasses } from '../../services/classManager';
import { useAuth } from '../../hooks/useAuth';

interface CreateSessionModalProps {
  opened: boolean;
  onClose: () => void;
  onSessionCreated: (sessionCode: string, mode: string) => void;
  courseId?: string | null;
  courseName?: string | null;
  moduleId?: string | null;
}

export const CreateSessionModal: React.FC<CreateSessionModalProps> = ({
  opened,
  onClose,
  onSessionCreated,
  courseId,
  courseName,
  moduleId,
}) => {
  const mode = 'test';
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [classes, setClasses] = useState<{ value: string; label: string }[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const { user } = useAuth();

  // Load teacher's classes on mount
  useEffect(() => {
    const loadClasses = async () => {
      if (user?.uid) {
        try {
          const classList = await getClasses(user.uid);
          setClasses(classList.map((c: any) => ({ value: c.id, label: `${c.name} (${c.classCode})` })));
        } catch (err) {
          console.error('Failed to load classes:', err);
        }
      }
    };
    if (opened) {
      loadClasses();
    }
  }, [user, opened]);

  const form = useForm({
    initialValues: {
      allowLateJoin: true,
      showLeaderboard: true,
      allowAnonymous: true,
      accessControl: 'public', // 'public' or 'class-only'
    },
    validate: {},
  });

  // No content loading needed - just create empty session

  const handleSubmit = async (values: any) => {
    setCreating(true);
    setError('');

    try {
      // Create empty session with just mode
      // DO NOT set testId until content is actually selected
      const sessionParams: any = {
        mode: SessionMode.TEST,
        // Don't set any content ID - will be set when teacher selects content
        classId: selectedClassId, // Link to class if selected
        courseId: courseId || null,
        moduleId: moduleId || null,
        createdBy: user?.uid || null, // NEW: Pass actual user UID for ownership tracking
        settings: {
          allowLateJoin: values.allowLateJoin,
          showLeaderboard: values.showLeaderboard,
          allowAnonymous: values.allowAnonymous,
          accessControl: values.accessControl,
        },
      };

      const result = await createSession(sessionParams);

      if (result.success) {
        console.log(`✅ Empty session created: ${result.sessionCode} (mode: ${mode})`);
        form.reset();
        onSessionCreated(result.sessionCode, mode);
        onClose();
      } else {
        setError('Failed to create session. Please try again.');
      }
    } catch (err) {
      console.error('Error creating session:', err);
      setError('Failed to create session. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Create New Session"
      size="lg"
      padding={0}
      styles={{
        title: {
          fontSize: '1.5rem',
          fontWeight: 700,
          background: 'linear-gradient(135deg, #8b5cf6 0%, #c084fc 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        },
        header: {
          padding: '1.5rem',
          background: 'rgba(139, 92, 246, 0.05)',
          borderBottom: '1px solid rgba(139, 92, 246, 0.2)',
        },
        body: {
          padding: 0,
          maxHeight: 'calc(90vh - 120px)',
          overflowY: 'auto',
        },
        content: {
          borderRadius: '1rem',
          maxHeight: '90vh',
        },
      }}
    >
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <div style={{ padding: '1.5rem' }}>
          {/* Course Context Message */}
          {courseName && (
            <div
              style={{
                padding: '0.75rem 1rem',
                marginBottom: '1.5rem',
                background: 'rgba(139, 92, 246, 0.1)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                borderRadius: '0.5rem',
                color: '#7c3aed',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <span style={{ fontSize: '1.25rem' }}>📚</span>
              <span>
                This session is for: <strong>{courseName}</strong>
              </span>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div
              style={{
                padding: '1rem',
                marginBottom: '1.5rem',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '0.5rem',
                color: '#dc2626',
                fontSize: '0.875rem',
              }}
            >
              {error}
            </div>
          )}

          <div style={{ marginBottom: '1.5rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#1e293b',
                marginBottom: '0.75rem',
              }}
            >
              Session Mode
            </label>
            <div
              style={{
                padding: '1rem',
                borderRadius: '0.75rem',
                border: '2px solid #8b5cf6',
                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(192, 132, 252, 0.1) 100%)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
              }}
            >
              <span style={{ fontSize: '2rem' }}>📝</span>
              <div>
                <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.9375rem' }}>
                  Test Mode
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                  Self-paced, IELTS-style
                </div>
              </div>
            </div>
          </div>

          {/* Access Control */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#1e293b',
                marginBottom: '0.75rem',
              }}
            >
              Access Control
            </label>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
              <button
                type="button"
                onClick={() => form.setFieldValue('accessControl', 'public')}
                style={{
                  flex: 1,
                  padding: '0.75rem 1rem',
                  borderRadius: '0.5rem',
                  border: form.values.accessControl === 'public' ? '2px solid #8b5cf6' : '2px solid #e2e8f0',
                  background: form.values.accessControl === 'public' ? 'rgba(139, 92, 246, 0.1)' : 'white',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#1e293b',
                }}
              >
                🌐 Public
              </button>
              <button
                type="button"
                onClick={() => form.setFieldValue('accessControl', 'class-only')}
                style={{
                  flex: 1,
                  padding: '0.75rem 1rem',
                  borderRadius: '0.5rem',
                  border: form.values.accessControl === 'class-only' ? '2px solid #8b5cf6' : '2px solid #e2e8f0',
                  background: form.values.accessControl === 'class-only' ? 'rgba(139, 92, 246, 0.1)' : 'white',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: '#1e293b',
                }}
              >
                🔒 Class Only
              </button>
            </div>
            <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0 }}>
              {form.values.accessControl === 'public'
                ? 'Anyone with the session code can join'
                : 'Only students enrolled in your class can join'}
            </p>
          </div>

          {/* Class Selection */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label
              style={{
                display: 'block',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: '#1e293b',
                marginBottom: '0.75rem',
              }}
            >
              Link to Class (Optional)
            </label>
            <Select
              placeholder="Select a class or leave empty for standalone session"
              data={classes}
              value={selectedClassId}
              onChange={setSelectedClassId}
              clearable
              searchable
              nothingFoundMessage="No classes found"
              styles={{
                input: {
                  borderRadius: '0.5rem',
                  border: '2px solid #e2e8f0',
                  '&:focus': {
                    borderColor: '#8b5cf6',
                  },
                },
              }}
            />
            <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0.5rem 0 0 0' }}>
              {selectedClassId
                ? 'Students enrolled in this class will see this session on their dashboard'
                : 'Session will be standalone - students join with the session code only'}
            </p>
          </div>

          {/* Guest Access Toggle */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '1rem',
                borderRadius: '0.75rem',
                border: '1px solid #e2e8f0',
                background: 'white',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#cbd5e1';
                e.currentTarget.style.background = '#f8fafc';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.background = 'white';
              }}
            >
              <input
                type="checkbox"
                checked={form.values.allowAnonymous}
                onChange={(e) => form.setFieldValue('allowAnonymous', e.target.checked)}
                style={{
                  width: '1.25rem',
                  height: '1.25rem',
                  cursor: 'pointer',
                  accentColor: '#8b5cf6',
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#1e293b', marginBottom: '0.25rem' }}>
                  👤 Allow Guest Access
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Students can join without logging in (anonymous participation)
                </div>
              </div>
            </label>
          </div>


        </div>

        {/* Footer */}
        <div
          style={{
            padding: '1.5rem',
            borderTop: '1px solid rgba(139, 92, 246, 0.2)',
            background: 'rgba(139, 92, 246, 0.05)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.75rem',
          }}
        >
          <Button
            variant="glass"
            onClick={onClose}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={creating}
          >
            {creating ? (
              'Creating...'
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.5rem' }}>
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                </svg>
                Create Session
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
