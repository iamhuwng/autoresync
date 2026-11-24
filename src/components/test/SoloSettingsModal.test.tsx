import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SoloSettingsModal } from './SoloSettingsModal';
import type { ResolvedPracticeSettings, StudentSoloPreferences } from '../../types/practice.types';

const resolvedSettings: ResolvedPracticeSettings = {
  enabled: true,
  timerMinutes: 30,
  feedbackTiming: 'immediate',
  maxAttempts: null,
  allowPause: true,
  minPassingScore: null,
  reading: {
    showTimer: true,
  },
  listening: {
    allowReplay: false,
    allowSpeedControl: true,
    allowSkipSection: false,
    allowPauseAudio: false,
    maxReplays: null,
  },
  _sources: {},
};

const studentPrefs: StudentSoloPreferences = {
  fontSize: 16,
  lineSpacing: 1.5,
  highlighterEnabled: false,
  showTimer: true,
  darkMode: false,
  audioSpeed: 1,
};

const renderModal = (testSkill: 'Reading' | 'Listening', onPrefsChange = vi.fn(), onClose = vi.fn()) => render(
  <SoloSettingsModal
    opened
    onClose={onClose}
    testSkill={testSkill}
    resolvedSettings={resolvedSettings}
    studentPrefs={studentPrefs}
    onPrefsChange={onPrefsChange}
  />,
);

describe('SoloSettingsModal', () => {
  it('shows reading settings only for reading tests', () => {
    renderModal('Reading');

    expect(screen.getByText('Reading & Display')).toBeInTheDocument();
    expect(screen.queryByText('Listening Audio')).not.toBeInTheDocument();
  });

  it('hides reading settings for listening tests and saves audio speed changes', async () => {
    const onPrefsChange = vi.fn();
    const onClose = vi.fn();
    renderModal('Listening', onPrefsChange, onClose);

    expect(screen.queryByText('Reading & Display')).not.toBeInTheDocument();
    expect(screen.getByText('Listening Audio')).toBeInTheDocument();

    const select = screen.getByLabelText(/Audio Speed/i);
    fireEvent.change(select, { target: { value: '1.5' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save Settings' }));

    expect(onPrefsChange).toHaveBeenCalledWith({ ...studentPrefs, audioSpeed: 1.5 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders an exit option when the host provides one', async () => {
    const onExit = vi.fn();

    render(
      <SoloSettingsModal
        opened
        onClose={vi.fn()}
        testSkill="Listening"
        resolvedSettings={resolvedSettings}
        studentPrefs={studentPrefs}
        onPrefsChange={vi.fn()}
        onExit={onExit}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Exit' }));

    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
