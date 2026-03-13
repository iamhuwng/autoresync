// Rule 15 Exception: Mantine Modal/Select moved from TeacherLobbyPage.jsx — see PRD-0033 NG-1
import React from 'react';
import { Modal, Select } from '@mantine/core';
import { Button } from '../components/modern';
import { AudioModeSelector } from '../components/test/AudioModeSelector';

const ClassSelectionModal = ({
  opened,
  onClose,
  onConfirm,
  classes,
  selectedClassId,
  onClassChange,
  isListening,
  selectedAudioMode,
  onAudioModeChange,
  lastUsedAudioMode,
  showAudioModeError,
  examMode,
  onExamModeChange,
}) => {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isListening ? "Start Listening Test Session" : "Start Session"}
      centered
      size={isListening ? "lg" : "md"}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <p>Would you like to link this session to a specific class?</p>

        <Select
          label="Select Class (Optional)"
          placeholder="Choose a class or leave empty for standalone"
          data={classes}
          value={selectedClassId}
          onChange={onClassChange}
          clearable
        />

        {/* Audio Mode Selection for Listening Tests */}
        {isListening && (
          <>
            <div style={{ marginTop: '0.5rem' }}>
              <label style={{
                display: 'block', fontWeight: 600,
                marginBottom: '0.75rem', color: '#1e293b'
              }}>
                Audio Mode <span style={{ color: '#ef4444' }}>*</span>
              </label>

              <AudioModeSelector
                value={selectedAudioMode}
                onChange={onAudioModeChange}
                required
                disabled={false}
                lastUsedMode={lastUsedAudioMode}
              />

              {showAudioModeError && (
                <div style={{
                  marginTop: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '0.375rem',
                  color: '#dc2626',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                }}>
                  ⚠️ You must select an audio mode to start the test
                </div>
              )}
            </div>
          </>
        )}

        {/* Exam Mode Toggle */}
        <div style={{
          marginTop: '0.5rem',
          padding: '1rem',
          background: examMode ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
          border: examMode ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid #e2e8f0',
          borderRadius: '0.5rem',
          transition: 'all 0.2s ease',
        }}>
          <label style={{
            display: 'flex', alignItems: 'center',
            gap: '0.75rem', cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={examMode}
              onChange={(e) => onExamModeChange(e.target.checked)}
              style={{
                width: '1.25rem', height: '1.25rem',
                cursor: 'pointer', accentColor: '#8b5cf6',
              }}
            />
            <div>
              <span style={{ fontWeight: 600, color: '#1e293b' }}>
                🎓 Exam Mode
              </span>
              <p style={{
                fontSize: '0.8125rem', color: '#64748b',
                margin: '0.25rem 0 0 0', lineHeight: 1.4,
              }}>
                Disable all student accommodations for this session
              </p>
            </div>
          </label>

          {examMode && (
            <div style={{
              marginTop: '0.75rem',
              padding: '0.5rem 0.75rem',
              background: 'rgba(245, 158, 11, 0.15)',
              borderRadius: '0.375rem',
              color: '#92400e',
              fontSize: '0.8125rem',
              fontWeight: 500,
            }}>
              ⚠️ Student accommodations (extra time, unlimited replays, etc.) will not apply
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
          <Button variant="glass" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            Start Session
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ClassSelectionModal;
