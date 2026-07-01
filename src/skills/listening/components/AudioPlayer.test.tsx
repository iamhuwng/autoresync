import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { googleDriveAudioService } from '../../../services/googleDriveAudio';
import { useAudioSync } from '../../../hooks/audio';
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
  SyncIndicator: ({ isTeacherDisconnected, isSyncing }: { isTeacherDisconnected?: boolean; isSyncing?: boolean }) => (
    <div role="status" aria-live="polite">
      {isTeacherDisconnected ? 'Teacher connection lost, continuing...' : isSyncing ? 'Syncing...' : ''}
    </div>
  ),
}));

describe('AudioPlayer', () => {
  const playMock = vi.fn();
  const pauseMock = vi.fn();
  const loadMock = vi.fn();
  const originalMediaDescriptors = {
    play: Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'play'),
    pause: Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'pause'),
    load: Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'load'),
    readyState: Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'readyState'),
    paused: Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'paused'),
  };
  let pausedValue = true;
  let readyStateValue = 2;

  beforeEach(() => {
    vi.useRealTimers();
    playMock.mockReset();
    pauseMock.mockReset();
    loadMock.mockReset();
    vi.mocked(googleDriveAudioService.isGoogleDriveUrl).mockReturnValue(false);
    vi.mocked(googleDriveAudioService.processAudioLink).mockReset();
    vi.mocked(useAudioSync).mockReturnValue({
      isSyncing: false,
      isTeacherDisconnected: false,
    });
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

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    for (const [propertyName, descriptor] of Object.entries(originalMediaDescriptors)) {
      if (descriptor) {
        Object.defineProperty(HTMLMediaElement.prototype, propertyName, descriptor);
      } else {
        delete (HTMLMediaElement.prototype as Record<string, unknown>)[propertyName];
      }
    }
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

  it('does not surface interrupted source-handoff play requests as audio errors', async () => {
    const onError = vi.fn();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    playMock.mockRejectedValueOnce(
      new DOMException('The play() request was interrupted by a new load request.', 'AbortError'),
    );

    render(
      <AudioPlayer
        audioUrl="https://cdn.example.com/audio-1.mp3"
        sectionNumber={1}
        isPlaying
        volume={1}
        playbackSpeed={1}
        onPlayPause={() => {}}
        onTimeUpdate={() => {}}
        onSectionComplete={() => {}}
        onError={onError}
        playerMode="session"
        audioMode="online"
      />,
    );

    await waitFor(() => {
      expect(playMock).toHaveBeenCalled();
    });

    expect(onError).not.toHaveBeenCalled();
    expect(consoleErrorSpy).not.toHaveBeenCalledWith('Playback failed:', expect.anything());
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

  it('keeps the old authorized URL active until the refreshed source is ready and preserves teacher authority', async () => {
    const onPlayPause = vi.fn();
    let prepareReplacement!: () => void;
    const prepareReplacementSource = vi.fn(() => new Promise<void>((resolve) => {
      prepareReplacement = resolve;
    }));
    const refreshSource = vi.fn().mockResolvedValue({
      url: 'https://authorized.example/audio.mp3?X-Amz-Signature=NEWSECRET',
      expiresAt: Date.now() + 60 * 60 * 1000,
      refreshAfter: Date.now() + 50 * 60 * 1000,
    });

    const { container } = render(
      <AudioPlayer
        audioUrl="https://authorized.example/audio.mp3?X-Amz-Signature=OLDSECRET"
        sectionNumber={1}
        isPlaying
        volume={0.75}
        playbackSpeed={1}
        onPlayPause={onPlayPause}
        onTimeUpdate={() => {}}
        onSectionComplete={() => {}}
        onError={() => {}}
        playerMode="session"
        audioMode="online"
        masterAudioState={{
          schemaVersion: 2,
          revision: 7,
          section: 1,
          position: 42,
          isPlaying: true,
          speed: 1.25,
          timestamp: Date.now(),
          lastAction: 'play',
          lastActionTimestamp: Date.now(),
        }}
        authorizedDelivery={{
          expiresAt: Date.now() + 9 * 60 * 1000,
          refreshAfter: Date.now(),
          refreshSource,
          prepareReplacementSource,
        }}
        minimal
      />,
    );

    const audio = await waitFor(() => {
      const element = container.querySelector('audio') as HTMLAudioElement | null;
      expect(element?.getAttribute('src')).toContain('OLDSECRET');
      return element as HTMLAudioElement;
    });

    await waitFor(() => {
      expect(refreshSource).toHaveBeenCalledTimes(1);
    });
    expect(prepareReplacementSource).toHaveBeenCalledWith(expect.stringContaining('NEWSECRET'));
    expect(audio.getAttribute('src')).toContain('OLDSECRET');

    prepareReplacement();

    await waitFor(() => {
      expect(audio.getAttribute('src')).toContain('NEWSECRET');
      expect(audio.currentTime).toBeCloseTo(42, 1);
      expect(audio.playbackRate).toBe(1.25);
    });
    expect(onPlayPause).not.toHaveBeenCalled();
  });

  it('retries refresh with bounded backoff without pausing active playback', async () => {
    const onPlayPause = vi.fn();
    const onRefreshWarning = vi.fn();
    const refreshSource = vi.fn().mockRejectedValue(new Error('network_down'));

    render(
      <AudioPlayer
        audioUrl="https://authorized.example/audio.mp3?X-Amz-Signature=OLDSECRET"
        sectionNumber={1}
        isPlaying
        volume={1}
        playbackSpeed={1}
        onPlayPause={onPlayPause}
        onTimeUpdate={() => {}}
        onSectionComplete={() => {}}
        onError={() => {}}
        playerMode="session"
        audioMode="online"
        masterAudioState={{
          schemaVersion: 2,
          revision: 11,
          section: 1,
          position: 18,
          isPlaying: true,
          speed: 1,
          timestamp: Date.now(),
          lastAction: 'play',
          lastActionTimestamp: Date.now(),
        }}
        authorizedDelivery={{
          expiresAt: Date.now() + 90 * 1000,
          refreshAfter: Date.now(),
          refreshSource,
          retryBackoffMs: [1, 1],
          onRefreshWarning,
        }}
        minimal
      />,
    );

    await waitFor(() => {
      expect(refreshSource).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(refreshSource).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(refreshSource).toHaveBeenCalledTimes(3);
    });
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(refreshSource).toHaveBeenCalledTimes(3);
    expect(pauseMock).not.toHaveBeenCalled();
    expect(onPlayPause).not.toHaveBeenCalled();
    expect(JSON.stringify(onRefreshWarning.mock.calls)).not.toContain('OLDSECRET');
  });

  it('shows an actionable refresh warning without signed URLs and clears it after recovery', async () => {
    const onRefreshWarning = vi.fn();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const refreshSource = vi.fn()
      .mockRejectedValueOnce(new Error('https://authorized.example/private/raw-key.mp3?token=OLDSECRET'))
      .mockResolvedValueOnce({
        url: 'https://authorized.example/private/raw-key.mp3?token=NEWSECRET',
        expiresAt: Date.now() + 60 * 60 * 1000,
        refreshAfter: Date.now() + 50 * 60 * 1000,
      });

    render(
      <AudioPlayer
        audioUrl="https://authorized.example/private/raw-key.mp3?token=OLDSECRET"
        sectionNumber={1}
        isPlaying={false}
        volume={1}
        playbackSpeed={1}
        onPlayPause={() => {}}
        onTimeUpdate={() => {}}
        onSectionComplete={() => {}}
        onError={() => {}}
        playerMode="session"
        audioMode="online"
        masterAudioState={{
          schemaVersion: 2,
          revision: 3,
          section: 1,
          position: 12,
          isPlaying: false,
          speed: 1,
          timestamp: Date.now(),
          lastAction: 'pause',
          lastActionTimestamp: Date.now(),
        }}
        authorizedDelivery={{
          expiresAt: Date.now() + 90 * 1000,
          refreshAfter: Date.now(),
          refreshSource,
          retryBackoffMs: [1],
          prepareReplacementSource: vi.fn().mockResolvedValue(undefined),
          onRefreshWarning,
        }}
        minimal
      />,
    );

    const warning = await screen.findByRole('alert');
    expect(warning.textContent).toMatch(/audio source refresh needs attention/i);
    expect(warning.textContent).toMatch(/playback continues/i);
    expect(warning.textContent).not.toContain('OLDSECRET');
    expect(warning.textContent).not.toContain('NEWSECRET');
    expect(warning.textContent).not.toContain('raw-key');

    await waitFor(() => {
      expect(screen.queryByRole('alert')).toBeNull();
    });
    expect(onRefreshWarning).toHaveBeenLastCalledWith(null);
    expect(JSON.stringify(onRefreshWarning.mock.calls)).not.toContain('OLDSECRET');
    expect(JSON.stringify(onRefreshWarning.mock.calls)).not.toContain('NEWSECRET');
    expect(JSON.stringify(onRefreshWarning.mock.calls)).not.toContain('raw-key');
    const warnPayload = JSON.stringify(warnSpy.mock.calls);
    expect(warnPayload).toContain('redacted_refresh_error');
    expect(warnPayload).not.toContain('OLDSECRET');
    expect(warnPayload).not.toContain('NEWSECRET');
    expect(warnPayload).not.toContain('raw-key');
    warnSpy.mockRestore();
  });

  it('exposes live loading, error, sync, and refresh-warning semantics with reachable named controls', async () => {
    vi.mocked(googleDriveAudioService.isGoogleDriveUrl).mockReturnValue(true);
    vi.mocked(googleDriveAudioService.processAudioLink).mockReturnValue(new Promise(() => {}));

    const { rerender } = render(
      <AudioPlayer
        audioUrl="https://drive.google.com/file/d/audio/view"
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

    expect(screen.getByRole('status').textContent).toMatch(/loading audio/i);

    vi.mocked(googleDriveAudioService.processAudioLink).mockResolvedValue({
      type: 'error',
      url: '',
      fileId: '',
      originalUrl: 'https://drive.google.com/file/d/audio/view',
      errorMessage: 'Audio load error',
    });

    rerender(
      <AudioPlayer
        audioUrl="https://drive.google.com/file/d/audio-2/view"
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

    expect((await screen.findByRole('alert')).textContent).toMatch(/audio load error/i);

    vi.mocked(googleDriveAudioService.isGoogleDriveUrl).mockReturnValue(false);
    vi.mocked(useAudioSync).mockReturnValue({
      isSyncing: false,
      isTeacherDisconnected: true,
    });

    rerender(
      <AudioPlayer
        audioUrl="https://cdn.example.com/audio.mp3"
        sectionNumber={1}
        isPlaying={false}
        volume={0.5}
        playbackSpeed={1}
        onPlayPause={() => {}}
        onTimeUpdate={() => {}}
        onSectionComplete={() => {}}
        onError={() => {}}
        onSkipSection={() => {}}
        onRequestHeadphones={() => {}}
        playerMode="session"
        audioMode="online"
        masterAudioState={{
          schemaVersion: 2,
          revision: 1,
          section: 1,
          position: 0,
          isPlaying: false,
          speed: 1,
          timestamp: Date.now(),
          lastAction: 'pause',
          lastActionTimestamp: Date.now(),
        }}
        audioControls={{
          showPlayPause: true,
          showProgressBar: true,
          showSeekControl: true,
          showSpeedControl: true,
          showSkipSection: true,
          showVolumeControl: true,
        }}
        authorizedDelivery={{
          expiresAt: Date.now() + 90 * 1000,
          refreshAfter: Date.now() + 60 * 1000,
          refreshSource: vi.fn(),
          onRefreshWarning: vi.fn(),
        }}
        minimal
        mobileLayout
      />,
    );

    expect(screen.getByRole('status').textContent).toMatch(/teacher connection lost/i);
    expect(screen.getByLabelText('Audio progress')).toBeTruthy();
    expect(screen.getByLabelText('Volume')).toBeTruthy();
    expect(screen.getByText(/source expires soon/i)).toBeTruthy();

    rerender(
      <AudioPlayer
        audioUrl="https://cdn.example.com/audio.mp3"
        sectionNumber={1}
        isPlaying={false}
        volume={0.5}
        playbackSpeed={1}
        onPlayPause={() => {}}
        onTimeUpdate={() => {}}
        onSectionComplete={() => {}}
        onError={() => {}}
        onSkipSection={() => {}}
        playerMode="solo"
        minimal
        mobileLayout
      />,
    );

    expect(screen.getByRole('button', { name: 'Play' }).tabIndex).not.toBe(-1);
    expect(screen.getByRole('button', { name: /skip to next section/i }).tabIndex).not.toBe(-1);
    expect(screen.getByLabelText('Playback speed')).toBeTruthy();
    expect(screen.getByRole('button', { name: /skip to next section/i }).style.minHeight).toBe('44px');
    expect((screen.getByLabelText('Playback speed') as HTMLElement).style.minHeight).toBe('44px');
  });
});
