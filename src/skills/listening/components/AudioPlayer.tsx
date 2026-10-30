/**
 * AudioPlayer Component - IELTS CBT Simplified Style
 * 
 * A minimal audio player that matches the IELTS CBT interface.
 * Shows only essential information with less visual clutter.
 * 
 * Layout:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ [▶] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  2:45 / 5:30 │
 * └─────────────────────────────────────────────────────────────────┘
 * 
 * PRD-0018: Unified Audio Architecture Support
 * - Online mode: syncs to teacher's masterAudioState with drift correction
 * - Offline mode: muted, shows progress bar, requires headphone permission
 * - Solo mode: full local control, no sync
 */

import React, { useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import './AudioPlayer.css';
import { useAudioSync } from '../../../hooks/audio';
import { SyncIndicator } from '../../../components/test/SyncIndicator';
import type { MasterAudioState, AudioMode, AudioPlayerMode, HeadphoneRequest } from '../../../types/audio.types';
import { listeningDiagnostics } from '../../../utils/listeningDiagnostics';
import { ListeningAudioReplacementNotice } from '../../../features/assessment/listening/runtime/ListeningAudioReplacementNotice';
import { useFeatureTracking } from '../../../hooks/useFeatureTracking';
import { FEATURE_IDS } from '../../../config/featureRegistry';

/** Audio controls configuration from teacher settings */
interface AudioControlsConfig {
  showPlayPause: boolean;
  showProgressBar: boolean;
  showSeekControl: boolean;
  showSpeedControl: boolean;
  showSkipSection: boolean;
  showVolumeControl: boolean;
}

export interface AuthorizedDeliveryRefreshContext {
  sectionNumber: number;
  masterRevision: number | null;
  expiresAt?: number;
}

export interface AuthorizedDeliveryRefreshResult {
  url: string;
  audioReplaced?: boolean;
  expiresAt?: number;
  refreshAfter?: number;
}

export interface AuthorizedDeliveryConfig {
  testId?: string;
  recordedAt?: number;
  audioReplaced?: boolean;
  expiresAt?: number;
  refreshAfter?: number;
  refreshSource?: (context: AuthorizedDeliveryRefreshContext) => Promise<AuthorizedDeliveryRefreshResult | string>;
  prepareReplacementSource?: (url: string) => Promise<void>;
  retryBackoffMs?: readonly number[];
  onRefreshWarning?: (message: string | null) => void;
  now?: () => number;
}

interface AudioPlayerProps {
  audioUrl: string;
  sectionNumber: number;
  isPlaying: boolean;
  volume: number;
  playbackSpeed: number;
  onPlayPause: () => void;
  onTimeUpdate: (currentTime: number, duration: number) => void;
  onSectionComplete: () => void;
  onError: (error: string) => void;
  /** @deprecated Use audioControls.showPlayPause instead */
  allowPause?: boolean;
  /** @deprecated Use audioControls.showSeekControl instead */
  allowRewind?: boolean;
  /** @deprecated Use audioControls.showSpeedControl instead */
  allowSpeedControl?: boolean;
  maxReplays?: number;
  allowReplay?: boolean;
  /** Use minimal/compact display mode (IELTS style) */
  minimal?: boolean;
  /** Use the touch-friendly mobile layout for the minimal player */
  mobileLayout?: boolean;
  /** Full audio controls configuration from teacher settings */
  audioControls?: AudioControlsConfig;
  /** Callback for skip section button */
  onSkipSection?: () => void;
  /** Callback for speed change */
  onSpeedChange?: (speed: number) => void;
  /** Callback for volume change */
  onVolumeChange?: (volume: number) => void;
  /** Teacher-commanded seek position (seconds) */
  seekPosition?: number | null;
  /** Callback when seek is consumed */
  onSeekConsumed?: () => void;

  // ============================================================
  // PRD-0018: Unified Audio Architecture Props
  // ============================================================

  /** Player mode: 'session' for test sessions, 'solo' for solo practice */
  playerMode?: AudioPlayerMode;
  /** Audio mode for session: 'online' (synced) or 'offline' (muted) */
  audioMode?: AudioMode;
  /** Master audio state from teacher (for online sync) */
  masterAudioState?: MasterAudioState | null;
  /** Headphone permission request state (for offline mode) */
  headphoneRequest?: HeadphoneRequest | null;
  /** Callback when student requests headphone permission */
  onRequestHeadphones?: () => void;
  /** Optional live/private delivery refresh handoff. Inert for current public traffic. */
  authorizedDelivery?: AuthorizedDeliveryConfig;
}

interface AudioSource {
  type: 'direct' | 'error';
  url: string;
  fileId: string;
  originalUrl: string;
  errorMessage?: string;
}

const AUTHORIZED_REFRESH_THRESHOLD_MS = 10 * 60 * 1000;
const AUTHORIZED_REFRESH_RISK_MS = 2 * 60 * 1000;
const AUTHORIZED_REFRESH_DEFAULT_BACKOFF_MS = [1000, 3000, 5000] as const;
const AUTHORIZED_REPLACEMENT_PRELOAD_TIMEOUT_MS = 10000;

function sanitizeAudioUrlForDiagnostics(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return `${parsed.origin}/[redacted-audio-url]`;
    }
  } catch {
    return '[redacted-audio-url]';
  }

  return '[redacted-audio-url]';
}

function getSafeAudioElementSource(audio: HTMLAudioElement): string | null {
  return sanitizeAudioUrlForDiagnostics(audio.currentSrc || audio.src);
}

function isRetiredExternalAudioUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    const retiredHosts = new Set([
      ['drive', 'google', 'com'].join('.'),
      ['docs', 'google', 'com'].join('.'),
      ['drive', 'usercontent', 'google', 'com'].join('.'),
    ]);

    return retiredHosts.has(host);
  } catch {
    return false;
  }
}

function normalizeRefreshResult(result: AuthorizedDeliveryRefreshResult | string): AuthorizedDeliveryRefreshResult {
  if (typeof result === 'string') {
    return { url: result };
  }

  return result;
}

function preloadReplacementAudioSource(url: string): Promise<void> {
  if (typeof Audio === 'undefined') {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const audio = new Audio();
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      audio.removeEventListener('canplay', handleReady);
      audio.removeEventListener('loadedmetadata', handleReady);
      audio.removeEventListener('error', handleError);
      audio.src = '';
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    const handleReady = () => finish();
    const handleError = () => finish(new Error('replacement_source_not_ready'));
    const timeoutId = setTimeout(() => finish(new Error('replacement_source_timeout')), AUTHORIZED_REPLACEMENT_PRELOAD_TIMEOUT_MS);

    audio.preload = 'metadata';
    audio.addEventListener('canplay', handleReady, { once: true });
    audio.addEventListener('loadedmetadata', handleReady, { once: true });
    audio.addEventListener('error', handleError, { once: true });
    audio.src = url;
    audio.load();
  });
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioUrl,
  sectionNumber,
  isPlaying,
  volume,
  playbackSpeed,
  onPlayPause,
  onTimeUpdate,
  onSectionComplete,
  onError,
  allowPause: allowPauseLegacy = true,
  allowRewind: allowRewindLegacy = false,
  allowSpeedControl: allowSpeedControlLegacy = false,
  maxReplays = 1,
  allowReplay = false,
  minimal = true,
  mobileLayout = false,
  audioControls,
  onSkipSection,
  onSpeedChange,
  onVolumeChange,
  seekPosition,
  onSeekConsumed,
  // PRD-0018: Unified Audio Props
  playerMode = 'session',
  audioMode,
  masterAudioState,
  headphoneRequest,
  onRequestHeadphones,
  authorizedDelivery,
}) => {
  const { trackAction } = useFeatureTracking(FEATURE_IDS.testTaking);
  const controlsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dismissPanels = (event: PointerEvent) => {
      controlsRef.current?.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(panel => {
        if (!panel.contains(event.target as Node)) panel.open = false;
      });
    };
    document.addEventListener('pointerdown', dismissPanels);
    return () => document.removeEventListener('pointerdown', dismissPanels);
  }, []);

  // Resolve settings: prefer audioControls if provided, fall back to legacy props
  const allowPause = audioControls?.showPlayPause ?? allowPauseLegacy;
  const allowRewind = audioControls?.showSeekControl ?? allowRewindLegacy;
  const allowSpeedControl = audioControls?.showSpeedControl ?? allowSpeedControlLegacy;
  const showSkipSection = audioControls?.showSkipSection ?? false;
  const showVolumeControl = audioControls?.showVolumeControl ?? true;
  const audioRef = useRef<HTMLAudioElement>(null);
  const [audioSource, setAudioSource] = useState<AudioSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [replaysUsed, setReplaysUsed] = useState(0);
  // Local speed state for speed control dropdown (must be before any conditional returns)
  const [localSpeed, setLocalSpeed] = useState(playbackSpeed);
  const speedOptions = [0.75, 1.0, 1.25, 1.5, 2.0];
  // Retry logic for transient errors
  const loadRetryCountRef = useRef(0);
  const refreshRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const refreshSequenceRef = useRef(0);
  const pendingSourceHandoffRef = useRef<{
    url: string;
    position: number;
    speed: number;
    shouldPlay: boolean;
    revision: number | null;
  } | null>(null);
  const playbackDiagnosticTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingPlayDiagnosticRef = useRef<{
    reason: 'tap' | 'sync';
    startTime: number;
    startedAt: number;
  } | null>(null);
  const MAX_LOAD_RETRIES = 3;
  const [authorizedSourceMeta, setAuthorizedSourceMeta] = useState<{
    url: string;
    expiresAt?: number;
    refreshAfter?: number;
  } | null>(null);
  const [refreshWarning, setRefreshWarning] = useState<string | null>(null);
  const [audioReplaced, setAudioReplaced] = useState(false);

  // ============================================================
  // PRD-0018: Unified Audio Mode Logic
  // ============================================================

  // Determine effective audio mode
  const isSoloMode = playerMode === 'solo';
  const isOnlineMode = !isSoloMode && audioMode === 'online';
  const isOfflineMode = !isSoloMode && audioMode === 'offline';

  // Headphone permission status for offline mode
  const hasHeadphonePermission = headphoneRequest?.status === 'approved';
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const isHeadphoneRequestPending = headphoneRequest?.status === 'pending';

  // In offline mode without headphone permission, audio should be muted
  const shouldMute = isOfflineMode && !hasHeadphonePermission;

  // Effective volume (mute if offline without permission) - used in volume effect
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const effectiveVolume = shouldMute ? 0 : volume;

  // Use audio sync hook for online mode drift correction
  const {
    isSyncing,
    isTeacherDisconnected,
  } = useAudioSync({
    audioRef: audioRef as React.RefObject<HTMLAudioElement>,
    masterState: masterAudioState || null,
    isOnlineMode: isOnlineMode && !!masterAudioState,
  });

  // ============================================================
  // PRD-0018 Task 5.4 & 5.5: Offline Mode Progress Bar Sync
  // ============================================================
  // In offline mode without headphone permission, sync progress bar
  // to teacher's position without playing audio

  useEffect(() => {
    // Only run in offline mode without headphone permission AND with master state
    if (!isOfflineMode || hasHeadphonePermission || !masterAudioState) {
      return;
    }

    // Calculate expected position based on master state
    const calculateDisplayPosition = (): number => {
      if (!masterAudioState.isPlaying) {
        return masterAudioState.position;
      }

      const now = Date.now();
      const elapsedMs = now - masterAudioState.timestamp;
      const elapsedSeconds = elapsedMs / 1000;

      // Expected position = master position + (elapsed time * speed)
      return masterAudioState.position + (elapsedSeconds * masterAudioState.speed);
    };

    // Initial sync on join (Task 5.4: handle late-joining)
    const initialPosition = calculateDisplayPosition();
    setCurrentTime(initialPosition);
    listeningDiagnostics.log(`📍 [OfflineSync] Late join: synced to position ${initialPosition.toFixed(1)}s`);

    // Smooth progress bar updates every 100ms (Task 5.5)
    const updateInterval = setInterval(() => {
      const displayPosition = calculateDisplayPosition();
      setCurrentTime(displayPosition);
    }, 100);

    return () => {
      clearInterval(updateInterval);
    };
  }, [isOfflineMode, hasHeadphonePermission, masterAudioState?.section, masterAudioState?.isPlaying, masterAudioState?.timestamp, masterAudioState?.speed]);

  // In offline mode without permission, hide most controls
  const hideControlsForOffline = isOfflineMode && !hasHeadphonePermission;

  // In online mode, teacher controls playback - disable student controls
  // Only volume control should remain available for student comfort
  const teacherControlledOnline = isOnlineMode && !!masterAudioState;

  // ============================================================
  // PRD-0018: Effective isPlaying for Online Sync Mode
  // ============================================================
  // When in online mode with masterAudioState, the teacher controls playback.
  // The student's audio should follow masterAudioState.isPlaying, not local state.
  // This ensures auto-play when teacher starts and auto-pause when teacher pauses.
  const effectiveIsPlaying = (isOnlineMode && masterAudioState)
    ? masterAudioState.isPlaying
    : isPlaying;

  // ============================================================
  // PRD-0018 Task 7.1-7.3: Solo Mode Control Visibility
  // ============================================================
  // In solo mode: Enable ALL controls by default (PRACTICE_MODE)
  // Unless audioControls prop is provided (for homework with restrictions)

  const soloModeDefaults = {
    allowPause: true,
    allowRewind: true,
    allowSpeedControl: true,
    showVolumeControl: true,
    showSkipSection: true,
  };

  // Override control visibility based on mode
  // Priority: online teacher control > offline hiding > audioControls prop > solo defaults > legacy props
  // In online mode (teacher-controlled): disable all playback controls except volume
  const effectiveAllowPause = (teacherControlledOnline || hideControlsForOffline)
    ? false
    : (isSoloMode && !audioControls)
      ? soloModeDefaults.allowPause
      : allowPause;

  const effectiveAllowRewind = (teacherControlledOnline || hideControlsForOffline)
    ? false
    : (isSoloMode && !audioControls)
      ? soloModeDefaults.allowRewind
      : allowRewind;

  const effectiveAllowSpeedControl = (teacherControlledOnline || hideControlsForOffline)
    ? false
    : (isSoloMode && !audioControls)
      ? soloModeDefaults.allowSpeedControl
      : allowSpeedControl;

  // Volume control: allow in online mode (student comfort) but not in offline without headphones
  const effectiveShowVolumeControl = hideControlsForOffline
    ? false
    : (isSoloMode && !audioControls)
      ? soloModeDefaults.showVolumeControl
      : showVolumeControl;

  const effectiveShowSkipSection = (teacherControlledOnline || hideControlsForOffline)
    ? false
    : (isSoloMode && !audioControls)
      ? soloModeDefaults.showSkipSection
      : showSkipSection;

  const clearPlaybackDiagnostics = useCallback(() => {
    if (playbackDiagnosticTimeoutRef.current) {
      clearTimeout(playbackDiagnosticTimeoutRef.current);
      playbackDiagnosticTimeoutRef.current = null;
    }
    pendingPlayDiagnosticRef.current = null;
  }, []);

  const clearRefreshRetry = useCallback(() => {
    refreshSequenceRef.current += 1;
    if (refreshRetryTimeoutRef.current) {
      clearTimeout(refreshRetryTimeoutRef.current);
      refreshRetryTimeoutRef.current = null;
    }
  }, []);

  const setSafeRefreshWarning = useCallback((message: string | null) => {
    setRefreshWarning(message);
    authorizedDelivery?.onRefreshWarning?.(message);
  }, [authorizedDelivery?.onRefreshWarning]);

  const schedulePlaybackDiagnostics = useCallback((reason: 'tap' | 'sync') => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    clearPlaybackDiagnostics();
    pendingPlayDiagnosticRef.current = {
      reason,
      startTime: audio.currentTime,
      startedAt: Date.now(),
    };

    playbackDiagnosticTimeoutRef.current = setTimeout(() => {
      const currentAudio = audioRef.current;
      const pending = pendingPlayDiagnosticRef.current;

      if (!currentAudio || !pending) {
        return;
      }

      if (!currentAudio.paused && currentAudio.currentTime > pending.startTime + 0.25) {
        return;
      }

      listeningDiagnostics.warn('[AudioPlayer] Playback did not advance after play request', {
        reason: pending.reason,
        playerMode,
        audioMode: audioMode ?? null,
        sectionNumber,
        readyState: currentAudio.readyState,
        networkState: currentAudio.networkState,
        paused: currentAudio.paused,
        currentTime: currentAudio.currentTime,
        duration: currentAudio.duration,
        src: getSafeAudioElementSource(currentAudio),
      });
    }, 1500);
  }, [audioMode, clearPlaybackDiagnostics, playerMode, sectionNumber]);

  const markPlaybackProgress = useCallback((eventName: 'timeupdate' | 'playing') => {
    const audio = audioRef.current;
    const pending = pendingPlayDiagnosticRef.current;

    if (!audio || !pending || audio.currentTime <= pending.startTime + 0.25) {
      return;
    }

    listeningDiagnostics.info('[AudioPlayer] Playback advancing', {
      eventName,
      reason: pending.reason,
      sectionNumber,
      currentTime: audio.currentTime,
      duration: audio.duration,
      readyState: audio.readyState,
      src: getSafeAudioElementSource(audio),
    });
    clearPlaybackDiagnostics();
  }, [clearPlaybackDiagnostics, sectionNumber]);

  useEffect(() => {
    setLocalSpeed(playbackSpeed);
  }, [playbackSpeed]);

  useEffect(() => {
    listeningDiagnostics.info('[AudioPlayer] Control state resolved', {
      playerMode,
      audioMode: audioMode ?? null,
      sectionNumber,
      minimal,
      mobileLayout,
      effectiveAllowPause,
      effectiveAllowRewind,
      effectiveAllowSpeedControl,
      effectiveShowVolumeControl,
      effectiveShowSkipSection,
      hideControlsForOffline,
      teacherControlledOnline,
      shouldMute,
    });
  }, [
    audioMode,
    effectiveAllowPause,
    effectiveAllowRewind,
    effectiveAllowSpeedControl,
    effectiveShowSkipSection,
    effectiveShowVolumeControl,
    hideControlsForOffline,
    minimal,
    mobileLayout,
    playerMode,
    sectionNumber,
    shouldMute,
    teacherControlledOnline,
  ]);

  // Process audio URL on mount or URL change
  useEffect(() => {
    const processAudio = async () => {
      setLoading(true);

      try {
        if (isRetiredExternalAudioUrl(audioUrl)) {
          const errorMessage = 'This audio source is no longer supported. Please use an R2-backed Listening material.';
          setAudioSource({
            type: 'error',
            url: '',
            fileId: '',
            originalUrl: audioUrl,
            errorMessage,
          });
          onError(errorMessage);
          setLoading(false);
          return;
        }

        listeningDiagnostics.log('AudioPlayer using direct audio URL', sanitizeAudioUrlForDiagnostics(audioUrl));

        // PROACTIVE CHECK: Detect legacy temp paths that may have been deleted
        const isLegacyTempPath = audioUrl.includes('-temp/');
        if (isLegacyTempPath) {
          listeningDiagnostics.warn('[AudioPlayer] Detected legacy temp path in URL', sanitizeAudioUrlForDiagnostics(audioUrl));
          listeningDiagnostics.warn('⚠️ This file may have been auto-deleted by R2 lifecycle rules.');
          listeningDiagnostics.warn('⚠️ Expected pattern: temp/folder/file.mp3 or permanent path without -temp/');

          // Try to validate the file exists before attempting playback
          try {
            const headResponse = await fetch(audioUrl, { method: 'HEAD' });
            if (!headResponse.ok) {
              throw new Error(`File not found (HTTP ${headResponse.status})`);
            }
          } catch (fetchError) {
            console.error('🔴 [AudioPlayer] File validation failed:', fetchError);
            onError(
              'Audio file not found. This test may have been created with an older version. ' +
              'Please re-upload the audio file or contact support.'
            );
            setLoading(false);
            return;
          }
        }

        setAudioSource({
          type: 'direct',
          url: audioUrl,
          fileId: '',
          originalUrl: audioUrl
        });
      } catch (error) {
        onError('Failed to process audio URL');
        console.error('Audio processing error:', error);
      } finally {
        setLoading(false);
      }
    };

    if (audioUrl) {
      processAudio();
    }
  }, [audioUrl, onError]);

  useEffect(() => {
    setAudioReplaced(authorizedDelivery?.audioReplaced === true);
    setAuthorizedSourceMeta(authorizedDelivery
      ? {
          url: audioUrl,
          expiresAt: authorizedDelivery.expiresAt,
          refreshAfter: authorizedDelivery.refreshAfter,
        }
      : null);
    setRefreshWarning(null);
    authorizedDelivery?.onRefreshWarning?.(null);
    clearRefreshRetry();
  }, [
    audioUrl,
    authorizedDelivery?.audioReplaced,
    authorizedDelivery?.expiresAt,
    authorizedDelivery?.refreshAfter,
    authorizedDelivery?.onRefreshWarning,
    clearRefreshRetry,
  ]);

  useEffect(() => {
    const refreshSource = authorizedDelivery?.refreshSource;
    if (!authorizedDelivery || !refreshSource || !audioSource?.url || audioSource.type === 'error') {
      return;
    }

    const activeMeta = authorizedSourceMeta?.url === audioSource.url
      ? authorizedSourceMeta
      : {
          url: audioSource.url,
          expiresAt: authorizedDelivery.expiresAt,
          refreshAfter: authorizedDelivery.refreshAfter,
        };
    const now = authorizedDelivery.now?.() ?? Date.now();
    const expiresInMs = typeof activeMeta.expiresAt === 'number'
      ? activeMeta.expiresAt - now
      : Number.POSITIVE_INFINITY;
    const refreshDue = typeof activeMeta.refreshAfter === 'number'
      ? now >= activeMeta.refreshAfter
      : expiresInMs <= AUTHORIZED_REFRESH_THRESHOLD_MS;

    if (!refreshDue) {
      if (expiresInMs <= AUTHORIZED_REFRESH_RISK_MS) {
        setSafeRefreshWarning('Audio source expires soon. Playback continues while a replacement source is prepared.');
      }
      return;
    }

    clearRefreshRetry();
    const sequence = refreshSequenceRef.current;
    const backoff = authorizedDelivery.retryBackoffMs ?? AUTHORIZED_REFRESH_DEFAULT_BACKOFF_MS;
    let cancelled = false;

    const runRefreshAttempt = async (attemptIndex: number) => {
      if (cancelled || refreshSequenceRef.current !== sequence) {
        return;
      }

      try {
        const result = normalizeRefreshResult(await refreshSource({
          sectionNumber,
          masterRevision: typeof masterAudioState?.revision === 'number' ? masterAudioState.revision : null,
          expiresAt: activeMeta.expiresAt,
        }));

        if (!result.url) {
          throw new Error('authorized_refresh_missing_url');
        }

        const prepareReplacement = authorizedDelivery.prepareReplacementSource ?? preloadReplacementAudioSource;
        await prepareReplacement(result.url);

        if (cancelled || refreshSequenceRef.current !== sequence) {
          return;
        }

        if (result.audioReplaced) setAudioReplaced(true);
        const audio = audioRef.current;
        const position = masterAudioState?.section === sectionNumber
          ? masterAudioState.position
          : audio?.currentTime ?? currentTime;
        const speed = masterAudioState?.speed ?? playbackSpeed;
        const shouldPlay = masterAudioState?.isPlaying ?? effectiveIsPlaying;

        pendingSourceHandoffRef.current = {
          url: result.url,
          position,
          speed,
          shouldPlay,
          revision: typeof masterAudioState?.revision === 'number' ? masterAudioState.revision : null,
        };

        setAuthorizedSourceMeta({
          url: result.url,
          expiresAt: result.expiresAt,
          refreshAfter: result.refreshAfter,
        });
        setAudioSource((currentSource) => currentSource
          ? {
              ...currentSource,
              type: 'direct',
              url: result.url,
              originalUrl: result.url,
            }
          : {
              type: 'direct',
              url: result.url,
              fileId: '',
              originalUrl: result.url,
            });
        loadRetryCountRef.current = 0;
        setSafeRefreshWarning(null);
        listeningDiagnostics.info('[AudioPlayer] Authorized source refresh ready', {
          sectionNumber,
          masterRevision: typeof masterAudioState?.revision === 'number' ? masterAudioState.revision : null,
          replacement: sanitizeAudioUrlForDiagnostics(result.url),
        });
      } catch (error) {
        if (cancelled || refreshSequenceRef.current !== sequence) {
          return;
        }

        setSafeRefreshWarning('Audio source refresh needs attention. Playback continues on the current source while retrying.');
        listeningDiagnostics.warn('[AudioPlayer] Authorized source refresh failed; keeping current source active', {
          sectionNumber,
          attempt: attemptIndex + 1,
          maxAttempts: backoff.length + 1,
          currentSource: sanitizeAudioUrlForDiagnostics(activeMeta.url),
          error: 'redacted_refresh_error',
          errorType: error instanceof Error ? 'error' : typeof error,
        });

        if (attemptIndex < backoff.length) {
          refreshRetryTimeoutRef.current = setTimeout(() => {
            void runRefreshAttempt(attemptIndex + 1);
          }, backoff[attemptIndex]);
        }
      }
    };

    void runRefreshAttempt(0);

    return () => {
      cancelled = true;
    };
  }, [
    audioSource?.type,
    audioSource?.url,
    authorizedDelivery,
    authorizedSourceMeta,
    clearRefreshRetry,
    currentTime,
    effectiveIsPlaying,
    masterAudioState,
    playbackSpeed,
    sectionNumber,
    setSafeRefreshWarning,
  ]);

  // Handle audio element events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      audio.volume = volume;
      audio.playbackRate = playbackSpeed;
      listeningDiagnostics.info('[AudioPlayer] Metadata loaded', {
        sectionNumber,
        duration: audio.duration,
        readyState: audio.readyState,
        networkState: audio.networkState,
        src: getSafeAudioElementSource(audio),
      });
    };

  const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      onTimeUpdate(audio.currentTime, audio.duration);
      markPlaybackProgress('timeupdate');
    };

    const handlePause = () => {
      listeningDiagnostics.warn('[AudioPlayer] Pause event', {
        sectionNumber,
        currentTime: audio.currentTime,
        duration: audio.duration,
        readyState: audio.readyState,
        networkState: audio.networkState,
        ended: audio.ended,
        src: getSafeAudioElementSource(audio),
      });
    };

    const handlePlaying = () => {
      listeningDiagnostics.info('[AudioPlayer] Playing event', {
        sectionNumber,
        currentTime: audio.currentTime,
        readyState: audio.readyState,
        src: getSafeAudioElementSource(audio),
      });
      markPlaybackProgress('playing');
    };

    const handleCanPlay = () => {
      listeningDiagnostics.info('[AudioPlayer] Can play', {
        sectionNumber,
        currentTime: audio.currentTime,
        duration: audio.duration,
        readyState: audio.readyState,
        src: getSafeAudioElementSource(audio),
      });
    };

    const handleWaiting = () => {
      listeningDiagnostics.warn('[AudioPlayer] Waiting for audio data', {
        sectionNumber,
        currentTime: audio.currentTime,
        readyState: audio.readyState,
        networkState: audio.networkState,
        src: getSafeAudioElementSource(audio),
      });
    };

    const handleStalled = () => {
      listeningDiagnostics.warn('[AudioPlayer] Audio stalled', {
        sectionNumber,
        currentTime: audio.currentTime,
        readyState: audio.readyState,
        networkState: audio.networkState,
        src: getSafeAudioElementSource(audio),
      });
    };

    const handleEnded = () => {
      clearPlaybackDiagnostics();
      onSectionComplete();
    };

    const handleError = () => {
      clearPlaybackDiagnostics();
      // Get detailed error information from audio element
      const mediaError = audio.error;
      const errorCode = mediaError?.code;
      const errorMessage = mediaError?.message || 'Unknown error';

      // Map error codes to human-readable messages
      const errorCodeMap: Record<number, string> = {
        1: 'MEDIA_ERR_ABORTED - Fetching was aborted',
        2: 'MEDIA_ERR_NETWORK - Network error (CORS or connectivity)',
        3: 'MEDIA_ERR_DECODE - Decoding failed (corrupt or unsupported format)',
        4: 'MEDIA_ERR_SRC_NOT_SUPPORTED - Source not supported (404 or invalid URL)',
      };

      const errorDescription = errorCode ? errorCodeMap[errorCode] || `Unknown error code: ${errorCode}` : 'No error code';

      console.error(`🔴 [AudioPlayer] Audio error details:`, {
        code: errorCode,
        description: errorDescription,
        message: errorMessage,
        url: sanitizeAudioUrlForDiagnostics(audioSource?.url),
        originalUrl: sanitizeAudioUrlForDiagnostics(audioSource?.originalUrl),
      });

      {
        // For R2 and other direct URLs, implement retry logic
        loadRetryCountRef.current++;
        listeningDiagnostics.log(`🔄 [AudioPlayer] Audio load error (attempt ${loadRetryCountRef.current}/${MAX_LOAD_RETRIES}) - ${errorDescription}`);

        if (loadRetryCountRef.current < MAX_LOAD_RETRIES) {
          // Retry loading after a short delay
          setTimeout(() => {
            if (audio) {
              listeningDiagnostics.log('🔄 [AudioPlayer] Retrying audio load...');
              audio.load();
            }
          }, 1000 * loadRetryCountRef.current); // Exponential backoff
        } else {
          // Provide more specific error message based on error code and URL pattern
          let userMessage = 'Audio playback error. ';
          const isLegacyTempPath = audioSource?.originalUrl?.includes('-temp/');

          if (errorCode === 4) {
            if (isLegacyTempPath) {
              userMessage += 'The audio file was stored in temporary storage and has been automatically deleted. ';
              userMessage += 'Please re-upload the audio file to create a new test.';
            } else {
              userMessage += 'The audio file could not be found. It may have been deleted or moved.';
            }
          } else if (errorCode === 2) {
            userMessage += 'Network error. Check your connection or the file may have CORS restrictions.';
          } else if (errorCode === 3) {
            userMessage += 'The audio format is not supported by your browser.';
          } else {
            userMessage += 'The file may not be accessible or the format is unsupported.';
          }
          onError(userMessage);
        }
      }
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('stalled', handleStalled);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('stalled', handleStalled);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [
    audioSource,
    clearPlaybackDiagnostics,
    markPlaybackProgress,
    onError,
    onSectionComplete,
    onTimeUpdate,
    playbackSpeed,
    sectionNumber,
    volume,
  ]);

  const attemptPlay = useCallback(async (reason: 'tap' | 'sync', revertOnFailure: boolean) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (!audioSource?.url) {
      listeningDiagnostics.log('🎵 [AudioPlayer] Waiting for audio source to load before playing');
      return;
    }

    try {
      listeningDiagnostics.info('[AudioPlayer] Play requested', {
        reason,
        sectionNumber,
        playerMode,
        audioMode: audioMode ?? null,
        readyState: audio.readyState,
        networkState: audio.networkState,
        paused: audio.paused,
        currentTime: audio.currentTime,
        src: getSafeAudioElementSource(audio),
      });
      if (audio.readyState === 0) {
        audio.load();
      }
      await audio.play();
      schedulePlaybackDiagnostics(reason);
    } catch (err) {
      clearPlaybackDiagnostics();
      if (err instanceof DOMException && err.name === 'AbortError') {
        listeningDiagnostics.info('[AudioPlayer] Ignored interrupted play request during media handoff', {
          reason,
          sectionNumber,
          playerMode,
          audioMode: audioMode ?? null,
          readyState: audio.readyState,
          networkState: audio.networkState,
          paused: audio.paused,
          currentTime: audio.currentTime,
          src: getSafeAudioElementSource(audio),
        });
        return;
      }

      console.error('Playback failed:', err);
      listeningDiagnostics.warn('[AudioPlayer] Playback request rejected', {
        reason,
        sectionNumber,
        playerMode,
        audioMode: audioMode ?? null,
        readyState: audio.readyState,
        networkState: audio.networkState,
        paused: audio.paused,
        currentTime: audio.currentTime,
        src: getSafeAudioElementSource(audio),
      });

      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        listeningDiagnostics.log('🔇 Autoplay blocked by browser - user interaction required');
      } else if (err instanceof DOMException && err.name === 'NotSupportedError') {
        onError('Audio format not supported or URL invalid.');
      } else {
        onError('Failed to play audio. Please try again.');
      }

      if (
        revertOnFailure
        && !isOnlineMode
        && !isOfflineMode
        && effectiveAllowPause
        && effectiveIsPlaying
      ) {
        onPlayPause();
      }
    }
  }, [
    audioMode,
    audioSource,
    clearPlaybackDiagnostics,
    effectiveAllowPause,
    effectiveIsPlaying,
    isOfflineMode,
    isOnlineMode,
    onError,
    onPlayPause,
    playerMode,
    schedulePlaybackDiagnostics,
    sectionNumber,
  ]);

  const handlePlayPausePress = useCallback(() => {
    trackAction('toggleListeningAudio', { sectionNumber, playing: !effectiveIsPlaying });
    const audio = audioRef.current;
    if (!audio) {
      onPlayPause();
      return;
    }

    listeningDiagnostics.info('[AudioPlayer] Play/pause button pressed', {
      audioCurrentTime: audio.currentTime,
      audioPaused: audio.paused,
      effectiveIsPlaying,
      sectionNumber,
    });

    if (effectiveIsPlaying) {
      audio.pause();
      onPlayPause();
      return;
    }

    if (audioSource?.url) {
      audio.volume = effectiveVolume;
      if (allowSpeedControl) {
        audio.playbackRate = playbackSpeed;
      }
      void attemptPlay('tap', false);
    }

    onPlayPause();
  }, [
    allowSpeedControl,
    attemptPlay,
    audioSource,
    effectiveIsPlaying,
    effectiveVolume,
    onPlayPause,
    playbackSpeed,
    trackAction,
  ]);

  // Control playback
  // NOTE: In online sync mode, effectiveIsPlaying comes from masterAudioState.isPlaying
  // This ensures the student's audio automatically follows the teacher's playback control.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (effectiveIsPlaying) {
      if (audio.paused) {
        listeningDiagnostics.info('[AudioPlayer] Sync effect starting paused audio', {
          currentTime: audio.currentTime,
          sectionNumber,
        });
        void attemptPlay('sync', true);
      }
    } else if (!audio.paused) {
      listeningDiagnostics.warn('[AudioPlayer] Sync effect pausing audio because effectiveIsPlaying is false', {
        currentTime: audio.currentTime,
        sectionNumber,
      });
      clearPlaybackDiagnostics();
      audio.pause();
    }
  }, [attemptPlay, clearPlaybackDiagnostics, effectiveIsPlaying, sectionNumber]);

  // Update volume (uses effectiveVolume to respect offline mode muting)
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = effectiveVolume;
    }
  }, [effectiveVolume]);

  // Update playback speed
  useEffect(() => {
    const audio = audioRef.current;
    if (audio && allowSpeedControl) {
      audio.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed, allowSpeedControl]);

  // Reset state and reload audio when URL or section changes
  useLayoutEffect(() => {
    listeningDiagnostics.log(`🎵 [AudioPlayer] Section/URL changed - resetting player state`);
    clearPlaybackDiagnostics();

    // Reset and reload audio element when URL changes
    const audio = audioRef.current;
    if (audio && audioSource?.url) {
      const pendingHandoff = pendingSourceHandoffRef.current;
      if (pendingHandoff?.url === audioSource.url) {
        audio.playbackRate = pendingHandoff.speed;
        audio.currentTime = pendingHandoff.position;
        setCurrentTime(pendingHandoff.position);
        pendingSourceHandoffRef.current = null;
        listeningDiagnostics.info('[AudioPlayer] Authorized source handoff applied', {
          sectionNumber,
          revision: pendingHandoff.revision,
          position: pendingHandoff.position,
          speed: pendingHandoff.speed,
          shouldPlay: pendingHandoff.shouldPlay,
          source: sanitizeAudioUrlForDiagnostics(audioSource.url),
        });
      } else {
        setReplaysUsed(0);
        setCurrentTime(0);
        loadRetryCountRef.current = 0; // Reset retry counter for new audio
        audio.currentTime = 0;
      }
      audio.load(); // Force reload the audio source
    }
  }, [audioSource?.url, audioUrl, clearPlaybackDiagnostics, sectionNumber]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioSource?.url || !effectiveIsPlaying) {
      return;
    }

    let cancelled = false;
    const playAfterSourceLoad = () => {
      if (cancelled || audioRef.current !== audio || !effectiveIsPlaying || !audio.paused) {
        return;
      }

      listeningDiagnostics.info('[AudioPlayer] Restarting active playback after source reload', {
        sectionNumber,
        readyState: audio.readyState,
        currentTime: audio.currentTime,
        src: getSafeAudioElementSource(audio),
      });
      void attemptPlay('sync', false);
    };

    if (audio.readyState >= 2) {
      playAfterSourceLoad();
      return () => {
        cancelled = true;
      };
    }

    audio.addEventListener('loadeddata', playAfterSourceLoad, { once: true });
    audio.addEventListener('canplay', playAfterSourceLoad, { once: true });
    return () => {
      cancelled = true;
      audio.removeEventListener('loadeddata', playAfterSourceLoad);
      audio.removeEventListener('canplay', playAfterSourceLoad);
    };
  }, [attemptPlay, audioSource?.url, effectiveIsPlaying, sectionNumber]);

  useEffect(() => {
    return () => {
      clearPlaybackDiagnostics();
      clearRefreshRetry();
    };
  }, [clearPlaybackDiagnostics, clearRefreshRetry]);

  // Handle teacher-commanded seek position
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || seekPosition === null || seekPosition === undefined) return;

    // Only seek if audio is ready
    if (audio.readyState >= 2) { // HAVE_CURRENT_DATA
      listeningDiagnostics.log(`⏩ [AudioPlayer] Seeking to position ${seekPosition}s by teacher command`);
      audio.currentTime = seekPosition;
      setCurrentTime(seekPosition);
      // Notify parent that seek was consumed
      if (onSeekConsumed) {
        onSeekConsumed();
      }
    } else {
      // Wait for audio to be ready, then seek
      const handleCanPlay = () => {
        listeningDiagnostics.log(`⏩ [AudioPlayer] Audio ready, seeking to position ${seekPosition}s by teacher command`);
        audio.currentTime = seekPosition;
        setCurrentTime(seekPosition);
        audio.removeEventListener('canplay', handleCanPlay);
        if (onSeekConsumed) {
          onSeekConsumed();
        }
      };
      audio.addEventListener('canplay', handleCanPlay);
      return () => audio.removeEventListener('canplay', handleCanPlay);
    }
    return undefined;
  }, [seekPosition, onSeekConsumed]);

  // Handle seek
  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!allowRewind && parseFloat(e.target.value) < currentTime) {
      return;
    }

    const audio = audioRef.current;
    if (audio) {
      const newTime = parseFloat(e.target.value);
      audio.currentTime = newTime;
      setCurrentTime(newTime);
      trackAction('seekListeningAudio', { sectionNumber, position: newTime });
    }
  }, [allowRewind, currentTime, sectionNumber, trackAction]);

  // Format time for display
  const formatTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate progress percentage
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const renderRefreshWarning = () => <>
    <ListeningAudioReplacementNotice replaced={audioReplaced} testId={authorizedDelivery?.testId} recordedAt={authorizedDelivery?.recordedAt} />
    {refreshWarning ? (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 10px',
        backgroundColor: '#fff7ed',
        border: '1px solid #fed7aa',
        borderRadius: '6px',
        color: '#9a3412',
        fontSize: '12px',
        fontWeight: 600,
      }}
    >
      <span aria-hidden="true">!</span>
      <span>{refreshWarning}</span>
    </div>
  ) : null}</>;

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 16px',
          backgroundColor: '#f8fafc',
          borderRadius: '8px',
        }}
      >
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          backgroundColor: '#e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          color: '#94a3b8',
        }} aria-hidden="true">
          ⏳
        </div>
        <span style={{ fontSize: '14px', color: '#64748b' }}>
          Loading audio...
        </span>
      </div>
    );
  }

  if (audioSource?.type === 'error') {
    return (
      <div
        role="alert"
        aria-live="assertive"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 16px',
          backgroundColor: '#fef2f2',
          borderRadius: '8px',
          border: '1px solid #fecaca',
        }}
      >
        <span style={{ fontSize: '16px' }} aria-hidden="true">⚠️</span>
        <span style={{ fontSize: '14px', color: '#dc2626' }}>
          {audioSource.errorMessage || 'Audio load error'}
        </span>
      </div>
    );
  }

  const handleSpeedChange = (newSpeed: number) => {
    trackAction('changeListeningSpeed', { sectionNumber, speed: newSpeed });
    setLocalSpeed(newSpeed);
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = newSpeed;
    }
    onSpeedChange?.(newSpeed);
  };

  // One media node and control tree across desktop, tablet and phone widths.
  if (minimal) {
    const replayRemaining = maxReplays - replaysUsed;
    const showReplayControl = !teacherControlledOnline && !hideControlsForOffline && allowReplay && replayRemaining > 0 && currentTime >= duration && duration > 0;
    const showNextControl = effectiveShowSkipSection && onSkipSection;

    return (
      <div className="audio-player" ref={controlsRef}
        onKeyDown={event => {
          if (event.key !== 'Escape') return;
          const panel = (event.target as HTMLElement).closest('details');
          if (panel?.open) {
            panel.open = false;
            panel.querySelector('summary')?.focus();
            event.stopPropagation();
          }
        }}
        onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            event.currentTarget.querySelectorAll<HTMLDetailsElement>('details[open]').forEach(panel => { panel.open = false; });
          }
        }}
      >
        <audio ref={audioRef} src={audioSource?.url} preload="metadata" style={{ display: 'none' }} />
        <div className="audio-player__bar" role="group" aria-label="Listening audio controls">
          {effectiveAllowPause ? (
            <button className="audio-player__play" onClick={handlePlayPausePress}
              aria-label={effectiveIsPlaying ? 'Pause' : 'Play'} type="button">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                {effectiveIsPlaying ? <path d="M8 5v14M16 5v14" strokeWidth="3" /> : <path d="m9 5 10 7-10 7V5Z" strokeLinejoin="round" />}
              </svg>
            </button>
          ) : (
            <div className="audio-player__play audio-player__controlled" role="status" tabIndex={-1}
              aria-label={effectiveIsPlaying ? 'Audio playing under teacher control' : 'Audio paused under teacher control'}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                <path d="M4 14v-3a8 8 0 0 1 16 0v3M4 12h3v8H4v-8Zm13 0h3v8h-3v-8Z" />
              </svg>
            </div>
          )}
          <div className="audio-player__timeline">
            <input className="audio-player-range audio-player__seek" type="range" min="0" max={duration || 100}
              value={currentTime} onChange={handleSeek} disabled={!effectiveAllowRewind}
              aria-label="Audio progress" aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
              style={{ '--audio-percent': `${progressPercent}%` } as React.CSSProperties} />
            <div className="audio-player__times"><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div>
          </div>
          {effectiveAllowSpeedControl && (
            <label className="audio-player__speed-wrap">
              <select className="audio-player__speed" value={localSpeed} aria-label="Playback speed"
                onChange={event => handleSpeedChange(parseFloat(event.target.value))}>
                {speedOptions.map(speed => <option key={speed} value={speed}>{speed}x</option>)}
              </select>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </label>
          )}
          {effectiveShowVolumeControl && (
            <details className="audio-player__pop audio-player__volume" onToggle={event => {
              if (event.currentTarget.open) trackAction('openListeningVolume', { sectionNumber, playerMode });
            }}>
              <summary aria-label={`Volume, ${Math.round(volume * 100)} percent`} title="Volume">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                  <path d="M3 9h4l5-4v14l-5-4H3V9Z" strokeLinejoin="round" />
                  {volume === 0 ? <path d="m16 9 5 6m0-6-5 6" /> : <path d="M16 9a5 5 0 0 1 0 6m3-9a9 9 0 0 1 0 12" strokeLinecap="round" />}
                </svg>
              </summary>
              <div className="audio-player__panel">
                <div className="audio-player__panel-label"><span>Volume</span><output>{Math.round(volume * 100)}%</output></div>
                <input className="audio-player-range" type="range" min="0" max="1" step="0.01" value={volume}
                  aria-label="Volume" style={{ '--audio-percent': `${volume * 100}%` } as React.CSSProperties}
                  onChange={event => {
                    const newVolume = parseFloat(event.target.value);
                    if (audioRef.current) audioRef.current.volume = newVolume;
                    onVolumeChange?.(newVolume);
                    trackAction('changeListeningVolume', { sectionNumber, volume: newVolume });
                  }} />
                <p>On phones and tablets, use your device volume buttons if needed.</p>
              </div>
            </details>
          )}
          {(showNextControl || showReplayControl) && (
            <details className="audio-player__pop audio-player__options" onToggle={event => {
              if (event.currentTarget.open) trackAction('openListeningPlaybackOptions', { sectionNumber, playerMode });
            }}>
              <summary aria-label="Playback options" title="Playback options">
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>
              </summary>
              <div className="audio-player__panel">
                {showReplayControl && (
                  <button type="button" aria-label={`Replay section (${replayRemaining} remaining)`} onClick={event => {
                    const audio = audioRef.current;
                    if (audio) {
                      audio.currentTime = 0;
                      setCurrentTime(0);
                      setReplaysUsed(prev => prev + 1);
                      void attemptPlay('tap', false);
                      if (!effectiveIsPlaying) onPlayPause();
                    }
                    controlsRef.current?.querySelector<HTMLElement>('.audio-player__play')?.focus();
                    event.currentTarget.closest('details')?.removeAttribute('open');
                    trackAction('replayListeningAudio', { sectionNumber, remaining: replayRemaining - 1 });
                  }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" /></svg>
                    Replay · {replayRemaining} remaining
                  </button>
                )}
                {showNextControl && (
                  <button type="button" aria-label="Skip to next section" onClick={event => {
                    controlsRef.current?.querySelector<HTMLElement>('.audio-player__play')?.focus();
                    event.currentTarget.closest('details')?.removeAttribute('open');
                    trackAction('skipListeningSection', { sectionNumber });
                    onSkipSection();
                  }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="m5 5 10 7-10 7V5ZM19 5v14" /></svg>
                    Next section
                  </button>
                )}
              </div>
            </details>
          )}
        </div>
        {isOnlineMode && (isSyncing || isTeacherDisconnected) && <SyncIndicator isSyncing={isSyncing} isTeacherDisconnected={isTeacherDisconnected} />}
        {isOfflineMode && !hasHeadphonePermission && onRequestHeadphones && (
          <div className="audio-player__classroom" role="status" aria-live="polite">
            <span>Audio is muted in classroom mode</span>
            <button type="button" onClick={() => {
              trackAction('requestListeningHeadphones', { sectionNumber });
              onRequestHeadphones();
            }} disabled={isHeadphoneRequestPending}>{isHeadphoneRequestPending ? 'Pending...' : 'Request Headphones'}</button>
          </div>
        )}
        {renderRefreshWarning()}
      </div>
    );
  }

  // Full Player (non-minimal mode)
  return (
    <div style={{
      backgroundColor: '#ffffff',
      borderRadius: '8px',
      padding: '16px',
    }}>
      {renderRefreshWarning()}

      {/* Hidden Audio Element */}
      <audio
        ref={audioRef}
        src={audioSource?.url}
        preload="metadata"
        style={{ display: 'none' }}
      />

      {/* Play/Pause + Progress */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button
          onClick={handlePlayPausePress}
          disabled={!allowPause && effectiveIsPlaying}
          type="button"
          aria-label={effectiveIsPlaying ? 'Pause' : 'Play'}
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            backgroundColor: '#3b82f6',
            color: 'white',
            border: 'none',
            cursor: allowPause || !effectiveIsPlaying ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            opacity: (!allowPause && effectiveIsPlaying) ? 0.5 : 1,
            touchAction: 'manipulation',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {effectiveIsPlaying ? '⏸' : '▶'}
        </button>

        <div style={{ flex: 1 }}>
          <input
            type="range"
            min="0"
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            disabled={!allowRewind && currentTime > 0}
            aria-label="Audio progress"
            style={{
              width: '100%',
              minHeight: '44px',
              borderRadius: '4px',
              outline: 'none',
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${progressPercent}%, #e2e8f0 ${progressPercent}%, #e2e8f0 100%)`,
              cursor: allowRewind ? 'pointer' : 'not-allowed',
            }}
          />
        </div>

        <div style={{
          fontSize: '14px',
          fontFamily: 'monospace',
          color: '#475569',
          minWidth: '100px',
          textAlign: 'right',
        }}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>

      {/* Restrictions Notice */}
      {(!allowPause || !allowRewind) && (
        <div style={{
          marginTop: '12px',
          padding: '6px 10px',
          backgroundColor: '#fef3c7',
          borderRadius: '4px',
          fontSize: '11px',
          color: '#92400e',
        }}>
          {!allowPause && '⚠️ Cannot pause during playback. '}
          {!allowRewind && '⚠️ Cannot rewind.'}
        </div>
      )}
    </div>
  );
};
