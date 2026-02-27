/**
 * Teacher Test Control Bar Component
 * Provides controls for monitoring and managing test sessions
 * 
 * Features:
 * - Centralized Time & Status
 * - Compact Audio Controls (Listening only)
 * - Quick Action Buttons
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../modern';

interface TestSession {
  sessionCode: string;
  testId: string;
  status: 'waiting' | 'in-progress' | 'completed';
  startTime?: number;
  isPaused: boolean;
  pausedAt?: number;
  pausedDuration?: number;
  completedAt?: number;
  baseTimeExpired?: boolean; // PRD-0019
}

interface TestData {
  title: string;
  duration: number; // minutes
  questionCount: number;
  skill?: string;
  audioSections?: Array<{ number: number; name: string }>;
}

interface TeacherTestControlBarProps {
  sessionCode: string;
  session: TestSession | null;
  testData: TestData | null;
  onStartTest: () => Promise<void>;
  onPauseTest: () => Promise<void>;
  onEndTest: () => Promise<void>;
  onExtendTime: (minutes: number) => Promise<void>;
  onPauseAllAudio?: () => Promise<void>;
  onResumeAllAudio?: () => Promise<void>;
  onSkipToSection?: (sectionNumber: number) => Promise<void>;
  onSetPlaybackSpeed?: (speed: number) => Promise<void>;
  currentAudioSection?: number;
  accommodatedCount?: number; // PRD-0019
}

export const TeacherTestControlBar: React.FC<TeacherTestControlBarProps> = ({
  sessionCode,
  session,
  testData,
  onStartTest,
  onPauseTest,
  onEndTest,
  onExtendTime,
  onPauseAllAudio,
  onResumeAllAudio,
  onSkipToSection,
  onSetPlaybackSpeed,
  currentAudioSection = 1,
  accommodatedCount = 0, // PRD-0019
}) => {
  const navigate = useNavigate();
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [showTimeMenu, setShowTimeMenu] = useState(false);
  const [currentSpeed, setCurrentSpeed] = useState(1.0);
  const speedOptions = [0.75, 1.0, 1.25, 1.5, 2.0];

  // Timer Logic
  useEffect(() => {
    if (!session || !testData || session.status !== 'in-progress') {
      setTimeRemaining(testData?.duration ? testData.duration * 60 : 0);
      return;
    }

    const calculateRemaining = () => {
      const now = Date.now();
      const startTime = session.startTime || now;
      if (session.isPaused && session.pausedAt) {
        const elapsed = session.pausedAt - startTime - (session.pausedDuration || 0);
        return Math.max(0, (testData.duration * 60) - Math.floor(elapsed / 1000));
      }
      const elapsed = now - startTime - (session.pausedDuration || 0);
      return Math.max(0, (testData.duration * 60) - Math.floor(elapsed / 1000));
    };

    setTimeRemaining(calculateRemaining());
    const interval = setInterval(() => {
      if (!session.isPaused) setTimeRemaining(calculateRemaining());
    }, 1000);
    return () => clearInterval(interval);
  }, [session, testData]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleAction = async (action: () => Promise<void>) => {
    setIsLoading(true);
    try { await action(); } catch (e) { console.error(e); } finally { setIsLoading(false); }
  };

  const statusColor = session?.status === 'in-progress'
    ? (session.isPaused ? '#ef4444' : (session.baseTimeExpired ? '#f59e0b' : '#10b981')) // PRD-0019: Amber for extra time
    : '#f59e0b';

  return (
    <div style={{
      position: 'sticky',
      top: 0,
      zIndex: 100,
      background: 'rgba(255, 255, 255, 0.9)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(0,0,0,0.05)',
      padding: '0.75rem 1.5rem',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

        {/* Left: Navigation & Session */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Button variant="glass" size="sm" onClick={() => navigate(`/teacher-lobby/${sessionCode}`)} style={{ padding: '0.5rem' }}>
            ←
          </Button>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#64748b' }}>
            Session: <span style={{ color: '#1e293b', fontFamily: 'monospace' }}>{sessionCode}</span>
          </div>
        </div>

        {/* Center: Timer & Main Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
          {/* Status Dot */}
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: statusColor,
            boxShadow: `0 0 10px ${statusColor}`,
            animation: session?.status === 'in-progress' && !session?.isPaused ? 'pulse 2s infinite' : 'none'
          }} />

          {/* Timer */}
          <div style={{
            fontSize: '1.75rem',
            fontWeight: 800,
            fontVariantNumeric: 'tabular-nums',
            color: timeRemaining < 300 && session?.status === 'in-progress' && !session?.baseTimeExpired ? '#ef4444' : '#1e293b',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            lineHeight: 1,
          }}>
            <div>
              {session?.status === 'waiting' ? '--:--' : formatTime(timeRemaining)}
            </div>
            {/* PRD-0019: Show remaining student count if base time expired */}
            {session?.baseTimeExpired && accommodatedCount > 0 && (
              <div style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: '0.25rem', fontWeight: 600 }}>
                {accommodatedCount} remaining
              </div>
            )}
          </div>

          {/* Start/Pause Control */}
          {session?.status === 'waiting' ? (
            <Button variant="primary" onClick={() => handleAction(onStartTest)} disabled={isLoading || !testData} size="sm">
              Start Test
            </Button>
          ) : session?.status === 'in-progress' ? (
            <Button
              variant={session.isPaused ? 'primary' : 'glass'}
              onClick={() => handleAction(onPauseTest)}
              disabled={isLoading}
              size="sm"
              style={{ minWidth: '80px', borderColor: session.isPaused ? undefined : '#e2e8f0' }}
            >
              {session.isPaused ? 'Resume' : 'Pause'}
            </Button>
          ) : null}
        </div>

        {/* Right: Tools */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>

          {/* Audio Controls Group */}
          {testData?.skill === 'Listening' && session?.status === 'in-progress' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: '#f8fafc',
              padding: '0.25rem',
              borderRadius: '0.5rem',
              border: '1px solid #e2e8f0'
            }}>
              {onPauseAllAudio && (
                <button
                  onClick={() => handleAction(onPauseAllAudio)}
                  title="Pause All Audio"
                  style={{ padding: '0.4rem', border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: '4px', color: '#ef4444' }}
                >
                  ⏸️
                </button>
              )}
              {onResumeAllAudio && (
                <button
                  onClick={() => handleAction(onResumeAllAudio)}
                  title="Resume All Audio"
                  style={{ padding: '0.4rem', border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: '4px', color: '#10b981' }}
                >
                  ▶️
                </button>
              )}
              {onSkipToSection && testData.audioSections && testData.audioSections.length > 0 && (
                <>
                  {/* Previous Section */}
                  <button
                    onClick={() => {
                      const sections = testData.audioSections;
                      if (!sections) return;
                      const currentIdx = sections.findIndex(s => s.number === currentAudioSection);
                      if (currentIdx > 0) {
                        handleAction(() => onSkipToSection(sections[currentIdx - 1].number));
                      }
                    }}
                    disabled={currentAudioSection === testData?.audioSections?.[0]?.number}
                    title="Previous Section"
                    style={{
                      padding: '0.4rem',
                      border: 'none',
                      background: 'transparent',
                      cursor: (currentAudioSection === testData?.audioSections?.[0]?.number) ? 'not-allowed' : 'pointer',
                      borderRadius: '4px',
                      color: (currentAudioSection === testData?.audioSections?.[0]?.number) ? '#cbd5e1' : '#64748b',
                      fontSize: '0.75rem'
                    }}
                  >
                    ⏮️
                  </button>

                  {/* Section Selector */}
                  <select
                    value={currentAudioSection}
                    onChange={(e) => handleAction(() => onSkipToSection(parseInt(e.target.value)))}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: '#64748b',
                      outline: 'none',
                      cursor: 'pointer',
                      maxWidth: '70px'
                    }}
                  >
                    {testData.audioSections.map(s => <option key={s.number} value={s.number}>Sec {s.number}</option>)}
                  </select>

                  {/* Next Section */}
                  <button
                    onClick={() => {
                      const sections = testData.audioSections;
                      if (!sections) return;
                      const currentIdx = sections.findIndex(s => s.number === currentAudioSection);
                      if (currentIdx < sections.length - 1) {
                        handleAction(() => onSkipToSection(sections[currentIdx + 1].number));
                      }
                    }}
                    disabled={currentAudioSection === testData?.audioSections?.[(testData.audioSections?.length || 0) - 1]?.number}
                    title="Next Section"
                    style={{
                      padding: '0.4rem',
                      border: 'none',
                      background: 'transparent',
                      cursor: (currentAudioSection === testData?.audioSections?.[(testData.audioSections?.length || 0) - 1]?.number) ? 'not-allowed' : 'pointer',
                      borderRadius: '4px',
                      color: (currentAudioSection === testData?.audioSections?.[(testData.audioSections?.length || 0) - 1]?.number) ? '#cbd5e1' : '#64748b',
                      fontSize: '0.75rem'
                    }}
                  >
                    ⏭️
                  </button>
                </>
              )}
              {/* Speed Control */}
              {onSetPlaybackSpeed && (
                <select
                  value={currentSpeed}
                  onChange={(e) => {
                    const speed = parseFloat(e.target.value);
                    setCurrentSpeed(speed);
                    handleAction(() => onSetPlaybackSpeed(speed));
                  }}
                  title="Playback Speed (All Students)"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#64748b',
                    outline: 'none',
                    cursor: 'pointer',
                    minWidth: '50px'
                  }}
                >
                  {speedOptions.map(speed => (
                    <option key={speed} value={speed}>{speed}x</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Add Time Dropdown */}
          {session?.status === 'in-progress' && (
            <div style={{ position: 'relative' }}>
              <Button variant="glass" size="sm" onClick={() => setShowTimeMenu(!showTimeMenu)} style={{ padding: '0.5rem 0.75rem' }}>
                ⏱️ +
              </Button>
              {showTimeMenu && (
                <div style={{
                  position: 'absolute',
                  top: '110%',
                  right: 0,
                  background: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.5rem',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                  padding: '0.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                  minWidth: '100px'
                }}>
                  {[5, 10, 15].map(m => (
                    <button
                      key={m}
                      onClick={() => { handleAction(() => onExtendTime(m)); setShowTimeMenu(false); }}
                      style={{
                        padding: '0.5rem',
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        borderRadius: '0.25rem',
                        fontSize: '0.875rem',
                        color: '#1e293b',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#f1f5f9'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      + {m} mins
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* End Test - Only show if not waiting */}
          {session?.status !== 'waiting' && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => handleAction(onEndTest)}
              disabled={isLoading || session?.status === 'completed'}
              style={{ opacity: session?.status === 'completed' ? 0.5 : 1 }}
            >
              End
            </Button>
          )}
        </div>
      </div>
      <style>{`@keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }`}</style>
    </div>
  );
};
