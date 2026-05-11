import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioPlayer } from './AudioPlayer';

vi.mock('../../../services/googleDriveAudio', () => ({
  googleDriveAudioService: {
    isGoogleDriveUrl: vi.fn(() => false),
    processAudioLink: vi.fn(),
  },
}));

vi.mock('../../../hooks/audio', () => ({
  useAudioSync: vi.fn(() => ({
    isSyncing: false,
    isTeacherDisconnected: false,
  })),
}));

vi.mock('../../../components/test/SyncIndicator', () => ({
  SyncIndicator: () => null,
}));

describe('AudioPlayer', () => {
  const playMock = vi.fn();
  const pauseMock = vi.fn();
  const loadMock = vi.fn();
  let pausedValue = true;
  let readyStateValue = 2;

  beforeEach(() => {
    playMock.mockReset();
    pauseMock.mockReset();
    loadMock.mockReset();
    pausedValue = true;
    readyStateValue = 2;
    playMock.mockImplementation(async () => {
      pausedValue = false;
    });
    pauseMock.mockImplementation(() => {
      pausedValue = true;
    });
    loadMock.mockImplementation(() => {
      pausedValue = true;
    });

    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: playMock,
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
      configurable: true,
      value: pauseMock,
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'load', {
      configurable: true,
      value: loadMock,
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', {
      configurable: true,
      get: () => readyStateValue,
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
      configurable: true,
      get: () => pausedValue,
    });
  });

  it('attempts playback directly from the play tap in the mobile layout', async () => {
    playMock.mockResolvedValue(undefined);
    const onPlayPause = vi.fn();

    render(
      <AudioPlayer
        audioUrl="https://cdn.example.com/audio.mp3"
        sectionNumber={1}
        isPlaying={false}
        volume={1}
        playbackSpeed={1}
        onPlayPause={onPlayPause}
        onTimeUpdate={() => {}}
        onSectionComplete={() => {}}
        onError={() => {}}
        playerMode="solo"
        minimal
        mobileLayout
      />,
    );

    const playButton = await screen.findByRole('button', { name: 'Play' });
    fireEvent.click(playButton);

    expect(playMock).toHaveBeenCalledTimes(1);
    expect(onPlayPause).toHaveBeenCalledTimes(1);
  });

  it('renders touch-friendly controls in the mobile layout', async () => {
    playMock.mockResolvedValue(undefined);

    render(
      <AudioPlayer
        audioUrl="https://cdn.example.com/audio.mp3"
        sectionNumber={1}
        isPlaying={false}
        volume={0.6}
        playbackSpeed={1}
        onPlayPause={() => {}}
        onTimeUpdate={() => {}}
        onSectionComplete={() => {}}
        onError={() => {}}
        onVolumeChange={() => {}}
        playerMode="solo"
        minimal
        mobileLayout
      />,
    );

    expect(await screen.findByLabelText('Audio progress')).toBeTruthy();
    expect(screen.getByLabelText('Volume')).toBeTruthy();
    expect(screen.queryByLabelText('Decrease volume')).toBeNull();
    expect(screen.queryByLabelText('Increase volume')).toBeNull();
  });

  it('keeps the speed select in sync with external playbackSpeed changes', async () => {
    playMock.mockResolvedValue(undefined);

    const { rerender } = render(
      <AudioPlayer
        audioUrl="https://cdn.example.com/audio.mp3"
        sectionNumber={1}
        isPlaying={false}
        volume={1}
        playbackSpeed={1}
        onPlayPause={() => {}}
        onTimeUpdate={() => {}}
        onSectionComplete={() => {}}
        onError={() => {}}
        playerMode="solo"
        minimal
        mobileLayout
      />,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('1x')).toBeTruthy();
    });

    rerender(
      <AudioPlayer
        audioUrl="https://cdn.example.com/audio.mp3"
        sectionNumber={1}
        isPlaying={false}
        volume={1}
        playbackSpeed={1.5}
        onPlayPause={() => {}}
        onTimeUpdate={() => {}}
        onSectionComplete={() => {}}
        onError={() => {}}
        playerMode="solo"
        minimal
        mobileLayout
      />,
    );

    await waitFor(() => {
      const select = screen.getByDisplayValue('1.5x') as HTMLSelectElement;
      expect(select.value).toBe('1.5');
    });
  });

  it('restarts playback after changing source while active', async () => {
    const onPlayPause = vi.fn();

    const { rerender } = render(
      <AudioPlayer
        audioUrl="https://cdn.example.com/audio-1.mp3"
        sectionNumber={1}
        isPlaying
        volume={1}
        playbackSpeed={1}
        onPlayPause={onPlayPause}
        onTimeUpdate={() => {}}
        onSectionComplete={() => {}}
        onError={() => {}}
        playerMode="solo"
        minimal
        mobileLayout
      />,
    );

    await waitFor(() => {
      expect(playMock).toHaveBeenCalled();
    });

    playMock.mockClear();
    loadMock.mockClear();
    pausedValue = false;

    rerender(
      <AudioPlayer
        audioUrl="https://cdn.example.com/audio-2.mp3"
        sectionNumber={2}
        isPlaying
        volume={1}
        playbackSpeed={1}
        onPlayPause={onPlayPause}
        onTimeUpdate={() => {}}
        onSectionComplete={() => {}}
        onError={() => {}}
        playerMode="solo"
        minimal
        mobileLayout
      />,
    );

    await waitFor(() => {
      expect(loadMock).toHaveBeenCalled();
      expect(playMock).toHaveBeenCalled();
    });
    expect(onPlayPause).not.toHaveBeenCalled();
  });

  it('finishes the section instead of auto-replaying when audio ends', async () => {
    playMock.mockResolvedValue(undefined);
    const onSectionComplete = vi.fn();

    const { container } = render(
      <AudioPlayer
        audioUrl="https://cdn.example.com/audio.mp3"
        sectionNumber={1}
        isPlaying={false}
        volume={1}
        playbackSpeed={1}
        onPlayPause={() => {}}
        onTimeUpdate={() => {}}
        onSectionComplete={onSectionComplete}
        onError={() => {}}
        allowReplay
        maxReplays={2}
        playerMode="solo"
        minimal
        mobileLayout
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('audio')).toBeTruthy();
    });

    fireEvent.ended(container.querySelector('audio') as HTMLAudioElement);

    expect(onSectionComplete).toHaveBeenCalledTimes(1);
    expect(playMock).not.toHaveBeenCalled();
  });
});
