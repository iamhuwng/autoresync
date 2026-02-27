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

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { googleDriveAudioService } from '../../../services/googleDriveAudio';
import type { AudioSource } from '../../../services/googleDriveAudio';
import { useAudioSync } from '../../../hooks/audio';
import { SyncIndicator } from '../../../components/test/SyncIndicator';
import type { MasterAudioState, AudioMode, AudioPlayerMode, HeadphoneRequest } from '../../../types/audio.types';

/** Audio controls configuration from teacher settings */
interface AudioControlsConfig {
  showPlayPause: boolean;
  showProgressBar: boolean;
  showSeekControl: boolean;
  showSpeedControl: boolean;
  showSkipSection: boolean;
  showVolumeControl: boolean;
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
}) => {
  // Resolve settings: prefer audioControls if provided, fall back to legacy props
  const allowPause = audioControls?.showPlayPause ?? allowPauseLegacy;
  const allowRewind = audioControls?.showSeekControl ?? allowRewindLegacy;
  const allowSpeedControl = audioControls?.showSpeedControl ?? allowSpeedControlLegacy;
  const showSkipSection = audioControls?.showSkipSection ?? false;
  const showVolumeControl = audioControls?.showVolumeControl ?? true;
  const audioRef = useRef<HTMLAudioElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [audioSource, setAudioSource] = useState<AudioSource | null>(null);
  const [loading, setLoading] = useState(true);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [replaysUsed, setReplaysUsed] = useState(0);
  const [useEmbed, setUseEmbed] = useState(false);
  // Local speed state for speed control dropdown (must be before any conditional returns)
  const [localSpeed, setLocalSpeed] = useState(playbackSpeed);
  const speedOptions = [0.75, 1.0, 1.25, 1.5, 2.0];
  // Retry logic for transient errors
  const loadRetryCountRef = useRef(0);
  const MAX_LOAD_RETRIES = 3;

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
    console.log(`📍 [OfflineSync] Late join: synced to position ${initialPosition.toFixed(1)}s`);

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

  // Process audio URL on mount or URL change
  useEffect(() => {
    const processAudio = async () => {
      setLoading(true);

      try {
        // Check if this is an R2 URL or other direct URL (not Google Drive)
        const isR2Url = audioUrl.includes('r2.dev') || audioUrl.includes('cloudflare');
        const isDirectUrl = audioUrl.startsWith('https://') && !audioUrl.includes('drive.google.com');

        if (isR2Url || isDirectUrl) {
          // Direct URL (R2 or other CDN)
          console.log('🎵 Using direct audio URL:', audioUrl);

          // PROACTIVE CHECK: Detect legacy temp paths that may have been deleted
          const isLegacyTempPath = audioUrl.includes('-temp/');
          if (isLegacyTempPath) {
            console.warn('⚠️ [AudioPlayer] Detected legacy temp path in URL:', audioUrl);
            console.warn('⚠️ This file may have been auto-deleted by R2 lifecycle rules.');
            console.warn('⚠️ Expected pattern: temp/folder/file.mp3 or permanent path without -temp/');

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
        } else if (googleDriveAudioService.isGoogleDriveUrl(audioUrl)) {
          // Google Drive URL - process through the Google Drive service
          const source = await googleDriveAudioService.processAudioLink(audioUrl);
          setAudioSource(source);

          if (source.type === 'error') {
            onError(source.errorMessage || 'Failed to load audio');
            setLoading(false);
            return;
          }
        } else {
          // Unknown URL format - try as direct
          console.log('🎵 Treating unknown URL as direct:', audioUrl);
          setAudioSource({
            type: 'direct',
            url: audioUrl,
            fileId: '',
            originalUrl: audioUrl
          });
        }
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

  // Handle audio element events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      setDuration(audio.duration);
      audio.volume = volume;
      audio.playbackRate = playbackSpeed;
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      onTimeUpdate(audio.currentTime, audio.duration);
    };

    const handleEnded = () => {
      if (replaysUsed < maxReplays - 1) {
        setReplaysUsed(prev => prev + 1);
        audio.currentTime = 0;
        audio.play();
      } else {
        onSectionComplete();
      }
    };

    const handleError = () => {
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
        url: audioSource?.url,
        originalUrl: audioSource?.originalUrl,
      });

      // Only try Google Drive embed fallback if it's a Google Drive URL
      const isGoogleDriveUrl = audioSource?.originalUrl?.includes('drive.google.com');

      if (!useEmbed && audioSource?.type === 'direct' && isGoogleDriveUrl && audioSource.fileId) {
        console.log('Audio streaming failed, switching to Google Drive embed player...');
        setUseEmbed(true);
      } else {
        // For R2 and other direct URLs, implement retry logic
        loadRetryCountRef.current++;
        console.log(`🔄 [AudioPlayer] Audio load error (attempt ${loadRetryCountRef.current}/${MAX_LOAD_RETRIES}) - ${errorDescription}`);

        if (loadRetryCountRef.current < MAX_LOAD_RETRIES) {
          // Retry loading after a short delay
          setTimeout(() => {
            if (audio) {
              console.log('🔄 [AudioPlayer] Retrying audio load...');
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
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [audioSource, volume, playbackSpeed, maxReplays, replaysUsed, onTimeUpdate, onSectionComplete, onError]);

  // Control playback
  // NOTE: In online sync mode, effectiveIsPlaying comes from masterAudioState.isPlaying
  // This ensures the student's audio automatically follows the teacher's playback control.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Don't attempt to play if audio source isn't loaded yet
    if (!audioSource?.url) {
      console.log('🎵 [AudioPlayer] Waiting for audio source to load before playing');
      return;
    }

    let cleanupFn: (() => void) | undefined;

    if (effectiveIsPlaying) {
      // Function to attempt playing audio
      const playAttempt = () => {
        audio.play().catch(err => {
          console.error('Playback failed:', err);
          // Log autoplay blocks but don't show error - browser policy, will retry
          if (err.name === 'NotAllowedError') {
            console.log('🔇 Autoplay blocked by browser - user interaction required');
            // Don't call onError - just log it. Audio will play when user interacts.
          } else if (err.name === 'NotSupportedError') {
            onError('Audio format not supported or URL invalid.');
          } else {
            onError('Failed to play audio. Please try again.');
          }
        });
      };

      // If audio is not ready, wait for it to load
      if (audio.readyState < 2) { // HAVE_CURRENT_DATA = 2
        console.log('🎵 [AudioPlayer] Audio not ready, waiting for canplay event');
        const handleCanPlay = () => {
          playAttempt();
          audio.removeEventListener('canplay', handleCanPlay);
        };
        audio.addEventListener('canplay', handleCanPlay);
        audio.load(); // Trigger load if not already loading
        cleanupFn = () => audio.removeEventListener('canplay', handleCanPlay);
      } else {
        playAttempt();
      }
    } else {
      audio.pause();
    }

    return cleanupFn;
  }, [effectiveIsPlaying, onError, audioSource]);

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
  useEffect(() => {
    console.log(`🎵 [AudioPlayer] Section/URL changed - resetting player state`);
    setReplaysUsed(0);
    setCurrentTime(0);
    setUseEmbed(false);
    loadRetryCountRef.current = 0; // Reset retry counter for new audio

    // Reset and reload audio element when URL changes
    const audio = audioRef.current;
    if (audio && audioSource?.url) {
      audio.currentTime = 0;
      audio.load(); // Force reload the audio source
    }
  }, [sectionNumber, audioUrl]);

  // Handle teacher-commanded seek position
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || seekPosition === null || seekPosition === undefined) return;

    // Only seek if audio is ready
    if (audio.readyState >= 2) { // HAVE_CURRENT_DATA
      console.log(`⏩ [AudioPlayer] Seeking to position ${seekPosition}s by teacher command`);
      audio.currentTime = seekPosition;
      setCurrentTime(seekPosition);
      // Notify parent that seek was consumed
      if (onSeekConsumed) {
        onSeekConsumed();
      }
    } else {
      // Wait for audio to be ready, then seek
      const handleCanPlay = () => {
        console.log(`⏩ [AudioPlayer] Audio ready, seeking to position ${seekPosition}s by teacher command`);
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
    }
  }, [allowRewind, currentTime]);

  // Format time for display
  const formatTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate progress percentage
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        backgroundColor: '#f8fafc',
        borderRadius: '8px',
      }}>
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
        }}>
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
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        backgroundColor: '#fef2f2',
        borderRadius: '8px',
        border: '1px solid #fecaca',
      }}>
        <span style={{ fontSize: '16px' }}>⚠️</span>
        <span style={{ fontSize: '14px', color: '#dc2626' }}>
          {audioSource.errorMessage || 'Audio load error'}
        </span>
      </div>
    );
  }

  // Embed fallback mode - compact header-friendly Google Drive iframe player
  if (useEmbed && audioSource) {
    const embedUrl = `https://drive.google.com/file/d/${audioSource.fileId}/preview`;
    return (
      <div style={{
        width: '100%',
        minWidth: '400px',
        height: '50px',
        borderRadius: '6px',
        overflow: 'hidden',
        backgroundColor: '#f1f5f9',
      }}>
        <iframe
          ref={iframeRef}
          src={embedUrl}
          width="100%"
          height="100%"
          allow="autoplay"
          style={{
            border: 'none',
            display: 'block',
          }}
          title={`Audio Section ${sectionNumber}`}
        />
      </div>
    );
  }

  const handleSpeedChange = (newSpeed: number) => {
    setLocalSpeed(newSpeed);
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = newSpeed;
    }
    onSpeedChange?.(newSpeed);
  };

  // IELTS-style Minimal Player
  if (minimal) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}>
        {/* Offline Mode Banner - Request Headphones */}
        {isOfflineMode && !hasHeadphonePermission && onRequestHeadphones && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            backgroundColor: 'rgba(251, 191, 36, 0.1)',
            border: '1px solid rgba(251, 191, 36, 0.3)',
            borderRadius: '6px',
            fontSize: '12px',
          }}>
            <span style={{ color: '#92400e' }}>
              🔇 Audio is muted in classroom mode
            </span>
            <button
              onClick={onRequestHeadphones}
              disabled={isHeadphoneRequestPending}
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                backgroundColor: isHeadphoneRequestPending ? '#e5e7eb' : '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: isHeadphoneRequestPending ? 'not-allowed' : 'pointer',
              }}
            >
              {isHeadphoneRequestPending ? '⏳ Pending...' : '🎧 Request Headphones'}
            </button>
          </div>
        )}

        {/* Main Player Row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 0',
        }}>
          {/* Hidden Audio Element */}
          <audio
            ref={audioRef}
            src={audioSource?.url}
            preload="metadata"
            style={{ display: 'none' }}
          />

          {/* Sync Indicator for Online Mode */}
          {isOnlineMode && (isSyncing || isTeacherDisconnected) && (
            <SyncIndicator
              isSyncing={isSyncing}
              isTeacherDisconnected={isTeacherDisconnected}
            />
          )}

          {/* Play/Pause Button - only show if allowed */}
          {effectiveAllowPause ? (
            <button
              onClick={onPlayPause}
              aria-label={effectiveIsPlaying ? 'Pause' : 'Play'}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: effectiveIsPlaying ? '#3b82f6' : '#374151',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                flexShrink: 0,
                transition: 'all 0.2s',
              }}
            >
              {effectiveIsPlaying ? '⏸' : '▶'}
            </button>
          ) : (
            /* Show playing indicator when pause not allowed */
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: effectiveIsPlaying ? '#3b82f6' : '#94a3b8',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              flexShrink: 0,
            }}>
              {effectiveIsPlaying ? '🎧' : '⏸'}
            </div>
          )}

          {/* Progress Bar */}
          <div style={{ flex: 1, position: 'relative', minWidth: '120px' }}>
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              disabled={!effectiveAllowRewind}
              style={{
                width: '100%',
                height: '6px',
                borderRadius: '3px',
                outline: 'none',
                appearance: 'none',
                background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${progressPercent}%, #e2e8f0 ${progressPercent}%, #e2e8f0 100%)`,
                cursor: effectiveAllowRewind ? 'pointer' : 'default',
              }}
            />
          </div>

          {/* Time Display */}
          <div style={{
            fontSize: '11px',
            fontFamily: 'monospace',
            color: '#64748b',
            minWidth: '70px',
            textAlign: 'right',
          }}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>

          {/* Speed Control Dropdown */}
          {effectiveAllowSpeedControl && (
            <select
              value={localSpeed}
              onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
              style={{
                padding: '4px 6px',
                fontSize: '11px',
                borderRadius: '4px',
                border: '1px solid #e2e8f0',
                backgroundColor: 'white',
                color: '#374151',
                cursor: 'pointer',
                minWidth: '55px',
              }}
            >
              {speedOptions.map(speed => (
                <option key={speed} value={speed}>{speed}x</option>
              ))}
            </select>
          )}

          {/* Skip Section Button */}
          {effectiveShowSkipSection && onSkipSection && (
            <button
              onClick={onSkipSection}
              title="Skip to next section"
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                borderRadius: '4px',
                border: '1px solid #e2e8f0',
                backgroundColor: 'white',
                color: '#64748b',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              ⏭️
            </button>
          )}

          {/* Replay Button (when audio ended and replay allowed) */}
          {allowReplay && replaysUsed < maxReplays && currentTime >= duration && duration > 0 && (
            <button
              onClick={() => {
                const audio = audioRef.current;
                if (audio) {
                  audio.currentTime = 0;
                  setCurrentTime(0);
                  setReplaysUsed(prev => prev + 1);
                  audio.play();
                }
              }}
              title={`Replay (${maxReplays - replaysUsed} remaining)`}
              style={{
                padding: '4px 8px',
                fontSize: '11px',
                borderRadius: '4px',
                border: '1px solid #10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                color: '#10b981',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              🔄 Replay ({maxReplays - replaysUsed})
            </button>
          )}

          {/* Volume Control - Always visible for accessibility */}
          {effectiveShowVolumeControl && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
              {/* Decrease Volume Button */}
              <button
                onClick={() => {
                  const newVolume = Math.max(0, volume - 0.1);
                  const audio = audioRef.current;
                  if (audio) audio.volume = newVolume;
                  onVolumeChange?.(newVolume);
                }}
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '4px',
                  border: '1px solid #cbd5e1',
                  background: '#f1f5f9',
                  color: '#475569',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#e2e8f0'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
                title="Decrease volume"
              >
                −
              </button>

              {/* Volume Icon */}
              <span style={{ fontSize: '12px' }}>
                {volume === 0 ? '🔇' : volume < 0.3 ? '🔈' : volume < 0.7 ? '🔉' : '🔊'}
              </span>

              {/* Volume Slider */}
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(e) => {
                  const newVolume = parseFloat(e.target.value);
                  const audio = audioRef.current;
                  if (audio) audio.volume = newVolume;
                  onVolumeChange?.(newVolume);
                }}
                style={{
                  width: '80px',
                  height: '6px',
                  borderRadius: '3px',
                  outline: 'none',
                  appearance: 'none',
                  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${volume * 100}%, #e2e8f0 ${volume * 100}%, #e2e8f0 100%)`,
                  cursor: 'pointer',
                }}
              />

              {/* Volume Percentage */}
              <span style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#3b82f6',
                minWidth: '32px',
                textAlign: 'center',
              }}>
                {Math.round(volume * 100)}%
              </span>

              {/* Increase Volume Button */}
              <button
                onClick={() => {
                  const newVolume = Math.min(1, volume + 0.1);
                  const audio = audioRef.current;
                  if (audio) audio.volume = newVolume;
                  onVolumeChange?.(newVolume);
                }}
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '4px',
                  border: '1px solid #cbd5e1',
                  background: '#f1f5f9',
                  color: '#475569',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#e2e8f0'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#f1f5f9'; }}
                title="Increase volume"
              >
                +
              </button>
            </div>
          )}
        </div>
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
          onClick={onPlayPause}
          disabled={!allowPause && effectiveIsPlaying}
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
            style={{
              width: '100%',
              height: '8px',
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
