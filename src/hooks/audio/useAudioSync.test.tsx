import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAudioSync } from './useAudioSync';
import type { MasterAudioState } from '../../types/audio.types';

function buildMasterState(overrides: Partial<MasterAudioState> = {}): MasterAudioState {
  return {
    schemaVersion: 2,
    revision: 1,
    section: 1,
    position: 30,
    isPlaying: true,
    speed: 1,
    timestamp: Date.now(),
    updateKind: 'command',
    lastAction: 'resume',
    lastActionRevision: 1,
    lastActionTimestamp: Date.now(),
    actionId: 'resume-1',
    writerUid: 'teacher-1',
    writerClientId: 'teacher-tab-1',
    ...overrides,
  };
}

function buildAudioElement() {
  let paused = true;
  return {
    currentTime: 30,
    playbackRate: 1,
    play: vi.fn(async () => {
      paused = false;
    }),
    pause: vi.fn(() => {
      paused = true;
    }),
    get paused() {
      return paused;
    },
  } as unknown as HTMLAudioElement;
}

describe('useAudioSync live authority behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('pauses after teacher disconnect grace and recovers only from newer canonical authority', async () => {
    const audio = buildAudioElement();
    const audioRef = { current: audio };
    const initialState = buildMasterState({
      revision: 4,
      position: 40,
      timestamp: Date.now(),
      lastActionRevision: 4,
      actionId: 'resume-4',
    });

    const { result, rerender } = renderHook(
      ({ masterState }) => useAudioSync({
        audioRef,
        masterState,
        isOnlineMode: true,
      }),
      { initialProps: { masterState: initialState } },
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(audio.play).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(12_000);
    });

    expect(result.current.isTeacherDisconnected).toBe(true);
    expect(audio.pause).toHaveBeenCalled();

    vi.setSystemTime(1_700_000_014_000);
    rerender({
      masterState: buildMasterState({
        revision: 5,
        position: 55,
        timestamp: Date.now(),
        lastActionRevision: 5,
        actionId: 'resume-5',
      }),
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isTeacherDisconnected).toBe(false);
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(audio.currentTime).toBeGreaterThanOrEqual(55);
  });

  it('does not surface interrupted play requests as console errors', async () => {
    const audio = buildAudioElement();
    vi.mocked(audio.play).mockRejectedValueOnce(
      new DOMException('The play() request was interrupted by a new load request.', 'AbortError'),
    );
    const audioRef = { current: audio };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    renderHook(() => useAudioSync({
      audioRef,
      masterState: buildMasterState({
        revision: 9,
        position: 12,
        lastAction: 'resume',
        lastActionRevision: 9,
        actionId: 'resume-9',
      }),
      isOnlineMode: true,
    }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(errorSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      '[AudioSync] Ignored interrupted play request during canonical handoff',
      expect.objectContaining({
        actionId: 'resume-9',
        lastAction: 'resume',
        revision: 9,
        section: 1,
      }),
    );
  });
});
