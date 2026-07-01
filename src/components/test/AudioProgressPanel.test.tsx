import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioProgressPanel } from './AudioProgressPanel';
import { TEACHER_MONITOR_AUDIO_RESUME_EVENT } from './teacherMonitorAudioEvents';

describe('AudioProgressPanel accessibility', () => {
  beforeEach(() => {
    vi.spyOn(window.HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps live monitor audio controls named, keyboard reachable, and touch sized', () => {
    const onSkipToSection = vi.fn();
    const onSeekToPosition = vi.fn();

    const { container } = render(
      <AudioProgressPanel
        audioSections={[
          { number: 1, name: 'First', duration: 120, audioUrl: 'data:audio/wav;base64,UklGRg==' },
          { number: 2, name: 'Second', duration: 120, audioUrl: 'data:audio/wav;base64,UklGRg==' },
        ]}
        currentSection={1}
        isPlaying
        isPaused={false}
        onSkipToSection={onSkipToSection}
        onSeekToPosition={onSeekToPosition}
        onPauseAudio={vi.fn()}
        onResumeAudio={vi.fn()}
        playbackSpeed={1}
        audioMode="online"
        enableUnifiedAudio
      />,
    );

    expect(screen.getByRole('slider', { name: /teacher monitor volume/i })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /seek section 1/i })).toBeInTheDocument();

    const progressBar = screen.getByTestId('audio-section-progress-bar');
    expect(progressBar.style.height).toBe('44px');
    expect(progressBar.style.alignItems).toBe('stretch');

    const firstSegment = screen.getByTestId('audio-section-segment-1');
    expect(firstSegment.style.height).toBe('44px');
    expect(firstSegment.style.flexBasis).toBe('50%');

    const teacherAudio = container.querySelector('audio') as HTMLAudioElement;
    fireEvent.loadedData(teacherAudio);
    fireEvent.play(teacherAudio);

    const pauseButton = screen.getByRole('button', { name: /pause all audio/i });
    expect(pauseButton.style.width).toBe('44px');
    expect(pauseButton.style.height).toBe('44px');

    const sectionButton = screen.getByRole('button', { name: /^Jump to section 2, upcoming$/i });
    expect(sectionButton.tabIndex).toBe(0);
    fireEvent.keyDown(sectionButton, { key: 'Enter' });
    expect(onSkipToSection).toHaveBeenCalledWith(2, expect.objectContaining({ section: 2 }));

    const currentLegend = screen.getByRole('button', { name: /jump to section 1, current/i });
    expect(currentLegend).toHaveAttribute('aria-pressed', 'true');
    expect(currentLegend.style.minHeight).toBe('44px');

    const timeEditor = screen.getByRole('button', { name: /edit current audio time/i });
    expect(timeEditor.tabIndex).toBe(0);

    const seekSlider = screen.getByRole('slider', { name: /seek section 1/i });
    fireEvent.change(seekSlider, { target: { value: '12' } });
    fireEvent.mouseUp(seekSlider);
    expect(teacherAudio.currentTime).toBe(12);
    expect(onSeekToPosition).toHaveBeenCalledWith(1, 12, expect.objectContaining({ position: 12 }));

    fireEvent.click(timeEditor);
    const manualTimeInput = container.querySelector('input:not([type])') as HTMLInputElement;
    fireEvent.change(manualTimeInput, { target: { value: '0:15' } });
    fireEvent.keyDown(manualTimeInput, { key: 'Enter' });
    expect(teacherAudio.currentTime).toBe(15);
    expect(onSeekToPosition).toHaveBeenCalledWith(1, 15, expect.objectContaining({ position: 15 }));
  });

  it('updates the teacher monitor play button from the actual media playback state', async () => {
    render(
      <AudioProgressPanel
        audioSections={[{ number: 1, name: 'First', duration: 20, audioUrl: 'data:audio/wav;base64,UklGRg==' }]}
        currentSection={1}
        isPlaying={false}
        isPaused
        onSkipToSection={vi.fn()}
        onPauseAudio={vi.fn()}
        onResumeAudio={vi.fn()}
        playbackSpeed={1}
        audioMode="online"
        enableUnifiedAudio
      />,
    );

    const teacherAudio = document.querySelector('audio') as HTMLAudioElement;
    expect(screen.getByRole('button', { name: /resume all audio/i })).toBeInTheDocument();

    fireEvent.play(teacherAudio);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /pause all audio/i })).toBeInTheDocument();
    });
  });

  it('refreshes private audio without losing teacher position, speed, or play intent', async () => {
    vi.useFakeTimers();
    const play = vi
      .spyOn(window.HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined);
    const refreshSource = vi.fn(async () => ({
      url: 'https://delivery.example/refreshed.wav',
      expiresAt: 3_700_000,
      refreshAfter: 3_100_000,
    }));
    const prepareReplacementSource = vi.fn(async () => undefined);

    render(
      <AudioProgressPanel
        audioSections={[{
          number: 1,
          name: 'First',
          duration: 20,
          audioUrl: 'https://delivery.example/initial.wav',
        }]}
        currentSection={1}
        isPlaying
        isPaused={false}
        onSkipToSection={vi.fn()}
        onPauseAudio={vi.fn()}
        onResumeAudio={vi.fn()}
        playbackSpeed={1.25}
        audioMode="online"
        enableUnifiedAudio
        masterRevision={7}
        authorizedDelivery={{
          expiresAt: 3_600_000,
          refreshAfter: 0,
          now: () => 0,
          refreshSource,
          prepareReplacementSource,
        }}
      />,
    );

    const teacherAudio = document.querySelector('audio') as HTMLAudioElement;
    Object.defineProperty(teacherAudio, 'paused', { configurable: true, value: false });
    Object.defineProperty(teacherAudio, 'ended', { configurable: true, value: false });
    Object.defineProperty(teacherAudio, 'readyState', { configurable: true, value: 1 });
    Object.defineProperty(teacherAudio, 'duration', { configurable: true, value: 20 });
    teacherAudio.currentTime = 7;
    teacherAudio.playbackRate = 1.25;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(refreshSource).toHaveBeenCalledWith({
      sectionNumber: 1,
      masterRevision: 7,
      expiresAt: 3_600_000,
    });
    expect(prepareReplacementSource).toHaveBeenCalledWith(
      'https://delivery.example/refreshed.wav',
    );
    expect(teacherAudio.src).toBe('https://delivery.example/refreshed.wav');
    expect(teacherAudio.currentTime).toBe(7);
    expect(teacherAudio.playbackRate).toBe(1.25);
    expect(play).toHaveBeenCalled();
    expect(screen.queryByText(/private audio refresh/i)).not.toBeInTheDocument();
  });

  it('accepts a refreshed private URL when browser replacement preload is blocked', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const play = vi
      .spyOn(window.HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined);
    const refreshSource = vi.fn(async () => ({
      url: 'https://delivery.example/refreshed-ios.wav',
      expiresAt: 3_700_000,
      refreshAfter: 3_100_000,
    }));

    class BlockedPreloadAudio {
      preload = '';
      src = '';
      oncanplay: (() => void) | null = null;
      onloadedmetadata: (() => void) | null = null;
      onerror: (() => void) | null = null;

      load() {
        setTimeout(() => this.onerror?.(), 0);
      }
    }

    vi.stubGlobal('Audio', BlockedPreloadAudio);

    render(
      <AudioProgressPanel
        audioSections={[{
          number: 1,
          name: 'First',
          duration: 20,
          audioUrl: 'https://delivery.example/initial-ios.wav',
        }]}
        currentSection={1}
        isPlaying
        isPaused={false}
        onSkipToSection={vi.fn()}
        onPauseAudio={vi.fn()}
        onResumeAudio={vi.fn()}
        playbackSpeed={1}
        audioMode="online"
        enableUnifiedAudio
        masterRevision={8}
        authorizedDelivery={{
          expiresAt: 3_600_000,
          refreshAfter: 0,
          now: () => 0,
          refreshSource,
        }}
      />,
    );

    const teacherAudio = document.querySelector('audio') as HTMLAudioElement;
    Object.defineProperty(teacherAudio, 'paused', { configurable: true, value: false });
    Object.defineProperty(teacherAudio, 'ended', { configurable: true, value: false });
    Object.defineProperty(teacherAudio, 'readyState', { configurable: true, value: 1 });
    Object.defineProperty(teacherAudio, 'duration', { configurable: true, value: 20 });
    teacherAudio.currentTime = 5;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(teacherAudio.src).toBe('https://delivery.example/refreshed-ios.wav');
    expect(refreshSource).toHaveBeenCalledWith({
      sectionNumber: 1,
      masterRevision: 8,
      expiresAt: 3_600_000,
    });
    expect(teacherAudio.currentTime).toBe(5);
    expect(play).toHaveBeenCalled();
    expect(screen.queryByText(/private audio refresh/i)).not.toBeInTheDocument();
  });

  it('uses the actual media pause state in unified authority snapshots', () => {
    const onSkipToSection = vi.fn();

    render(
      <AudioProgressPanel
        audioSections={[
          { number: 1, name: 'First', duration: 20, audioUrl: 'data:audio/wav;base64,UklGRg==' },
          { number: 2, name: 'Second', duration: 20, audioUrl: 'data:audio/wav;base64,UklGRg==' },
        ]}
        currentSection={1}
        isPlaying
        isPaused={false}
        onSkipToSection={onSkipToSection}
        onPauseAudio={vi.fn()}
        onResumeAudio={vi.fn()}
        playbackSpeed={1}
        audioMode="online"
        enableUnifiedAudio
      />,
    );

    const teacherAudio = document.querySelector('audio') as HTMLAudioElement;
    expect(teacherAudio.paused).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /^Jump to section 2, upcoming$/i }));

    expect(onSkipToSection).toHaveBeenCalledWith(2, expect.objectContaining({
      section: 2,
      position: 0,
      isPlaying: false,
    }));
  });

  it('restarts an ended teacher monitor clip before broadcasting resume', async () => {
    const play = vi
      .spyOn(window.HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined);
    const onResumeAudio = vi.fn();

    render(
      <AudioProgressPanel
        audioSections={[{ number: 1, name: 'First', duration: 20, audioUrl: 'data:audio/wav;base64,UklGRg==' }]}
        currentSection={1}
        isPlaying={false}
        isPaused
        onSkipToSection={vi.fn()}
        onPauseAudio={vi.fn()}
        onResumeAudio={onResumeAudio}
        playbackSpeed={1}
        audioMode="online"
        enableUnifiedAudio
      />,
    );

    const teacherAudio = document.querySelector('audio') as HTMLAudioElement;
    Object.defineProperty(teacherAudio, 'duration', { configurable: true, value: 20 });
    Object.defineProperty(teacherAudio, 'ended', { configurable: true, value: true });
    teacherAudio.currentTime = 20;
    fireEvent.loadedData(teacherAudio);

    fireEvent.click(screen.getByRole('button', { name: /resume all audio/i }));

    await waitFor(() => expect(play).toHaveBeenCalled());
    expect(teacherAudio.currentTime).toBe(0);
    expect(onResumeAudio).toHaveBeenCalledWith(expect.objectContaining({ position: 0, isPlaying: true }));
  });

  it('starts local teacher monitor audio from the toolbar resume gesture event', async () => {
    const play = vi
      .spyOn(window.HTMLMediaElement.prototype, 'play')
      .mockResolvedValue(undefined);

    render(
      <AudioProgressPanel
        audioSections={[{ number: 1, name: 'First', duration: 20, audioUrl: 'data:audio/wav;base64,UklGRg==' }]}
        currentSection={1}
        isPlaying={false}
        isPaused
        onSkipToSection={vi.fn()}
        onPauseAudio={vi.fn()}
        onResumeAudio={vi.fn()}
        playbackSpeed={1}
        audioMode="online"
        enableUnifiedAudio
      />,
    );

    const teacherAudio = document.querySelector('audio') as HTMLAudioElement;
    fireEvent.loadedData(teacherAudio);

    window.dispatchEvent(new CustomEvent(TEACHER_MONITOR_AUDIO_RESUME_EVENT, {
      detail: { source: 'control-bar' },
    }));

    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
  });

  it('reports browser gesture policy blocks without console errors', async () => {
    const notAllowedError = new DOMException('play() failed because the user did not interact first', 'NotAllowedError');
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockRejectedValue(notAllowedError);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    render(
      <AudioProgressPanel
        audioSections={[{ number: 1, name: 'First', duration: 20, audioUrl: 'data:audio/wav;base64,UklGRg==' }]}
        currentSection={1}
        isPlaying={false}
        isPaused
        onSkipToSection={vi.fn()}
        onPauseAudio={vi.fn()}
        onResumeAudio={vi.fn()}
        playbackSpeed={1}
        audioMode="online"
        enableUnifiedAudio
      />,
    );

    const teacherAudio = document.querySelector('audio') as HTMLAudioElement;
    fireEvent.loadedData(teacherAudio);
    fireEvent.click(screen.getByRole('button', { name: /resume all audio/i }));

    await waitFor(() => {
      expect(consoleInfo).toHaveBeenCalledWith(
        '[AudioPanel] Teacher monitor playback requires a direct browser gesture',
        expect.objectContaining({ errorName: 'NotAllowedError', reason: 'teacher-toggle' }),
      );
    });

    expect(consoleError).not.toHaveBeenCalledWith('[AudioPanel] Play failed:', notAllowedError);
    expect(screen.getByRole('alert')).toHaveTextContent('Click play in the Audio Control Panel');
  });

  it('keeps unified progress display aligned to the media element time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-30T00:00:00.000Z'));

    render(
      <AudioProgressPanel
        audioSections={[{ number: 1, name: 'First', duration: 20, audioUrl: 'data:audio/wav;base64,UklGRg==' }]}
        currentSection={1}
        isPlaying
        isPaused={false}
        onSkipToSection={vi.fn()}
        onPauseAudio={vi.fn()}
        onResumeAudio={vi.fn()}
        playbackSpeed={1}
        audioMode="online"
        enableUnifiedAudio
      />,
    );

    const teacherAudio = document.querySelector('audio') as HTMLAudioElement;
    Object.defineProperty(teacherAudio, 'duration', { configurable: true, value: 20 });
    fireEvent.loadedData(teacherAudio);
    teacherAudio.currentTime = 2;
    fireEvent.timeUpdate(teacherAudio);

    expect(screen.getByRole('button', { name: /edit current audio time/i })).toHaveTextContent('0:02 / 0:20');

    await vi.advanceTimersByTimeAsync(5000);

    expect(screen.getByRole('button', { name: /edit current audio time/i })).toHaveTextContent('0:02 / 0:20');
    expect(screen.getByTestId('audio-section-progress-fill-1').style.width).toBe('10%');
  });

  it('hydrates the progress display from canonical live authority after reload', async () => {
    render(
      <AudioProgressPanel
        audioSections={[
          { number: 1, name: 'First', duration: 20, audioUrl: 'data:audio/wav;base64,UklGRg==' },
          { number: 2, name: 'Second', duration: 20, audioUrl: 'data:audio/wav;base64,UklGRg==' },
        ]}
        currentSection={2}
        isPlaying
        isPaused={false}
        onSkipToSection={vi.fn()}
        onPauseAudio={vi.fn()}
        onResumeAudio={vi.fn()}
        playbackSpeed={1}
        audioMode="online"
        enableUnifiedAudio
        masterRevision={6}
        canonicalPosition={4}
      />,
    );

    const teacherAudio = document.querySelector('audio') as HTMLAudioElement;

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /edit current audio time/i })).toHaveTextContent('0:04 / 0:20');
    });
    expect(teacherAudio.currentTime).toBe(4);
    expect(screen.getByTestId('audio-section-progress-fill-2').style.width).toBe('20%');
  });

  it('uses loaded media duration for current section progress when metadata differs', async () => {
    render(
      <AudioProgressPanel
        audioSections={[{ number: 1, name: 'First', duration: 60, audioUrl: 'data:audio/wav;base64,UklGRg==' }]}
        currentSection={1}
        isPlaying
        isPaused={false}
        onSkipToSection={vi.fn()}
        onPauseAudio={vi.fn()}
        onResumeAudio={vi.fn()}
        playbackSpeed={1}
        audioMode="online"
        enableUnifiedAudio
      />,
    );

    const teacherAudio = document.querySelector('audio') as HTMLAudioElement;
    Object.defineProperty(teacherAudio, 'duration', { configurable: true, value: 20 });
    fireEvent.loadedData(teacherAudio);
    teacherAudio.currentTime = 15;
    fireEvent.timeUpdate(teacherAudio);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /edit current audio time/i })).toHaveTextContent('0:15 / 0:20');
    });
    expect(screen.getByRole('slider', { name: /seek section 1/i })).toHaveAttribute('max', '20');
    expect(screen.getByRole('slider', { name: /seek section 1/i })).toHaveAttribute('step', 'any');
    expect(screen.getByTestId('audio-section-progress-fill-1').style.width).toBe('75%');
  });

  it('corrects stale media time updates immediately after restarting an ended clip', async () => {
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);

    render(
      <AudioProgressPanel
        audioSections={[{ number: 1, name: 'First', duration: 20, audioUrl: 'data:audio/wav;base64,UklGRg==' }]}
        currentSection={1}
        isPlaying={false}
        isPaused
        onSkipToSection={vi.fn()}
        onPauseAudio={vi.fn()}
        onResumeAudio={vi.fn()}
        playbackSpeed={1}
        audioMode="online"
        enableUnifiedAudio
      />,
    );

    const teacherAudio = document.querySelector('audio') as HTMLAudioElement;
    Object.defineProperty(teacherAudio, 'duration', { configurable: true, value: 20 });
    Object.defineProperty(teacherAudio, 'ended', { configurable: true, value: true });
    teacherAudio.currentTime = 20;
    fireEvent.loadedData(teacherAudio);

    fireEvent.click(screen.getByRole('button', { name: /resume all audio/i }));
    await waitFor(() => expect(teacherAudio.currentTime).toBe(0));

    teacherAudio.currentTime = 9;
    fireEvent.timeUpdate(teacherAudio);

    expect(teacherAudio.currentTime).toBe(0);
    expect(screen.getByRole('button', { name: /edit current audio time/i })).toHaveTextContent('0:00 / 0:20');
    expect(screen.getByTestId('audio-section-progress-fill-1').style.width).toBe('0%');
  });
});
