export const LIVE_AUDIO_SOFT_CORRECTION_BASELINE_SECONDS = 0.5;
export const LIVE_AUDIO_HARD_SEEK_BASELINE_SECONDS = 2;
export const LIVE_AUDIO_SOFT_CORRECTION_MAX_RATE_DELTA = 0.05;
export const LIVE_AUDIO_SOFT_CORRECTION_MAX_DURATION_MS = 5_000;
export const LIVE_AUDIO_TEACHER_DISCONNECT_GRACE_MS = 10_000;
export const LIVE_AUDIO_DRIFT_CHECK_INTERVAL_MS = 500;

export type LiveAudioDriftAction = 'none' | 'soft-correction' | 'hard-seek';

export interface ExpectedPositionInput {
  position: number;
  speed: number;
  isPlaying: boolean;
  timestamp: number;
  now: number;
}

export interface SoftCorrectionInput {
  currentPosition: number;
  expectedPosition: number;
  canonicalSpeed: number;
}

export interface TeacherDisconnectInput {
  lastCanonicalUpdateAt: number;
  now: number;
  graceMs?: number;
}

export function calculateExpectedLiveAudioPosition({
  position,
  speed,
  isPlaying,
  timestamp,
  now,
}: ExpectedPositionInput): number {
  if (!isPlaying) {
    return position;
  }

  const elapsedSeconds = Math.max(0, now - timestamp) / 1000;
  return position + (elapsedSeconds * speed);
}

export function classifyLiveAudioDrift(
  currentPosition: number,
  expectedPosition: number,
): LiveAudioDriftAction {
  const drift = Math.abs(currentPosition - expectedPosition);
  if (drift <= LIVE_AUDIO_SOFT_CORRECTION_BASELINE_SECONDS) {
    return 'none';
  }
  if (drift >= LIVE_AUDIO_HARD_SEEK_BASELINE_SECONDS) {
    return 'hard-seek';
  }
  return 'soft-correction';
}

export function calculateSoftCorrectionPlaybackRate({
  currentPosition,
  expectedPosition,
  canonicalSpeed,
}: SoftCorrectionInput): number {
  const direction = currentPosition < expectedPosition ? 1 : -1;
  const multiplier = 1 + (direction * LIVE_AUDIO_SOFT_CORRECTION_MAX_RATE_DELTA);
  return canonicalSpeed * multiplier;
}

export function shouldFreezeForTeacherDisconnect({
  lastCanonicalUpdateAt,
  now,
  graceMs = LIVE_AUDIO_TEACHER_DISCONNECT_GRACE_MS,
}: TeacherDisconnectInput): boolean {
  return now - lastCanonicalUpdateAt > graceMs;
}
