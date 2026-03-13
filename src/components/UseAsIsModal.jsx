// Rule 15 Exception: Mantine Modal/Select moved from TeacherLobbyPage.jsx — see PRD-0033 NG-1
import React from 'react';
import { Modal } from '@mantine/core';
import { Button } from '../components/modern';
import { doc, collection, setDoc } from 'firebase/firestore';
import { firestore as db } from '../services/firebase';

// CRITICAL DEDUP: Shared Firestore save logic for both button handlers
async function saveLinkedTestReference(userId, test) {
  try {
    const linkedRef = doc(collection(db, `users/${userId}/thcs_linked_tests`));
    await setDoc(linkedRef, {
      id: linkedRef.id,
      testId: test.id,
      linkedFrom: test.ownerId || test.createdBy,
      originalTestId: test.id,
      isLinkedReference: true,
      linkedAt: Date.now(),
      testTitle: test.metadata?.title || 'Untitled',
      testMetadata: {
        gradeLevel: test.metadata?.gradeLevel || 9,
        examType: test.metadata?.examType || '',
        duration: test.metadata?.duration || 45,
        questionCount: test.questionCount || 0,
      },
    });
  } catch (err) {
    console.error('Failed to save linked test:', err);
  }
}

const UseAsIsModal = ({ test, opened, onClose, onStartLiveSession, onAssignHomework, userId }) => {
  if (!test) return null;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Use Test As-Is"
      centered
      size="md"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{
          padding: '0.75rem 1rem',
          background: 'rgba(139, 92, 246, 0.06)',
          borderRadius: '0.75rem',
          border: '1px solid rgba(139, 92, 246, 0.15)',
        }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b', marginBottom: '0.25rem' }}>
            {test.metadata?.title || 'Untitled THCS Test'}
          </div>
          <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
            Grade {test.metadata?.gradeLevel} | {test.metadata?.examType || 'Exam'} | {test.metadata?.duration || 45} min | {test.questionCount || 0} questions
          </div>
        </div>

        <div style={{
          padding: '0.625rem 0.875rem',
          background: 'rgba(245, 158, 11, 0.08)',
          borderRadius: '0.5rem',
          fontSize: '0.8125rem',
          color: '#92400e',
          lineHeight: 1.5,
        }}>
          ⚠️ This test will be used as-is. You cannot modify it. The original teacher retains ownership.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.25rem' }}>
          <Button
            variant="primary"
            onClick={async () => {
              await saveLinkedTestReference(userId, test);
              onStartLiveSession(test);
            }}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            🎯 Start Live Session
          </Button>
          <Button
            variant="glass"
            onClick={async () => {
              await saveLinkedTestReference(userId, test);
              onAssignHomework(test);
            }}
            style={{ width: '100%', justifyContent: 'center', color: '#7c3aed' }}
          >
            📋 Assign as Homework
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default UseAsIsModal;
