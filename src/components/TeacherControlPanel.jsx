import React from 'react';
import { Group } from '@mantine/core';
import SoundButton from './SoundButton';

const TeacherControlPanel = ({ onNextQuestion, onPause, isPaused, isLastQuestion }) => {
  return (
    <div style={{ border: '1px solid #ccc', padding: '20px', marginTop: '20px' }}>
      <h3>Teacher Controls</h3>
      <Group>
        <SoundButton onClick={onPause}>{isPaused ? 'Resume' : 'Pause'}</SoundButton>
        <SoundButton onClick={onNextQuestion} disabled={isLastQuestion}>
          {isLastQuestion ? 'Finish Quiz' : 'Next Question'}
        </SoundButton>
      </Group>
      <p style={{ marginTop: '12px', fontSize: '0.9em', color: '#666' }}>
        To kick a player, use the "Kick" button next to their name in the Players list below.
      </p>
    </div>
  );
};

export default TeacherControlPanel;
