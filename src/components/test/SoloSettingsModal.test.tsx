import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SoloSettingsModal } from './SoloSettingsModal';
import type { ResolvedPracticeSettings, StudentSoloPreferences } from '../../types/practice.types';

const resolvedSettings: ResolvedPracticeSettings = {
  reading: {
    showTimer: true,
    requireFullScreen: false,
    disableCopyPaste: false,
    randomizeQuestions: false,
  },
  listening: {
    allowReplay: false,
    allowSpeedControl: true,
    allowSkipSection: false,
    allowPauseAudio: false,
    maxReplays: null,
  },
  writing: {
    showWordCount: true,
    enableSpellCheck: false,
  },
  feedback: {
    timing: 'immediate',
    showCorrectAnswers: true,
    showExplanations: true,
    allowReview: true,
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

const renderModal = (testSkill: 'Reading' | 'Listening') => render(
  <MantineProvider>
    <SoloSettingsModal
      opened
      onClose={vi.fn()}
      testSkill={testSkill}
      resolvedSettings={resolvedSettings}
      studentPrefs={studentPrefs}
      onPrefsChange={vi.fn()}
    />
  </MantineProvider>,
);

describe('SoloSettingsModal', () => {
  it('shows reading settings only for reading tests', () => {
    renderModal('Reading');

    expect(screen.getByText('Reading & Display')).toBeInTheDocument();
    expect(screen.queryByText('Listening Audio')).not.toBeInTheDocument();
  });

  it('hides reading settings for listening tests', () => {
    renderModal('Listening');

    expect(screen.queryByText('Reading & Display')).not.toBeInTheDocument();
    expect(screen.getByText('Listening Audio')).toBeInTheDocument();
  });

  it('renders an exit option when the host provides one', async () => {
    const onExit = vi.fn();

    render(
      <MantineProvider>
        <SoloSettingsModal
          opened
          onClose={vi.fn()}
          testSkill="Listening"
          resolvedSettings={resolvedSettings}
          studentPrefs={studentPrefs}
          onPrefsChange={vi.fn()}
          onExit={onExit}
        />
      </MantineProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Exit' }));

    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
