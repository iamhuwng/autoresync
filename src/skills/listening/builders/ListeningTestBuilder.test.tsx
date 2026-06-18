import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '../../../test/test-utils';
import ListeningTestBuilder from './ListeningTestBuilder';

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
    mocks.uploadAudioReplacement.mockResolvedValue({
      url: 'https://cdn.example.com/listening.mp3',
      streamUrl: 'https://cdn.example.com/listening.mp3',
      directUrl: 'https://cdn.example.com/listening.mp3',
      fileName: 'tiny.mp3',
      key: 'temp/listening-audio/tiny.mp3',
      isTemp: true,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('adopts the shared empty-question state after skipping text-mode parsing', async () => {
    const user = userEvent.setup();
    render(<ListeningTestBuilder />);

    await user.click(screen.getByRole('button', { name: 'Next →' }));
    expect(screen.getByRole('heading', { name: 'Audio Configuration' })).toBeInTheDocument();

    const audioInput = document.querySelector('#audio-upload-1');
    expect(audioInput).toBeInstanceOf(HTMLInputElement);

    const audioFile = new File(['tiny audio'], 'tiny.mp3', { type: 'audio/mpeg' });
    await user.upload(audioInput as HTMLInputElement, audioFile);

    await waitFor(() => {
      expect(mocks.uploadAudioReplacement).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole('button', { name: 'Next →' }));
    expect(
      await screen.findByRole('heading', { name: '🤖 AI Question Parsing' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Skip → Add Manually' }));

    expect(await screen.findByRole('heading', { name: 'Questions (0/10)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Question/ })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'No questions added yet' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Click "Add Question" to start.')).toBeInTheDocument();

    expect(mocks.parseListening).not.toHaveBeenCalled();
    expect(mocks.parseAnswerKey).not.toHaveBeenCalled();
    expect(mocks.saveListeningTestToFirebase).not.toHaveBeenCalled();
    expect(mocks.validateAudioLink).not.toHaveBeenCalled();
    expect(mocks.uploadAudioReplacement).toHaveBeenCalledTimes(1);
  });
});
