import React, { useState, useEffect } from 'react';
import { Modal, NumberInput, Text, Stack, Divider } from '@mantine/core';
import { database } from '../services/firebase';
import { ref, update } from 'firebase/database';
import { Button } from './modern';

const EditTimersModal = ({ show, handleClose, quiz }) => {
  const [timers, setTimers] = useState({});
  const [applyAllTimer, setApplyAllTimer] = useState(10);

  useEffect(() => {
    if (quiz) {
      const initialTimers = {};
      quiz.questions.forEach((q, index) => {
        initialTimers[index] = q.timer || 10;
      });
      setTimers(initialTimers);
    }
  }, [quiz]);

  const handleTimerChange = (index, value) => {
    setTimers(prev => ({ ...prev, [index]: value }));
  };

  const handleApplyToAll = () => {
    const newTimers = {};
    Object.keys(timers).forEach(index => {
      newTimers[index] = applyAllTimer;
    });
    setTimers(newTimers);
  };

  const handleSave = () => {
    if (quiz && quiz.id) {
      const updates = {};
      Object.entries(timers).forEach(([index, timer]) => {
        updates[`/quizzes/${quiz.id}/questions/${index}/timer`] = timer;
      });
      update(ref(database), updates);
      handleClose();
    }
  };

  return (
    <Modal 
      opened={show} 
      onClose={handleClose} 
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <Text size="xl" fw={700} style={{ color: '#1e293b' }}>Edit Question Timers</Text>
        </div>
      }
      size="lg"
      styles={{
        header: {
          background: '#ffffff',
          borderBottom: '2px solid #e2e8f0',
          padding: '1.5rem'
        },
        body: {
          padding: '1.5rem',
          background: '#f8fafc'
        }
      }}
    >
      {/* Apply to All Section */}
      <div style={{
        background: '#ffffff',
        padding: '1.25rem',
        borderRadius: '0.5rem',
        border: '2px solid #e2e8f0',
        marginBottom: '1.5rem'
      }}>
        <Text size="sm" fw={700} mb="xs" style={{ color: '#1e293b' }}>
          Quick Apply
        </Text>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
          <NumberInput
            label="Set timer for all questions (seconds)"
            value={applyAllTimer}
            onChange={setApplyAllTimer}
            min={5}
            max={300}
            step={5}
            style={{ flex: 1 }}
            styles={{
              label: { color: '#475569', fontWeight: 600, marginBottom: '0.5rem' },
              input: {
                borderRadius: '0.5rem',
                border: '2px solid #cbd5e1',
                fontSize: '1rem',
                fontWeight: 600,
                color: '#1e293b',
                background: '#ffffff'
              }
            }}
          />
          <Button onClick={handleApplyToAll} variant="primary" size="md">
            Apply to All
          </Button>
        </div>
      </div>

      <Divider 
        label={<Text fw={700} style={{ color: '#475569' }}>Individual Question Timers</Text>} 
        labelPosition="center" 
        mb="md"
        styles={{
          label: { color: '#475569' }
        }}
      />

      {/* Individual Question Timers */}
      <Stack spacing="md">
        {quiz && quiz.questions.map((question, index) => (
          <div 
            key={index}
            style={{
              display: 'flex',
              gap: '1rem',
              alignItems: 'center',
              padding: '1rem',
              background: '#ffffff',
              borderRadius: '0.5rem',
              border: '2px solid #e2e8f0',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f1f5f9';
              e.currentTarget.style.borderColor = '#8b5cf6';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#ffffff';
              e.currentTarget.style.borderColor = '#e2e8f0';
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" fw={700} style={{ color: '#1e293b', marginBottom: '0.25rem' }}>
                Question {index + 1}
              </Text>
              <Text size="sm" style={{ 
                color: '#475569',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {question.question}
              </Text>
            </div>
            <NumberInput
              value={timers[index]}
              onChange={(value) => handleTimerChange(index, value)}
              min={5}
              max={300}
              step={5}
              suffix="s"
              style={{ width: '100px' }}
              styles={{
                input: {
                  borderRadius: '0.5rem',
                  textAlign: 'center',
                  fontWeight: 700,
                  fontSize: '1rem',
                  color: '#1e293b',
                  border: '2px solid #cbd5e1',
                  background: '#ffffff'
                }
              }}
            />
          </div>
        ))}
      </Stack>

      {/* Action Buttons */}
      <div style={{ 
        display: 'flex', 
        gap: '0.75rem', 
        justifyContent: 'flex-end',
        marginTop: '1.5rem',
        paddingTop: '1.5rem',
        borderTop: '2px solid #e2e8f0'
      }}>
        <Button variant="glass" onClick={handleClose}>Cancel</Button>
        <Button variant="primary" onClick={handleSave}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '0.5rem' }}>
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17 21 17 13 7 13 7 21" fill="white"/>
            <polyline points="7 3 7 8 15 8" fill="white"/>
          </svg>
          Save Changes
        </Button>
      </div>
    </Modal>
  );
};

export default EditTimersModal;
