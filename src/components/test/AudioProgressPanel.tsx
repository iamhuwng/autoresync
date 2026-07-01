/**
 * Audio Progress Panel Component
 * Visual progress bar for teacher to monitor and control listening test audio
 * 
 * Features:
 * - Shows all sections as clickable segments
 * - Displays current section progress
 * - Visual indicator of completed/current/upcoming sections
 * - Click to jump to any section
 * - Drag/Scrub to seek within current section
 * - ACTUAL AUDIO PLAYBACK for teacher (PRD-0018)
 * - Volume control (teacher-only, not broadcast)
 * - CDN cache warming via preloading
 * - Integration with masterAudioState for student sync
 * 
 * @see PRD-0018: Unified Audio Architecture
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Card, CardBody } from '../modern';
import {
  TEACHER_MONITOR_AUDIO_RESUME_EVENT,
  type TeacherMonitorAudioResumeDetail,
} from './teacherMonitorAudioEvents';
import type { AudioMode } from '../../types/audio.types';
import type { LiveAudioAuthoritySnapshot } from '../../features/assessment/listening/live-session/authority/liveAudioAuthorityTransaction';
import type { AuthorizedDeliveryConfig } from '../../skills/listening/components/AudioPlayer';

interface AudioSection {
  number: number;
  name: string;
  audioUrl?: string;
  duration?: number; // seconds, optional - will use estimate if not available
}

/** Audio loading state for preloading */
interface SectionLoadState {
  section: number;
  status: 'idle' | 'loading' | 'ready' | 'error';
  bufferedDuration?: number;
}

interface AudioProgressPanelProps {
  audioSections: AudioSection[];
  currentSection: number;
  isPlaying: boolean;
  isPaused: boolean;
  sessionStartTime?: number;
  onSkipToSection: (sectionNumber: number, snapshot?: LiveAudioAuthoritySnapshot) => void | Promise<void>;
  onSeekToPosition?: (sectionNumber: number, position: number, snapshot?: LiveAudioAuthoritySnapshot) => void | Promise<void>;
  onPauseAudio?: (snapshot?: LiveAudioAuthoritySnapshot) => void | Promise<void>;
  onResumeAudio?: (snapshot?: LiveAudioAuthoritySnapshot) => void | Promise<void>;
  playbackSpeed?: number;
  /** Session code for masterAudioState broadcasting */
  sessionCode?: string;
  /** Audio mode for the session */
  audioMode?: AudioMode;
  /** Enable new unified audio system (PRD-0018) */
  enableUnifiedAudio?: boolean;
  authorizedDelivery?: AuthorizedDeliveryConfig;
  masterRevision?: number | null;
  canonicalPosition?: number | null;
  authorizedDeliveryError?: string | null;
}

type TeacherMonitorStartReason = 'teacher-toggle' | 'control-bar-gesture';

const normalizeMediaDuration = (duration: number | undefined): number | null => (
  typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? duration : null
);

const getPlaybackErrorInfo = (error: unknown): { name: string; message: string; isGestureBlocked: boolean } => {
  const errorRecord = error as { name?: unknown; message?: unknown } | null;
  const name = typeof errorRecord?.name === 'string' ? errorRecord.name : '';
  const message = typeof errorRecord?.message === 'string' ? errorRecord.message : String(error);

  return {
    name,
    message,
    isGestureBlocked: name === 'NotAllowedError',
  };
};

const REFRESH_REPLACEMENT_PROBE_TIMEOUT_MS = 1500;

export const AudioProgressPanel: React.FC<AudioProgressPanelProps> = ({
  audioSections,
  currentSection,
  isPlaying,
  isPaused,
  onSkipToSection,
  onSeekToPosition,
  onPauseAudio,
  onResumeAudio,
  playbackSpeed = 1.0,
  audioMode,
  enableUnifiedAudio = false,
  authorizedDelivery,
  masterRevision = null,
  canonicalPosition = null,
  authorizedDeliveryError = null,
}) => {
  // ============================================================
  // AUDIO ELEMENT & PLAYBACK (PRD-0018)
  // ============================================================

  const audioRef = useRef<HTMLAudioElement>(null);
  const [teacherVolume, setTeacherVolume] = useState(0.8);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [isTeacherAudioPaused, setIsTeacherAudioPaused] = useState(true);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [authorizedRefreshWarning, setAuthorizedRefreshWarning] = useState<string | null>(null);
  const [authorizedSourceUrl, setAuthorizedSourceUrl] = useState<string | null>(null);
  const [activeAuthorizedDelivery, setActiveAuthorizedDelivery] = useState(authorizedDelivery);
  const [sectionLoadStates, setSectionLoadStates] = useState<SectionLoadState[]>([]);
  const [measuredSectionDurations, setMeasuredSectionDurations] = useState<Record<number, number>>({});
  const preloadAudioRefs = useRef<Map<number, HTMLAudioElement>>(new Map());
  const recentRestartFromStartAtRef = useRef<number | null>(null);
  const teacherStartInFlightRef = useRef<Promise<number> | null>(null);

  // Estimate section durations (3 minutes per section if not specified)
  const sectionsWithDurations = useMemo(() => {
    return audioSections.map(section => {
      const measuredDuration = normalizeMediaDuration(measuredSectionDurations[section.number]);
      return {
        ...section,
        estimatedDuration: measuredDuration ?? normalizeMediaDuration(section.duration) ?? 180,
      };
    });
  }, [audioSections, measuredSectionDurations]);

  // Calculate total duration
  const totalDuration = useMemo(() => {
    const duration = sectionsWithDurations.reduce((sum, s) => sum + s.estimatedDuration, 0);
    return duration > 0 ? duration : 1;
  }, [sectionsWithDurations]);

  // Track elapsed time within current section
  const [sectionElapsed, setSectionElapsed] = useState(0);
  const [sectionStartTime, setSectionStartTime] = useState<number | null>(null);

  // Dragging state for seeking
  const [isDragging, setIsDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);

  // Time editing state
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [tempTimeInput, setTempTimeInput] = useState('');
  const canonicalPositionValue = (
    typeof canonicalPosition === 'number'
    && Number.isFinite(canonicalPosition)
    && canonicalPosition >= 0
  )
    ? canonicalPosition
    : null;

  const resolveLiveTeacherIsPlaying = useCallback((): boolean => {
    if (!enableUnifiedAudio) {
      return !isPaused;
    }

    const audio = audioRef.current;
    if (audio) {
      return !audio.paused && !audio.ended;
    }

    return !isTeacherAudioPaused;
  }, [enableUnifiedAudio, isPaused, isTeacherAudioPaused]);

  const buildAuthoritySnapshot = useCallback((overrides: LiveAudioAuthoritySnapshot = {}): LiveAudioAuthoritySnapshot => ({
    section: currentSection,
    position: audioRef.current?.currentTime ?? sectionElapsed,
    speed: playbackSpeed,
    isPlaying: resolveLiveTeacherIsPlaying(),
    ...overrides,
  }), [currentSection, playbackSpeed, resolveLiveTeacherIsPlaying, sectionElapsed]);

  const baseCurrentAudioUrl = audioSections.find(
    (section) => section.number === currentSection,
  )?.audioUrl;

  useEffect(() => {
    setAuthorizedSourceUrl(null);
    setActiveAuthorizedDelivery(authorizedDelivery);
    setAuthorizedRefreshWarning(null);
  }, [authorizedDelivery, baseCurrentAudioUrl, currentSection]);

  useEffect(() => {
    const delivery = activeAuthorizedDelivery;
    if (
      !enableUnifiedAudio
      || !delivery?.refreshSource
      || !Number.isFinite(delivery.refreshAfter)
    ) {
      return;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const now = delivery.now ?? Date.now;
    const backoff = delivery.retryBackoffMs ?? [1_000, 3_000, 10_000];

    const setWarning = (message: string | null) => {
      if (cancelled) return;
      setAuthorizedRefreshWarning(message);
      delivery.onRefreshWarning?.(message);
    };

    const prepareReplacement = async (url: string) => {
      if (delivery.prepareReplacementSource) {
        await delivery.prepareReplacementSource(url);
        return;
      }
      await new Promise<void>((resolve) => {
        const candidate = new Audio();
        let settled = false;
        let probeTimer: ReturnType<typeof setTimeout> | null = null;
        const finish = (reason?: string) => {
          if (settled) return;
          settled = true;
          if (probeTimer) clearTimeout(probeTimer);
          candidate.oncanplay = null;
          candidate.onloadedmetadata = null;
          candidate.onerror = null;
          if (reason) {
            console.info('[AudioPanel] Private audio replacement preload was not decisive; accepting server-validated refreshed URL', {
              section: currentSection,
              reason,
            });
          }
          resolve();
        };
        candidate.preload = 'auto';
        candidate.oncanplay = () => finish();
        candidate.onloadedmetadata = () => finish();
        candidate.onerror = () => finish('media_preload_unavailable');
        probeTimer = setTimeout(() => finish('media_preload_timeout'), REFRESH_REPLACEMENT_PROBE_TIMEOUT_MS);
        try {
          candidate.src = url;
          candidate.load();
        } catch {
          finish('media_preload_exception');
        }
      });
    };

    const refresh = async (attempt: number) => {
      try {
        const refreshed = await delivery.refreshSource!({
          sectionNumber: currentSection,
          masterRevision,
          expiresAt: delivery.expiresAt,
        });
        if (cancelled) return;
        const replacementUrl = typeof refreshed === 'string' ? refreshed : refreshed.url;
        await prepareReplacement(replacementUrl);
        if (cancelled) return;

        const audio = audioRef.current;
        const position = audio?.currentTime ?? sectionElapsed;
        const shouldPlay = audio ? !audio.paused && !audio.ended : false;
        const speed = audio?.playbackRate ?? playbackSpeed;
        setAuthorizedSourceUrl(replacementUrl);
        setActiveAuthorizedDelivery({
          ...delivery,
          expiresAt: typeof refreshed === 'string' ? delivery.expiresAt : refreshed.expiresAt,
          refreshAfter: typeof refreshed === 'string' ? undefined : refreshed.refreshAfter,
        });
        setWarning(null);

        if (audio) {
          audio.src = replacementUrl;
          audio.load();
          const restoreAuthority = () => {
            const maxPosition = normalizeMediaDuration(audio.duration);
            audio.currentTime = maxPosition === null ? position : Math.min(position, maxPosition);
            audio.playbackRate = speed;
            if (shouldPlay) {
              void audio.play().catch(() => {
                setWarning('Private audio refreshed. Resume playback from the monitor control.');
              });
            }
          };
          if (audio.readyState >= 1) {
            restoreAuthority();
          } else {
            audio.addEventListener('loadedmetadata', restoreAuthority, { once: true });
          }
        }
      } catch {
        if (cancelled) return;
        if (attempt < backoff.length) {
          setWarning('Private audio refresh is retrying. Current audio remains active.');
          retryTimer = setTimeout(() => {
            void refresh(attempt + 1);
          }, backoff[attempt]);
          return;
        }
        setWarning('Private audio refresh needs attention. Current audio remains active.');
      }
    };

    const delay = Math.max(0, Number(delivery.refreshAfter) - now());
    const refreshTimer = setTimeout(() => {
      void refresh(0);
    }, delay);

    return () => {
      cancelled = true;
      clearTimeout(refreshTimer);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [
    activeAuthorizedDelivery,
    currentSection,
    enableUnifiedAudio,
    masterRevision,
    playbackSpeed,
  ]);

  // ============================================================
  // CDN CACHE WARMING - Preload all sections (PRD-0018 Task 2.3)
  // ============================================================

  useEffect(() => {
    if (!enableUnifiedAudio) return;
    let preloadCancelled = false;

    // Initialize load states
    setSectionLoadStates(audioSections.map(s => ({
      section: s.number,
      status: s.audioUrl ? 'idle' : 'error',
    })));

    // Preload all section audio
    audioSections.forEach(section => {
      if (!section.audioUrl) return;

      const audio = new Audio();
      audio.preload = 'metadata';
      audio.src = section.audioUrl;

      // Track loading state
      setSectionLoadStates(prev => prev.map(s =>
        s.section === section.number ? { ...s, status: 'loading' } : s
      ));

      audio.onloadedmetadata = () => {
        if (preloadCancelled) return;
        const measuredDuration = normalizeMediaDuration(audio.duration);
        if (measuredDuration !== null) {
          setMeasuredSectionDurations(prev => (
            prev[section.number] === measuredDuration
              ? prev
              : { ...prev, [section.number]: measuredDuration }
          ));
        }
        setSectionLoadStates(prev => prev.map(s =>
          s.section === section.number ? {
            ...s,
            status: 'ready',
            bufferedDuration: measuredDuration ?? audio.duration
          } : s
        ));
        console.log(`📦 [AudioPanel] Section ${section.number} preloaded (${audio.duration?.toFixed(1)}s)`);
      };

      audio.onerror = () => {
        if (preloadCancelled) return;
        setSectionLoadStates(prev => prev.map(s =>
          s.section === section.number ? { ...s, status: 'error' } : s
        ));
        console.error(`❌ [AudioPanel] Failed to preload section ${section.number}`);
      };

      preloadAudioRefs.current.set(section.number, audio);
    });

    // Cleanup on unmount
    return () => {
      preloadCancelled = true;
      preloadAudioRefs.current.forEach(audio => {
        audio.onloadedmetadata = null;
        audio.onerror = null;
        audio.src = '';
      });
      preloadAudioRefs.current.clear();
    };
  }, [audioSections, enableUnifiedAudio]);

  // ============================================================
  // AUDIO ELEMENT MANAGEMENT
  // ============================================================

  // Load audio for current section
  useEffect(() => {
    if (!enableUnifiedAudio || !audioRef.current) return;

    const currentSectionData = audioSections.find(s => s.number === currentSection);
    const currentAudioUrl = authorizedSourceUrl ?? currentSectionData?.audioUrl;
    if (!currentAudioUrl) {
      setAudioError('No audio URL for this section');
      return;
    }

    const audio = audioRef.current;

    // Only change source if different
    if (audio.src !== currentAudioUrl) {
      setIsAudioLoading(true);
      setAudioError(null);
      audio.src = currentAudioUrl;
      audio.load();
      console.log(`🎵 [AudioPanel] Loading section ${currentSection} audio`);
    }
  }, [authorizedSourceUrl, currentSection, audioSections, enableUnifiedAudio]);

  // Sync volume changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = teacherVolume;
    }
  }, [teacherVolume]);

  // Sync playback speed
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Handle audio element events
  const handleAudioLoaded = useCallback(() => {
    const measuredDuration = normalizeMediaDuration(audioRef.current?.duration);
    if (measuredDuration !== null) {
      setMeasuredSectionDurations(prev => (
        prev[currentSection] === measuredDuration
          ? prev
          : { ...prev, [currentSection]: measuredDuration }
      ));
    }
    setIsAudioLoading(false);
    setIsTeacherAudioPaused(audioRef.current?.paused ?? true);
    console.log(`✅ [AudioPanel] Audio loaded for section ${currentSection}`);
  }, [currentSection]);

  const handleAudioError = useCallback(() => {
    setIsAudioLoading(false);
    setIsTeacherAudioPaused(true);
    setAudioError('Failed to load audio');
    console.error(`❌ [AudioPanel] Audio error for section ${currentSection}`);
  }, [currentSection]);

  const handleAudioTimeUpdate = useCallback(() => {
    if (!audioRef.current || isDragging) return;
    let currentTime = audioRef.current.currentTime;
    const restartAt = recentRestartFromStartAtRef.current;

    if (restartAt !== null) {
      const elapsedSinceRestart = Date.now() - restartAt;
      if (elapsedSinceRestart <= 1500 && currentTime > 2.5) {
        console.warn('[AudioPanel] Correcting stale teacher monitor position after restart', {
          section: currentSection,
          staleTime: currentTime,
        });
        audioRef.current.currentTime = 0;
        currentTime = 0;
      } else if (elapsedSinceRestart > 1500) {
        recentRestartFromStartAtRef.current = null;
      }
    }

    setSectionElapsed(currentTime);
    setDragValue(currentTime);
  }, [currentSection, isDragging]);

  const handleAudioPlay = useCallback(() => {
    setIsTeacherAudioPaused(false);
  }, []);

  const handleAudioPause = useCallback(() => {
    setIsTeacherAudioPaused(true);
  }, []);

  const restartEndedTeacherAudio = useCallback((audio: HTMLAudioElement): number => {
    const duration = Number.isFinite(audio.duration) ? audio.duration : null;
    const isAtEnd = audio.ended || (duration !== null && duration > 0 && audio.currentTime >= Math.max(0, duration - 0.05));

    if (!isAtEnd) {
      return audio.currentTime;
    }

    audio.currentTime = 0;
    recentRestartFromStartAtRef.current = Date.now();
    setSectionElapsed(0);
    setDragValue(0);
    setSectionStartTime(Date.now());
    console.info('[AudioPanel] Restarting ended teacher monitor audio from section start', {
      section: currentSection,
      duration,
    });
    return 0;
  }, [currentSection]);

  const startTeacherAudio = useCallback(async (reason: TeacherMonitorStartReason): Promise<number> => {
    const audio = audioRef.current;
    if (!audio) {
      return 0;
    }

    if (teacherStartInFlightRef.current) {
      return teacherStartInFlightRef.current;
    }

    const startPromise = (async () => {
      const position = restartEndedTeacherAudio(audio);

      try {
        await audio.play();
        setAudioError(null);
        setIsTeacherAudioPaused(false);
        return position;
      } catch (error: unknown) {
        const playbackError = getPlaybackErrorInfo(error);
        const diagnostic = {
          section: currentSection,
          readyState: audio.readyState,
          muted: audio.muted,
          volume: audio.volume,
          reason,
          errorName: playbackError.name,
          message: playbackError.message,
        };

        setIsTeacherAudioPaused(true);

        if (playbackError.isGestureBlocked) {
          setAudioError('Click play in the Audio Control Panel to enable teacher monitor audio in this browser.');
          console.info('[AudioPanel] Teacher monitor playback requires a direct browser gesture', diagnostic);
        } else {
          console.warn('[AudioPanel] Teacher local playback could not start', diagnostic);
        }

        throw error;
      } finally {
        if (teacherStartInFlightRef.current === startPromise) {
          teacherStartInFlightRef.current = null;
        }
      }
    })();

    teacherStartInFlightRef.current = startPromise;
    return startPromise;
  }, [currentSection, restartEndedTeacherAudio]);

  useEffect(() => {
    if (!enableUnifiedAudio || !audioRef.current) return;

    const audio = audioRef.current;
    if (!isPlaying || isPaused) {
      if (!audio.paused) {
        audio.pause();
      }
      setIsTeacherAudioPaused(true);
      return;
    }

    if (!audio.currentSrc || audio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !audio.paused) {
      return;
    }

    console.info('[AudioPanel] Teacher monitor audio is ready and waiting for a toolbar or panel play gesture', {
      section: currentSection,
      readyState: audio.readyState,
      currentTime: audio.currentTime,
    });
  }, [currentSection, enableUnifiedAudio, isAudioLoading, isPaused, isPlaying]);

  useEffect(() => {
    if (!enableUnifiedAudio || typeof window === 'undefined') return;

    const handleToolbarResumeGesture = (event: Event) => {
      const detail = (event as CustomEvent<TeacherMonitorAudioResumeDetail>).detail;
      const audio = audioRef.current;

      if (!audio) {
        console.info('[AudioPanel] Ignored teacher monitor resume gesture before audio element was ready', {
          section: currentSection,
          source: detail?.source,
        });
        return;
      }

      void startTeacherAudio('control-bar-gesture').catch((error: unknown) => {
        if (getPlaybackErrorInfo(error).isGestureBlocked) {
          return;
        }

        console.error('[AudioPanel] Toolbar resume local playback failed:', error);
      });
    };

    window.addEventListener(TEACHER_MONITOR_AUDIO_RESUME_EVENT, handleToolbarResumeGesture);
    return () => window.removeEventListener(TEACHER_MONITOR_AUDIO_RESUME_EVENT, handleToolbarResumeGesture);
  }, [currentSection, enableUnifiedAudio, startTeacherAudio]);

  // ============================================================
  // UNIFIED AUDIO CONTROLS (PRD-0018 Task 2.4)
  // ============================================================

  const handlePlayPause = useCallback(async () => {
    if (!audioRef.current) return;

    const audio = audioRef.current;
    const shouldResume = enableUnifiedAudio ? isTeacherAudioPaused : isPaused;

    if (shouldResume) {
      // Resume
      try {
        const position = await startTeacherAudio('teacher-toggle');
        await onResumeAudio?.(buildAuthoritySnapshot({ position, isPlaying: true }));
        if (position === 0 && audioRef.current && !audioRef.current.ended) {
          audioRef.current.currentTime = 0;
          setSectionElapsed(0);
          setDragValue(0);
        }
      } catch (e) {
        if (getPlaybackErrorInfo(e).isGestureBlocked) {
          return;
        }
        console.error('[AudioPanel] Play failed:', e);
      }
    } else {
      // Pause
      const position = audio.currentTime;
      audio.pause();
      setIsTeacherAudioPaused(true);
      await onPauseAudio?.(buildAuthoritySnapshot({ position, isPlaying: false }));
    }
  }, [enableUnifiedAudio, isPaused, isTeacherAudioPaused, startTeacherAudio, buildAuthoritySnapshot, onPauseAudio, onResumeAudio]);

  // Handle section change with broadcast
  const handleSectionChange = useCallback(async (newSection: number) => {
    await onSkipToSection(newSection, buildAuthoritySnapshot({
      section: newSection,
      position: 0,
    }));
  }, [buildAuthoritySnapshot, onSkipToSection]);

  const handleAudioEnded = useCallback(() => {
    setIsTeacherAudioPaused(true);

    // Auto-advance to next section if available
    const nextSection = currentSection + 1;
    if (nextSection <= audioSections.length) {
      handleSectionChange(nextSection);
    }
  }, [audioSections.length, currentSection, handleSectionChange]);

  // Reset section timer when section changes
  useEffect(() => {
    setSectionStartTime(Date.now());
    setSectionElapsed(0);
    setIsDragging(false);
  }, [currentSection]);

  // Update elapsed time every second
  useEffect(() => {
    if (enableUnifiedAudio) return;

    // Don't update if playing is stopped, paused, or user is dragging
    if (!isPlaying || isPaused || !sectionStartTime || isDragging) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - sectionStartTime) / 1000 / playbackSpeed);
      setSectionElapsed(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [enableUnifiedAudio, isPlaying, isPaused, sectionStartTime, playbackSpeed, isDragging]);

  // Sync drag value when not dragging
  useEffect(() => {
    if (!isDragging) {
      setDragValue(sectionElapsed);
    }
  }, [sectionElapsed, isDragging]);

  // Handle seek start
  const handleSeekStart = () => {
    setIsDragging(true);
  };

  // Handle seek change (while dragging)
  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = Number(e.target.value);
    setDragValue(newVal);
    // update displayed time immediately for feedback
    setSectionElapsed(newVal);
  };

  // Handle seek end (release)
  const handleSeekEnd = (e: React.MouseEvent<HTMLInputElement> | React.TouchEvent<HTMLInputElement>) => {
    const finalVal = Number(e.currentTarget.value);
    setIsDragging(false);

    // Update local timer base so it continues counting from here
    // elapsed = (now - start) / 1000 -> start = now - (elapsed * 1000)
    if (audioRef.current) {
      audioRef.current.currentTime = finalVal;
    }
    setDragValue(finalVal);
    setSectionStartTime(Date.now() - (finalVal * 1000 * playbackSpeed));

    if (onSeekToPosition) {
      console.log(`⏩ Teacher seeking to ${finalVal}s in section ${currentSection}`);
      onSeekToPosition(currentSection, finalVal, buildAuthoritySnapshot({ position: finalVal }));
    }
  };

  // Format time as MM:SS
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleTimeDisplayClick = () => {
    setIsEditingTime(true);
    setTempTimeInput(formatTime(sectionElapsed));
  };

  const handleTimeDisplayKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    handleTimeDisplayClick();
  };

  const handleSectionKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, sectionNumber: number) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    handleSectionChange(sectionNumber);
  };

  const handleTimeInputBlur = () => {
    handleTimeInputCommit();
  };

  const handleTimeInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTimeInputCommit();
    } else if (e.key === 'Escape') {
      setIsEditingTime(false);
    }
  };

  const handleTimeInputCommit = () => {
    setIsEditingTime(false);

    // Parse MM:SS or simply integer seconds
    try {
      let seconds = 0;
      if (tempTimeInput.includes(':')) {
        const parts = tempTimeInput.split(':').map(p => parseInt(p.trim(), 10));
        const minutes = parts[0];
        const secs = parts[1];
        if (parts.length === 2 && minutes !== undefined && secs !== undefined && !isNaN(minutes) && !isNaN(secs)) {
          seconds = minutes * 60 + secs;
        } else {
          return; // Invalid format
        }
      } else {
        seconds = parseInt(tempTimeInput.trim(), 10);
      }

      if (!isNaN(seconds)) {
        // Clamp to sane values? Or trust user? 
        // Let's cap at max duration + margin or just 0
        seconds = Math.max(0, seconds);

        // Update local state immediately
        if (audioRef.current) {
          audioRef.current.currentTime = seconds;
        }
        setSectionElapsed(seconds);
        setDragValue(seconds);
        setSectionStartTime(Date.now() - (seconds * 1000 * playbackSpeed));

        if (onSeekToPosition) {
          console.log(`⏩ Teacher manually set time to ${seconds}s in section ${currentSection}`);
          onSeekToPosition(currentSection, seconds, buildAuthoritySnapshot({ position: seconds }));
        }
      }
    } catch (e) {
      console.error('Invalid time format', e);
    }
  };

  // Get current section info
  const currentSectionInfo = sectionsWithDurations.find(s => s.number === currentSection);
  const currentSectionDuration = normalizeMediaDuration(currentSectionInfo?.estimatedDuration) ?? 180;
  const boundedDragValue = Math.min(currentSectionDuration, Math.max(0, dragValue));
  const boundedSectionElapsed = Math.min(currentSectionDuration, Math.max(0, sectionElapsed));

  // Progress for styling
  const sectionProgress = Math.min(100, Math.max(0, (boundedDragValue / currentSectionDuration) * 100));

  useEffect(() => {
    if (!enableUnifiedAudio || isDragging || canonicalPositionValue === null) {
      return;
    }

    const boundedPosition = Math.min(currentSectionDuration, canonicalPositionValue);
    setSectionElapsed(boundedPosition);
    setDragValue(boundedPosition);
    setSectionStartTime(Date.now() - (boundedPosition * 1000 * playbackSpeed));

    const audio = audioRef.current;
    if (audio && Math.abs(audio.currentTime - boundedPosition) > 0.25) {
      try {
        audio.currentTime = boundedPosition;
      } catch {
        console.warn('[AudioPanel] Could not apply canonical teacher monitor position', {
          section: currentSection,
          position: boundedPosition,
          revision: masterRevision,
        });
      }
    }
  }, [
    canonicalPositionValue,
    currentSection,
    currentSectionDuration,
    enableUnifiedAudio,
    isDragging,
    masterRevision,
    playbackSpeed,
  ]);

  if (!audioSections || audioSections.length === 0) {
    return null;
  }

  // Get preload status for display
  const loadedSections = sectionLoadStates.filter(s => s.status === 'ready').length;
  const totalSectionsToLoad = sectionLoadStates.filter(s => s.status !== 'error').length;
  const isPlaybackControlPaused = enableUnifiedAudio ? isTeacherAudioPaused : isPaused;

  return (
    <Card variant="glass" style={{ marginBottom: '1rem' }}>
      <CardBody style={{ padding: '1rem' }}>
        {/* Hidden Audio Element for Teacher Playback (PRD-0018) */}
        {enableUnifiedAudio && (
          <audio
            ref={audioRef}
            onLoadedData={handleAudioLoaded}
            onError={handleAudioError}
            onTimeUpdate={handleAudioTimeUpdate}
            onPlay={handleAudioPlay}
            onPause={handleAudioPause}
            onEnded={handleAudioEnded}
            style={{ display: 'none' }}
          />
        )}

        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.75rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.25rem' }}>🎵</span>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1e293b' }}>
                Audio Control Panel
                {enableUnifiedAudio && audioMode && (
                  <span style={{
                    marginLeft: '0.5rem',
                    fontSize: '0.65rem',
                    padding: '0.125rem 0.375rem',
                    borderRadius: '4px',
                    background: audioMode === 'online' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                    color: audioMode === 'online' ? '#3b82f6' : '#10b981',
                  }}>
                    {audioMode === 'online' ? '🌐 Online' : '🏫 Offline'}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Section {currentSection} of {audioSections.length}
                {currentSectionInfo?.name && ` • ${currentSectionInfo.name}`}
                {enableUnifiedAudio && isAudioLoading && (
                  <span role="status" aria-live="polite" style={{ marginLeft: '8px', color: '#f59e0b' }}>Loading audio...</span>
                )}
                {enableUnifiedAudio && audioError && (
                  <span role="alert" aria-live="assertive" style={{ marginLeft: '8px', color: '#ef4444' }}>⚠️ {audioError}</span>
                )}
                {enableUnifiedAudio && authorizedDeliveryError && (
                  <span role="alert" aria-live="assertive" style={{ marginLeft: '8px', color: '#ef4444' }}>
                    Private audio is unavailable.
                  </span>
                )}
                {enableUnifiedAudio && authorizedRefreshWarning && (
                  <span role="status" aria-live="polite" style={{ marginLeft: '8px', color: '#b45309' }}>
                    {authorizedRefreshWarning}
                  </span>
                )}
                {!enableUnifiedAudio && (
                  <span style={{ marginLeft: '8px', color: '#94a3b8', fontSize: '0.65rem' }}>
                    (Drag slider to seek for all students)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Playback Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {/* Preload Status (when unified audio enabled) */}
            {enableUnifiedAudio && totalSectionsToLoad > 0 && loadedSections < totalSectionsToLoad && (
              <div role="status" aria-live="polite" style={{
                fontSize: '0.65rem',
                color: '#94a3b8',
                padding: '0.25rem 0.5rem',
                background: '#f1f5f9',
                borderRadius: '4px',
              }}>
                📦 Loading {loadedSections}/{totalSectionsToLoad}
              </div>
            )}

            {/* Teacher Volume Control (PRD-0018) */}
            {enableUnifiedAudio && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '0.25rem 0.5rem',
                background: '#f8fafc',
                borderRadius: '0.25rem',
              }}>
                <span style={{ fontSize: '0.875rem' }} aria-hidden="true">🔊</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={teacherVolume}
                  onChange={(e) => setTeacherVolume(Number(e.target.value))}
                  aria-label="Teacher monitor volume"
                  style={{
                    width: '88px',
                    minHeight: '44px',
                    cursor: 'pointer',
                  }}
                  title={`Teacher volume: ${Math.round(teacherVolume * 100)}%`}
                />
              </div>
            )}

            {/* Current Section Time */}
            <div
              role={!isEditingTime ? 'button' : undefined}
              tabIndex={!isEditingTime ? 0 : undefined}
              aria-label={!isEditingTime ? `Edit current audio time, ${formatTime(boundedSectionElapsed)} of ${formatTime(currentSectionDuration)}` : undefined}
              style={{
                fontSize: '0.875rem',
                fontWeight: 600,
                fontFamily: 'monospace',
                color: '#64748b',
                padding: '0.25rem 0.5rem',
                background: '#f8fafc',
                borderRadius: '0.25rem',
                minWidth: '100px',
                textAlign: 'center',
                cursor: 'pointer',
                border: isEditingTime ? '1px solid #3b82f6' : '1px solid transparent'
              }}
              onClick={!isEditingTime ? handleTimeDisplayClick : undefined}
              onKeyDown={!isEditingTime ? handleTimeDisplayKeyDown : undefined}
              title="Click to manually edit time (MM:SS)"
            >
              {isEditingTime ? (
                <input
                  autoFocus
                  aria-label="Set current audio time"
                  value={tempTimeInput}
                  onChange={(e) => setTempTimeInput(e.target.value)}
                  onBlur={handleTimeInputBlur}
                  onKeyDown={handleTimeInputKeyDown}
                  style={{
                    width: '100%',
                    border: 'none',
                    background: 'transparent',
                    fontFamily: 'inherit',
                    fontSize: 'inherit',
                    fontWeight: 'inherit',
                    color: '#3b82f6',
                    textAlign: 'center',
                    outline: 'none',
                    padding: 0
                  }}
                />
              ) : (
                <span>{formatTime(boundedSectionElapsed)} / {formatTime(currentSectionDuration)}</span>
              )}
            </div>

            {/* Play/Pause Button - Updated for unified audio */}
            {(onPauseAudio && onResumeAudio) || enableUnifiedAudio ? (
              <button
                type="button"
                onClick={enableUnifiedAudio
                  ? handlePlayPause
                  : () => isPlaybackControlPaused
                    ? onResumeAudio?.(buildAuthoritySnapshot({ isPlaying: true }))
                    : onPauseAudio?.(buildAuthoritySnapshot({ isPlaying: false }))}
                disabled={enableUnifiedAudio && isAudioLoading}
                aria-label={isPlaybackControlPaused ? 'Resume All Audio' : 'Pause All Audio'}
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  border: 'none',
                  background: isPlaybackControlPaused ? '#10b981' : '#ef4444',
                  color: 'white',
                  cursor: isAudioLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1rem',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  opacity: isAudioLoading ? 0.6 : 1,
                }}
                title={isPlaybackControlPaused ? 'Resume All Audio' : 'Pause All Audio'}
              >
                {isPlaybackControlPaused ? '▶' : '⏸'}
              </button>
            ) : null}

            {/* Speed Indicator */}
            {playbackSpeed !== 1.0 && (
              <div style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: '#8b5cf6',
                padding: '0.25rem 0.5rem',
                background: 'rgba(139, 92, 246, 0.1)',
                borderRadius: '0.25rem'
              }}>
                {playbackSpeed}x
              </div>
            )}
          </div>
        </div>

        {/* Main Progress Bar Container */}
        <div
          data-testid="audio-section-progress-bar"
          style={{
            position: 'relative',
            height: '44px',
            minHeight: '44px',
            background: '#f1f5f9',
            borderRadius: '0.5rem',
            overflow: 'hidden',
            marginBottom: '0.75rem',
            display: 'flex',
            alignItems: 'stretch',
          }}
        >
          {/* Section Segments */}
          {sectionsWithDurations.map((section, index) => {
            const isCompleted = section.number < currentSection;
            const isCurrent = section.number === currentSection;
            const isUpcoming = section.number > currentSection;
            const widthPercent = (section.estimatedDuration / totalDuration) * 100;

            return (
              <div
                key={section.number}
                data-testid={`audio-section-segment-${section.number}`}
                style={{
                  flex: `0 0 ${widthPercent}%`,
                  width: `${widthPercent}%`,
                  height: '44px',
                  minWidth: 0,
                  position: 'relative',
                  boxSizing: 'border-box',
                  borderRight: index < sectionsWithDurations.length - 1 ? '2px solid white' : 'none',
                  background: isCompleted
                    ? 'linear-gradient(90deg, #10b981, #34d399)'
                    : isCurrent
                      ? '#e2e8f0' // Background for active slider track
                    : '#f1f5f9',
                  transition: 'background 0.3s ease',
                  overflow: 'hidden',
                }}
                title={`Section ${section.number}${section.name ? `: ${section.name}` : ''}`}
              >
                {/* 1. Completed & Upcoming Sections: Simple Click Handler */}
                {!isCurrent && (
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`Jump to section ${section.number}, ${isCompleted ? 'completed' : 'upcoming'}`}
                    style={{
                      width: '100%',
                      height: '100%',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onClick={() => handleSectionChange(section.number)}
                    onKeyDown={(event) => handleSectionKeyDown(event, section.number)}
                  >
                    <span style={{
                      zIndex: 1,
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: isUpcoming ? '#94a3b8' : 'white',
                    }}>
                      {section.number}
                    </span>
                  </div>
                )}

                {/* 2. Current Section: Interactive Slider */}
                {isCurrent && (
                  <>
                    {/* Background Progress Fill (Visual Only) */}
                    <div
                      data-testid={`audio-section-progress-fill-${section.number}`}
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        height: '100%',
                        width: `${sectionProgress}%`,
                        background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                        pointerEvents: 'none',
                      }}
                    />

                    {/* The Range Input (Invisible Track, Visible Thumb) */}
                    <input
                      type="range"
                      min={0}
                      max={currentSectionDuration}
                      step="any"
                      value={boundedDragValue}
                      aria-label={`Seek section ${section.number}`}
                      onMouseDown={handleSeekStart}
                      onTouchStart={handleSeekStart}
                      onChange={handleSeekChange}
                      onMouseUp={handleSeekEnd}
                      onTouchEnd={handleSeekEnd}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        margin: 0,
                        opacity: 0, // Hide default apperance, we use custom thumb/track
                        cursor: 'grab',
                        zIndex: 10
                      }}
                    />

                    {/* Custom Label (Centered) */}
                    <div style={{
                      position: 'absolute',
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      pointerEvents: 'none', // Pass clicks through
                      zIndex: 5
                    }}>
                      <span style={{
                        fontSize: '0.875rem',
                        fontWeight: 700,
                        color: sectionProgress > 50 ? 'white' : '#64748b', // Contrast change
                        textShadow: sectionProgress > 50 ? '0 1px 2px rgba(0,0,0,0.2)' : 'none'
                      }}>
                        Section {section.number}
                      </span>
                    </div>

                    <div style={{
                      position: 'absolute',
                      left: `${sectionProgress}%`,
                      top: '0',
                      bottom: '0',
                      width: '4px',
                      background: 'white',
                      boxShadow: '0 0 4px rgba(0,0,0,0.3)',
                      pointerEvents: 'none',
                      zIndex: 6,
                      transform: 'translateX(-50%)',
                      transition: isDragging ? 'none' : 'left 0.1s linear'
                    }}>
                      {isDragging && (
                        <div style={{
                          position: 'absolute',
                          bottom: '100%',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          marginBottom: '8px',
                          background: '#1e293b',
                          color: 'white',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          whiteSpace: 'nowrap',
                          fontWeight: 600,
                          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                        }}>
                          {formatTime(dragValue)}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Section Legend */}
        <div style={{
          display: 'flex',
          gap: '1rem',
          flexWrap: 'wrap',
          justifyContent: 'center'
        }}>
          {sectionsWithDurations.map(section => {
            const isCompleted = section.number < currentSection;
            const isCurrent = section.number === currentSection;

            return (
              <button
                key={section.number}
                onClick={() => handleSectionChange(section.number)}
                aria-label={`Jump to section ${section.number}, ${isCurrent ? 'current' : isCompleted ? 'completed' : 'upcoming'}${section.name ? `, ${section.name}` : ''}`}
                aria-pressed={isCurrent}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  minHeight: '44px',
                  padding: '0.375rem 0.75rem',
                  border: isCurrent ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                  borderRadius: '0.5rem',
                  background: isCurrent ? 'rgba(59, 130, 246, 0.1)' : 'white',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  fontSize: '0.75rem'
                }}
              >
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: isCompleted ? '#10b981' : isCurrent ? '#3b82f6' : '#e2e8f0'
                }} />
                <span style={{
                  fontWeight: isCurrent ? 700 : 500,
                  color: isCurrent ? '#3b82f6' : '#64748b'
                }}>
                  Sec {section.number}
                </span>
                {section.name && (
                  <span style={{ color: '#94a3b8', fontSize: '0.65rem' }}>
                    {section.name.length > 15 ? section.name.substring(0, 15) + '...' : section.name}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
};

export default AudioProgressPanel;
