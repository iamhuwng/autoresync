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
import { useMasterAudioState } from '../../hooks/audio';
import type { AudioMode } from '../../types/audio.types';

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
  onSkipToSection: (sectionNumber: number) => void;
  onSeekToPosition?: (sectionNumber: number, position: number) => void;
  onPauseAudio?: () => void;
  onResumeAudio?: () => void;
  playbackSpeed?: number;
  /** Session code for masterAudioState broadcasting */
  sessionCode?: string;
  /** Audio mode for the session */
  audioMode?: AudioMode;
  /** Enable new unified audio system (PRD-0018) */
  enableUnifiedAudio?: boolean;
}

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
  sessionCode,
  audioMode,
  enableUnifiedAudio = false,
}) => {
  // ============================================================
  // AUDIO ELEMENT & PLAYBACK (PRD-0018)
  // ============================================================

  const audioRef = useRef<HTMLAudioElement>(null);
  const [teacherVolume, setTeacherVolume] = useState(0.8);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [sectionLoadStates, setSectionLoadStates] = useState<SectionLoadState[]>([]);
  const preloadAudioRefs = useRef<Map<number, HTMLAudioElement>>(new Map());

  // Master audio state for unified broadcasting
  const {
    // masterState is available for future use (e.g., displaying sync metrics)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    masterState,
    play: broadcastPlay,
    pause: broadcastPause,
    seek: broadcastSeek,
    changeSection: broadcastSectionChange,
    // broadcastSpeedChange is available for speed control feature
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    changeSpeed: broadcastSpeedChange,
    startHeartbeat,
    stopHeartbeat,
  } = useMasterAudioState({
    sessionCode,
    role: 'teacher',
    enabled: enableUnifiedAudio && !!sessionCode,
  });

  // Estimate section durations (3 minutes per section if not specified)
  const sectionsWithDurations = useMemo(() => {
    return audioSections.map(section => ({
      ...section,
      estimatedDuration: section.duration || 180 // 3 minutes default
    }));
  }, [audioSections]);

  // Calculate total duration
  const totalDuration = useMemo(() => {
    return sectionsWithDurations.reduce((sum, s) => sum + s.estimatedDuration, 0);
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

  // ============================================================
  // CDN CACHE WARMING - Preload all sections (PRD-0018 Task 2.3)
  // ============================================================

  useEffect(() => {
    if (!enableUnifiedAudio) return;

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
        setSectionLoadStates(prev => prev.map(s =>
          s.section === section.number ? {
            ...s,
            status: 'ready',
            bufferedDuration: audio.duration
          } : s
        ));
        console.log(`📦 [AudioPanel] Section ${section.number} preloaded (${audio.duration?.toFixed(1)}s)`);
      };

      audio.onerror = () => {
        setSectionLoadStates(prev => prev.map(s =>
          s.section === section.number ? { ...s, status: 'error' } : s
        ));
        console.error(`❌ [AudioPanel] Failed to preload section ${section.number}`);
      };

      preloadAudioRefs.current.set(section.number, audio);
    });

    // Cleanup on unmount
    return () => {
      preloadAudioRefs.current.forEach(audio => {
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
    if (!currentSectionData?.audioUrl) {
      setAudioError('No audio URL for this section');
      return;
    }

    const audio = audioRef.current;

    // Only change source if different
    if (audio.src !== currentSectionData.audioUrl) {
      setIsAudioLoading(true);
      setAudioError(null);
      audio.src = currentSectionData.audioUrl;
      audio.load();
      console.log(`🎵 [AudioPanel] Loading section ${currentSection} audio`);
    }
  }, [currentSection, audioSections, enableUnifiedAudio]);

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
    setIsAudioLoading(false);
    console.log(`✅ [AudioPanel] Audio loaded for section ${currentSection}`);
  }, [currentSection]);

  const handleAudioError = useCallback(() => {
    setIsAudioLoading(false);
    setAudioError('Failed to load audio');
    console.error(`❌ [AudioPanel] Audio error for section ${currentSection}`);
  }, [currentSection]);

  const handleAudioTimeUpdate = useCallback(() => {
    if (!audioRef.current || isDragging) return;
    const currentTime = audioRef.current.currentTime;
    setSectionElapsed(currentTime);
    setDragValue(currentTime);
  }, [isDragging]);

  // ============================================================
  // UNIFIED AUDIO CONTROLS (PRD-0018 Task 2.4)
  // ============================================================

  const handlePlayPause = useCallback(async () => {
    if (!audioRef.current) return;

    const audio = audioRef.current;
    const position = audio.currentTime;

    if (isPaused) {
      // Resume
      try {
        await audio.play();
        if (enableUnifiedAudio) {
          await broadcastPlay(currentSection, position);
          startHeartbeat();
        }
        onResumeAudio?.();
      } catch (e) {
        console.error('[AudioPanel] Play failed:', e);
      }
    } else {
      // Pause
      audio.pause();
      if (enableUnifiedAudio) {
        await broadcastPause(currentSection, position);
        stopHeartbeat();
      }
      onPauseAudio?.();
    }
  }, [isPaused, currentSection, enableUnifiedAudio, broadcastPlay, broadcastPause, startHeartbeat, stopHeartbeat, onPauseAudio, onResumeAudio]);

  // Handle seek with broadcast
  // Note: This function is wired to the seek slider below
  const handleSeekWithBroadcast = useCallback(async (position: number) => {
    if (!audioRef.current) return;

    audioRef.current.currentTime = position;

    if (enableUnifiedAudio) {
      await broadcastSeek(currentSection, position);
    }

    onSeekToPosition?.(currentSection, position);
  }, [currentSection, enableUnifiedAudio, broadcastSeek, onSeekToPosition]);

  // Handle section change with broadcast
  const handleSectionChange = useCallback(async (newSection: number) => {
    if (enableUnifiedAudio) {
      await broadcastSectionChange(newSection);
    }
    onSkipToSection(newSection);
  }, [enableUnifiedAudio, broadcastSectionChange, onSkipToSection]);

  // Reset section timer when section changes
  useEffect(() => {
    setSectionStartTime(Date.now());
    setSectionElapsed(0);
    setIsDragging(false);
  }, [currentSection]);

  // Update elapsed time every second
  useEffect(() => {
    // Don't update if playing is stopped, paused, or user is dragging
    if (!isPlaying || isPaused || !sectionStartTime || isDragging) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - sectionStartTime) / 1000 / playbackSpeed);
      setSectionElapsed(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, isPaused, sectionStartTime, playbackSpeed, isDragging]);

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
    setSectionStartTime(Date.now() - (finalVal * 1000 * playbackSpeed));

    if (onSeekToPosition) {
      console.log(`⏩ Teacher seeking to ${finalVal}s in section ${currentSection}`);
      onSeekToPosition(currentSection, finalVal);
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
        setSectionElapsed(seconds);
        setSectionStartTime(Date.now() - (seconds * 1000 * playbackSpeed));

        if (onSeekToPosition) {
          console.log(`⏩ Teacher manually set time to ${seconds}s in section ${currentSection}`);
          onSeekToPosition(currentSection, seconds);
        }
      }
    } catch (e) {
      console.error('Invalid time format', e);
    }
  };

  // Get current section info
  const currentSectionInfo = sectionsWithDurations.find(s => s.number === currentSection);
  const currentSectionDuration = currentSectionInfo?.estimatedDuration || 180;

  // Progress for styling
  const sectionProgress = Math.min(100, (dragValue / currentSectionDuration) * 100);

  // Calculate cumulative progress for visualization
  // Note: These functions are available for extended visualizations
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getSectionPosition = (sectionNumber: number) => {
    let position = 0;
    for (const section of sectionsWithDurations) {
      if (section.number === sectionNumber) break;
      position += (section.estimatedDuration / totalDuration) * 100;
    }
    return position;
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getSectionWidth = (sectionNumber: number) => {
    const section = sectionsWithDurations.find(s => s.number === sectionNumber);
    return section ? (section.estimatedDuration / totalDuration) * 100 : 0;
  };

  if (!audioSections || audioSections.length === 0) {
    return null;
  }

  // Get preload status for display
  const loadedSections = sectionLoadStates.filter(s => s.status === 'ready').length;
  const totalSectionsToLoad = sectionLoadStates.filter(s => s.status !== 'error').length;

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
            onEnded={() => {
              // Auto-advance to next section if available
              const nextSection = currentSection + 1;
              if (nextSection <= audioSections.length) {
                handleSectionChange(nextSection);
              }
            }}
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
                  <span style={{ marginLeft: '8px', color: '#f59e0b' }}>Loading...</span>
                )}
                {enableUnifiedAudio && audioError && (
                  <span style={{ marginLeft: '8px', color: '#ef4444' }}>⚠️ {audioError}</span>
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
              <div style={{
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
                <span style={{ fontSize: '0.875rem' }}>🔊</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.1}
                  value={teacherVolume}
                  onChange={(e) => setTeacherVolume(Number(e.target.value))}
                  style={{
                    width: '60px',
                    height: '4px',
                    cursor: 'pointer',
                  }}
                  title={`Teacher volume: ${Math.round(teacherVolume * 100)}%`}
                />
              </div>
            )}

            {/* Current Section Time */}
            <div
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
              title="Click to manually edit time (MM:SS)"
            >
              {isEditingTime ? (
                <input
                  autoFocus
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
                <span>{formatTime(sectionElapsed)} / {formatTime(currentSectionDuration)}</span>
              )}
            </div>

            {/* Play/Pause Button - Updated for unified audio */}
            {(onPauseAudio && onResumeAudio) || enableUnifiedAudio ? (
              <button
                onClick={enableUnifiedAudio ? handlePlayPause : () => isPaused ? onResumeAudio?.() : onPauseAudio?.()}
                disabled={enableUnifiedAudio && isAudioLoading}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  border: 'none',
                  background: isPaused ? '#10b981' : '#ef4444',
                  color: 'white',
                  cursor: isAudioLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1rem',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  opacity: isAudioLoading ? 0.6 : 1,
                }}
                title={isPaused ? 'Resume All Audio' : 'Pause All Audio'}
              >
                {isPaused ? '▶' : '⏸'}
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
        <div style={{
          position: 'relative',
          height: '40px',
          background: '#f1f5f9',
          borderRadius: '0.5rem',
          overflow: 'hidden',
          marginBottom: '0.75rem',
          display: 'flex' // Use flex layout for segments
        }}>
          {/* Section Segments */}
          {sectionsWithDurations.map((section, index) => {
            const isCompleted = section.number < currentSection;
            const isCurrent = section.number === currentSection;
            const isUpcoming = section.number > currentSection;
            const widthPercent = (section.estimatedDuration / totalDuration) * 100;

            return (
              <div
                key={section.number}
                style={{
                  width: `${widthPercent}%`,
                  height: '100%',
                  position: 'relative',
                  borderRight: index < sectionsWithDurations.length - 1 ? '2px solid white' : 'none',
                  background: isCompleted
                    ? 'linear-gradient(90deg, #10b981, #34d399)'
                    : isCurrent
                      ? '#e2e8f0' // Background for active slider track
                      : '#f1f5f9',
                  transition: 'background 0.3s ease',
                  overflow: 'visible' // Allow slider thumb to be visible
                }}
                title={`Section ${section.number}${section.name ? `: ${section.name}` : ''}`}
              >
                {/* 1. Completed & Upcoming Sections: Simple Click Handler */}
                {!isCurrent && (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onClick={() => onSkipToSection(section.number)}
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
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      height: '100%',
                      width: `${sectionProgress}%`,
                      background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
                      pointerEvents: 'none'
                    }} />

                    {/* The Range Input (Invisible Track, Visible Thumb) */}
                    <input
                      type="range"
                      min={0}
                      max={currentSectionDuration}
                      value={dragValue}
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
                onClick={() => onSkipToSection(section.number)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
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
