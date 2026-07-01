import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TeacherTestControlBar } from './TeacherTestControlBar';
import { TEACHER_MONITOR_AUDIO_RESUME_EVENT } from './teacherMonitorAudioEvents';

describe('TeacherTestControlBar accessibility', () => {
  it('renders named touch-sized live audio controls', () => {
    render(
      <MemoryRouter>
        <TeacherTestControlBar
          sessionCode="LIVE123"
          session={{
            sessionCode: 'LIVE123',
            testId: 'test-1',
            status: 'in-progress',
            startTime: Date.now(),
            isPaused: false,
          }}
          testData={{
            title: 'Listening Live',
            duration: 30,
            questionCount: 40,
            skill: 'Listening',
            audioSections: [
              { number: 1, name: 'Part 1' },
              { number: 2, name: 'Part 2' },
              { number: 3, name: 'Part 3' },
            ],
          }}
          onStartTest={vi.fn()}
          onPauseTest={vi.fn()}
          onEndTest={vi.fn()}
          onExtendTime={vi.fn()}
          onPauseAllAudio={vi.fn()}
          onResumeAllAudio={vi.fn()}
          onSkipToSection={vi.fn()}
          onSetPlaybackSpeed={vi.fn()}
          currentAudioSection={2}
          currentPlaybackSpeed={1.5}
        />
      </MemoryRouter>,
    );

    for (const name of ['Pause All Audio', 'Resume All Audio', 'Previous Section', 'Next Section']) {
      const button = screen.getByRole('button', { name });
      expect(button.style.minWidth).toBe('44px');
      expect(button.style.minHeight).toBe('44px');
    }

    expect(screen.getByRole('combobox', { name: /current audio section/i }).style.minHeight).toBe('44px');
    const speedSelect = screen.getByRole('combobox', { name: /playback speed for all students/i }) as HTMLSelectElement;
    expect(speedSelect.style.minHeight).toBe('44px');
    expect(speedSelect.value).toBe('1.5');
  });

  it('dispatches the teacher monitor audio gesture before the resume write', async () => {
    const order: string[] = [];
    const onResumeAllAudio = vi.fn(async () => {
      order.push('resume-write');
    });
    const handleResumeGesture = () => {
      order.push('local-gesture');
    };
    window.addEventListener(TEACHER_MONITOR_AUDIO_RESUME_EVENT, handleResumeGesture);

    try {
      render(
        <MemoryRouter>
          <TeacherTestControlBar
            sessionCode="LIVE123"
            session={{
              sessionCode: 'LIVE123',
              testId: 'test-1',
              status: 'in-progress',
              startTime: Date.now(),
              isPaused: false,
            }}
            testData={{
              title: 'Listening Live',
              duration: 30,
              questionCount: 40,
              skill: 'Listening',
              audioSections: [{ number: 1, name: 'Part 1' }],
            }}
            onStartTest={vi.fn()}
            onPauseTest={vi.fn()}
            onEndTest={vi.fn()}
            onExtendTime={vi.fn()}
            onPauseAllAudio={vi.fn()}
            onResumeAllAudio={onResumeAllAudio}
            onSkipToSection={vi.fn()}
            onSetPlaybackSpeed={vi.fn()}
            currentAudioSection={1}
          />
        </MemoryRouter>,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Resume All Audio' }));

      await waitFor(() => expect(onResumeAllAudio).toHaveBeenCalledTimes(1));
      expect(order).toEqual(['local-gesture', 'resume-write']);
    } finally {
      window.removeEventListener(TEACHER_MONITOR_AUDIO_RESUME_EVENT, handleResumeGesture);
    }
  });
});
