import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '../../../test/test-utils';
import ListeningTestBuilder from './ListeningTestBuilder';

vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();

  return {
    ...react,
    useState<T>(initialState: T | (() => T)) {
      return react.useState<T>(() => {
        const value = typeof initialState === 'function'
          ? (initialState as () => T)()
          : initialState;

        // Seed existing audio metadata so this layout test can traverse the
        // normal text-mode steps without exercising upload or validation services.
        if (
          value
          && typeof value === 'object'
          && 'skill' in value
          && value.skill === 'Listening'
          && 'sections' in value
          && Array.isArray(value.sections)
        ) {
          return {
            ...value,
            sections: value.sections.map((section, index) => index === 0
              ? {
                  ...section,
                  audioUrl: 'https://cdn.example.com/listening.mp3',
                  streamUrl: 'https://cdn.example.com/listening.mp3',
                }
              : section),
          } as T;
        }

        return value;
      });
    },
  };
});

const mocks = vi.hoisted(() => ({
  navigateTo: vi.fn(),
  parseListening: vi.fn(),
  parseAnswerKey: vi.fn(),
  saveListeningTestToFirebase: vi.fn(),
  uploadAudioReplacement: vi.fn(),
  validateAudioLink: vi.fn(),
}));

vi.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'teacher-1' },
  }),
}));

vi.mock('../../../hooks/useNavigation', () => ({
  useNavigation: () => ({
    navigateTo: mocks.navigateTo,
  }),
}));

vi.mock('../../../services/listeningTestStorage', () => ({
  AUDIO_CONTROLS_PRESETS: {
    IELTS_STANDARD: {
      showPlayPause: false,
      showProgressBar: true,
      showSeekControl: false,
      showSpeedControl: false,
      showSkipSection: false,
      showVolumeControl: true,
    },
  },
  saveListeningTestToFirebase: mocks.saveListeningTestToFirebase,
}));

vi.mock('../../../services/r2Storage', () => ({
  default: {
    uploadAudioReplacement: mocks.uploadAudioReplacement,
  },
}));

vi.mock('../../../services/googleDriveAudio', () => ({
  googleDriveAudioService: {
    validateAudioLink: mocks.validateAudioLink,
  },
}));

vi.mock('../../../services/parser/listening.router', () => ({
  listeningRouter: {
    parseListening: mocks.parseListening,
    parseAnswerKey: mocks.parseAnswerKey,
  },
}));

describe('ListeningTestBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('uses the neutral authoring layout for empty Step 4 after skipping text-mode parsing', async () => {
    const user = userEvent.setup();
    render(<ListeningTestBuilder />);

    const modeHeader = screen.getByRole('region', { name: 'Choose Display Mode' });

    expect(modeHeader).toContainElement(
      screen.getByRole('heading', { name: 'Choose Display Mode' }),
    );
    expect(modeHeader).toHaveTextContent(
      'Select how your listening test questions will be displayed to students',
    );
    expect(modeHeader).toHaveClass('assessment-authoring-header');

    await user.click(screen.getByRole('button', { name: 'Next →' }));
    expect(screen.getByRole('heading', { name: 'Audio Configuration' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next →' }));
    expect(
      await screen.findByRole('heading', { name: '🤖 AI Question Parsing' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Skip → Add Manually' }));

    expect(await screen.findByRole('heading', { name: 'Questions (0/10)' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Questions (0/10)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Question/ })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'No questions added yet' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Click "Add Question" to start.')).toBeInTheDocument();

    expect(mocks.parseListening).not.toHaveBeenCalled();
    expect(mocks.parseAnswerKey).not.toHaveBeenCalled();
    expect(mocks.saveListeningTestToFirebase).not.toHaveBeenCalled();
    expect(mocks.validateAudioLink).not.toHaveBeenCalled();
    expect(mocks.uploadAudioReplacement).not.toHaveBeenCalled();
  });

  it('renders display mode options as keyboard-reachable buttons with pressed state', async () => {
    const user = userEvent.setup();
    render(<ListeningTestBuilder />);

    const textMode = screen.getByRole('button', { name: 'IELTS Text Format' });
    const imageMode = screen.getByRole('button', { name: 'Image Mode' });

    expect(textMode).toHaveAttribute('aria-pressed', 'true');
    expect(imageMode).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('group', { name: 'Display mode options' })).toBeInTheDocument();
    expect(textMode.style.background).toBe('rgb(37, 99, 235)');
    expect(imageMode.style.background).toBe('rgb(255, 255, 255)');

    await user.tab();
    expect(textMode).toHaveFocus();

    await user.keyboard('{Tab}');
    expect(imageMode).toHaveFocus();

    await user.keyboard('{Enter}');

    expect(imageMode).toHaveAttribute('aria-pressed', 'true');
    expect(textMode).toHaveAttribute('aria-pressed', 'false');
    expect(imageMode.style.background).toBe('rgb(79, 70, 229)');
    expect(textMode.style.background).toBe('rgb(255, 255, 255)');
  });

  it('keeps display mode buttons semantically valid and scoped to explicit transitions', () => {
    render(<ListeningTestBuilder />);

    const textMode = screen.getByRole('button', { name: 'IELTS Text Format' });
    const imageMode = screen.getByRole('button', { name: 'Image Mode' });

    expect(textMode.querySelector('div,h3,p,ul,li')).toBeNull();
    expect(imageMode.querySelector('div,h3,p,ul,li')).toBeNull();
    expect(textMode.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
    expect(imageMode.querySelector('svg[aria-hidden="true"]')).toBeInTheDocument();
    expect(textMode.style.transition).not.toContain('all');
    expect(imageMode.style.transition).not.toContain('all');
  });
});
