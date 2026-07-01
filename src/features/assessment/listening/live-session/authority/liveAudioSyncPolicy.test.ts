import { describe, expect, it } from 'vitest';

import {
  LIVE_AUDIO_HARD_SEEK_BASELINE_SECONDS,
  LIVE_AUDIO_SOFT_CORRECTION_BASELINE_SECONDS,
  LIVE_AUDIO_SOFT_CORRECTION_MAX_DURATION_MS,
  LIVE_AUDIO_SOFT_CORRECTION_MAX_RATE_DELTA,
  LIVE_AUDIO_TEACHER_DISCONNECT_GRACE_MS,
  calculateExpectedLiveAudioPosition,
  calculateSoftCorrectionPlaybackRate,
  classifyLiveAudioDrift,
  shouldFreezeForTeacherDisconnect,
} from './liveAudioSyncPolicy';

describe('live audio sync policy', () => {
  it('keeps 500 ms soft correction and 2 second hard seek as named test baselines', () => {
    expect(LIVE_AUDIO_SOFT_CORRECTION_BASELINE_SECONDS).toBe(0.5);
    expect(LIVE_AUDIO_HARD_SEEK_BASELINE_SECONDS).toBe(2);
    expect(LIVE_AUDIO_SOFT_CORRECTION_MAX_RATE_DELTA).toBe(0.05);
    expect(LIVE_AUDIO_SOFT_CORRECTION_MAX_DURATION_MS).toBe(5_000);

    expect(classifyLiveAudioDrift(10, 10.4)).toBe('none');
    expect(classifyLiveAudioDrift(10, 10.75)).toBe('soft-correction');
    expect(classifyLiveAudioDrift(10, 12.25)).toBe('hard-seek');
  });

  it('limits soft correction to five percent around canonical speed', () => {
    expect(calculateSoftCorrectionPlaybackRate({
      currentPosition: 10,
      expectedPosition: 12,
      canonicalSpeed: 1.25,
    })).toBeCloseTo(1.3125);
    expect(calculateSoftCorrectionPlaybackRate({
      currentPosition: 14,
      expectedPosition: 12,
      canonicalSpeed: 1.25,
    })).toBeCloseTo(1.1875);
  });

  it('calculates expected position only from canonical authority', () => {
    expect(calculateExpectedLiveAudioPosition({
      position: 30,
      speed: 1.5,
      isPlaying: true,
      timestamp: 1_000,
      now: 5_000,
    })).toBe(36);

    expect(calculateExpectedLiveAudioPosition({
      position: 30,
      speed: 1.5,
      isPlaying: false,
      timestamp: 1_000,
      now: 5_000,
    })).toBe(30);
  });

  it('freezes only after bounded teacher disconnect grace', () => {
    expect(LIVE_AUDIO_TEACHER_DISCONNECT_GRACE_MS).toBe(10_000);
    expect(shouldFreezeForTeacherDisconnect({
      lastCanonicalUpdateAt: 1_000,
      now: 10_999,
    })).toBe(false);
    expect(shouldFreezeForTeacherDisconnect({
      lastCanonicalUpdateAt: 1_000,
      now: 11_001,
    })).toBe(true);
  });
});
