/**
 * Teacher Test Monitoring Page
 * Real-time dashboard for monitoring students during test sessions
 * 
 * Features:
 * - Live student progress tracking
 * - Grid layout of student cards
 * - Session controls (pause, extend, end)
 * - Test metadata display
 * - Real-time Firebase listeners
 */

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Center, Loader } from '@mantine/core';
import { notifications } from '@mantine/notifications'; // PRD-0019
import { Card, CardBody } from '../components/modern';
import { Button } from '../components/modern';
import { StudentProgressCard } from '../components/test/StudentProgressCard';
import { TeacherTestControlBar } from '../components/test/TeacherTestControlBar';
import { StudentDetailModal } from '../components/test/StudentDetailModal';
import { AudioProgressPanel } from '../components/test/AudioProgressPanel';
import { HeadphoneRequestPanel } from '../components/test/HeadphoneRequestPanel';
import { useMonitorSession, useMonitorControls } from '../hooks/monitor';
import { useHeadphonePermission } from '../hooks/audio/useHeadphonePermission';
import { usePagination } from '../hooks/monitor/usePagination';
import { calculateSessionStatistics, transformAnswersForModal } from '../utils/monitor';
import { useNavigation } from '../hooks/useNavigation';
import { useTimerExpiry } from '../hooks/test/useTimerExpiry'; // PRD-0019
import { CountdownWarningModal } from '../components/test/CountdownWarningModal'; // PRD-0019
import { AccommodationStatusBar } from '../components/test/AccommodationStatusBar'; // PRD-0019
// PRD-0028: THCS Monitor Integration
import { THCSStudentProgressCard } from '../components/thcs-grading/THCSStudentProgressCard';
import { InlineWritingGrader } from '../components/thcs-grading/InlineWritingGrader';
import type { THCSSection, THCSQuestion } from '../types/thcs-test.types';

// PRD-0030: IELTS Writing Monitor Integration
import WritingMonitorCard from '../components/writing-monitor/WritingMonitorCard';
import WritingPeekModal from '../components/writing-monitor/WritingPeekModal';
import { autoSubmitFromRTDB } from '../services/writingSubmissionService';
import { ref, get, set, update } from 'firebase/database';
// @ts-ignore — JS service file
import { database } from '../services/firebase';
import type { WritingTestFormat, IELTSWritingTest } from '../types/ielts-writing.types';
import { computeRiskLevel } from '../utils/integrityUtils'; // PRD-0036

// Types imported from hooks (StudentProgress used internally by useMonitorSession)

export const TeacherTestMonitorPage: React.FC = () => {
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const { navigateTo } = useNavigation('teacher');

  // State for student detail modal - only store the ID, get current data from students array
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // State for tracking current audio section (for listening tests)
  const [currentAudioSection, setCurrentAudioSection] = useState(1);
  const [isAudioPaused, setIsAudioPaused] = useState(false);
  const [currentPlaybackSpeed, setCurrentPlaybackSpeed] = useState(1.0);

  // PRD-0028: THCS detection and inline grading state
  const [isTHCSSession, setIsTHCSSession] = useState(false);
  const [gradingStudentId, setGradingStudentId] = useState<string | null>(null);

  // PRD-0030: Writing session detection and peek state
  const [isWritingSession, setIsWritingSession] = useState(false);
  const [peekStudentUid, setPeekStudentUid] = useState<string | null>(null);
  const writingEndSubmitRef = useRef(false);

  // Use extracted hooks for session monitoring
  const { session, students, testData, fullTestData, loading, error } = useMonitorSession(sessionCode);

  // PRD-0028: Detect THCS test type from fullTestData
  useEffect(() => {
    if (fullTestData?.testType === 'THCS-THPT') {
      setIsTHCSSession(true);
    } else if (fullTestData && !fullTestData.testType) {
      setIsTHCSSession(false);
    }
  }, [fullTestData]);

  // PRD-0030: Detect Writing session from testData.skill
  useEffect(() => {
    if (testData?.skill === 'Writing') {
      setIsWritingSession(true);
    }
  }, [testData]);

  // PRD-0030: Writing test format for monitor cards
  const writingTestFormat: WritingTestFormat = useMemo(() => {
    if (!isWritingSession || !fullTestData) return 'full-test';
    return (fullTestData as any).metadata?.format || 'full-test';
  }, [isWritingSession, fullTestData]);

  // PRD-0030: Handle Reopen — teacher reopens a submitted student's writing test
  const handleWritingReopen = useCallback(async (studentUid: string) => {
    if (!sessionCode) return;
    try {
      await set(
        ref(database, `game_sessions/${sessionCode}/students/${studentUid}/writing/reopened`),
        true
      );
      notifications.show({
        title: 'Reopened',
        message: 'Student can continue writing.',
        color: 'blue',
        autoClose: 3000,
      });
    } catch (err) {
      console.error('❌ Failed to reopen writing for student:', err);
    }
  }, [sessionCode]);

  // PRD-0030 [GAP-14]: End-session auto-submit for Writing
  // When teacher ends session, auto-submit all unsubmitted students
  const handleWritingEndSessionSubmit = useCallback(async () => {
    if (!sessionCode || !fullTestData || writingEndSubmitRef.current) return;
    writingEndSubmitRef.current = true;

    try {
      const studentsRef = ref(database, `game_sessions/${sessionCode}/students`);
      const snap = await get(studentsRef);
      if (!snap.exists()) return;

      const studentsData = snap.val();
      const unsubmittedUids = Object.keys(studentsData).filter(
        uid => studentsData[uid]?.writing?.submitted !== true
      );

      if (unsubmittedUids.length === 0) return;

      console.log(`📝 [PRD-0030] Auto-submitting ${unsubmittedUids.length} writing students...`);

      // Submit all unsubmitted students in parallel
      await Promise.all(
        unsubmittedUids.map(uid => {
          const studentName = studentsData[uid]?.name || studentsData[uid]?.playerName || 'Student';
          return autoSubmitFromRTDB(sessionCode, uid, studentName, fullTestData as unknown as IELTSWritingTest);
        })
      );

      console.log('✅ [PRD-0030] All unsubmitted writing students auto-submitted');
      notifications.show({
        title: 'Auto-submitted',
        message: `${unsubmittedUids.length} student(s) auto-submitted.`,
        color: 'green',
        autoClose: 3000,
      });
    } catch (err) {
      console.error('❌ [PRD-0030] Failed to auto-submit writing students:', err);
    } finally {
      writingEndSubmitRef.current = false;
    }
  }, [sessionCode, fullTestData]);

  // PRD-0030: Trigger writing auto-submit when session status changes to ended
  useEffect(() => {
    if (isWritingSession && session?.status === 'completed' && !writingEndSubmitRef.current) {
      handleWritingEndSessionSubmit();
    }
  }, [isWritingSession, session?.status, handleWritingEndSessionSubmit]);

  // PRD-0028: Compute THCS section breakdown for each student
  const thcsSections: THCSSection[] = useMemo(() => {
    if (!isTHCSSession || !fullTestData?.sections) return [];
    return fullTestData.sections as THCSSection[];
  }, [isTHCSSession, fullTestData]);

  const getStudentPartBreakdown = useCallback((playerData: any) => {
    if (!isTHCSSession || thcsSections.length === 0) return [];
    const answers = playerData?.answers || {};
    return thcsSections.map(section => {
      const sectionQuestions = section.questions || [];
      const answered = sectionQuestions.filter((q: THCSQuestion) =>
        answers[q.questionNumber] !== undefined
      ).length;
      return {
        partName: section.name.replace(/^PART\s+/, '').split(':')[0]?.trim() || section.name,
        answered,
        total: sectionQuestions.length,
      };
    });
  }, [isTHCSSession, thcsSections]);

  const getStudentWritingInfo = useCallback((playerData: any) => {
    if (!isTHCSSession || !fullTestData?.sections) return { total: 0, submitted: 0, graded: 0 };
    const answers = playerData?.answers || {};
    let total = 0;
    let submitted = 0;
    let graded = 0;
    for (const section of fullTestData.sections as THCSSection[]) {
      for (const q of section.questions || []) {
        if (q.type === 'sentence-rewrite' || q.type === 'sentence-rewrite-keyword') {
          total++;
          if (answers[q.questionNumber] !== undefined) submitted++;
          // Check grading status from results
          const result = session?.results?.[playerData?.uid]?.questionResults?.[q.questionNumber];
          if (result?.writingResult?.gradingTier === 'teacher-graded' ||
            result?.writingResult?.gradingTier === 'auto-correct' ||
            result?.writingResult?.gradingTier === 'ai-correct') {
            graded++;
          }
        }
      }
    }
    return { total, submitted, graded };
  }, [isTHCSSession, fullTestData, session]);

  // PRD-0028: Get writing answers for inline grader
  const getWritingAnswersForStudent = useCallback((studentId: string) => {
    if (!isTHCSSession || !fullTestData?.sections || !session?.players) return [];
    const playerData = session.players[studentId];
    if (!playerData) return [];
    const answers = playerData.answers || {};
    const writingAnswers: any[] = [];
    for (const section of fullTestData.sections as THCSSection[]) {
      for (const q of section.questions || []) {
        if (q.type === 'sentence-rewrite' || q.type === 'sentence-rewrite-keyword') {
          writingAnswers.push({
            studentId,
            studentName: playerData.name || playerData.playerName || 'Student',
            questionNumber: q.questionNumber,
            originalSentence: q.originalSentence || q.questionText || '',
            sentenceStarter: q.sentenceStarter,
            keyword: q.keyword,
            modelAnswers: q.modelAnswers || [],
            studentAnswer: typeof answers[q.questionNumber] === 'string' ? answers[q.questionNumber] : '',
            aiScore: undefined, // Will be populated from results if available
            aiFeedback: undefined,
            gradingTier: undefined,
            pointsMax: q.points || 1,
          });
        }
      }
    }
    return writingAnswers;
  }, [isTHCSSession, fullTestData, session]);

  // Stable callback ref for getStudentPartBreakdown
  const getStudentPartBreakdownRef = useRef(getStudentPartBreakdown);
  getStudentPartBreakdownRef.current = getStudentPartBreakdown;
  const getStudentWritingInfoRef = useRef(getStudentWritingInfo);
  getStudentWritingInfoRef.current = getStudentWritingInfo;

  // Use extracted hooks for session controls
  const {
    startTest,
    pauseTest,
    endTest,
    extendTime,
    pauseAllAudio,
    resumeAllAudio,
    skipToSection,
    seekToPosition,
    setPlaybackSpeed,
    setStudentAccommodation,
    clearStudentAccommodation,
    completeBaseTest, // PRD-0019: Complete base test (submit base students only)
    endFullSession, // PRD-0019: End full session (cleanup)
  } = useMonitorControls(sessionCode, session, testData, fullTestData);

  // PRD-0036: Force-submit and reset handlers
  const handleForceSubmit = useCallback(async (studentId: string) => {
    if (!sessionCode) return;
    try {
      const sessionRef = ref(database, `game_sessions/${sessionCode}/players/${studentId}`);
      await update(sessionRef, {
        hasCompletedTest: true,
        forceSubmittedBy: 'teacher',
        completedAt: Date.now(),
      });
    } catch (err) {
      console.error('❌ [PRD-0036] Failed to force submit student:', err);
    }
  }, [sessionCode]);

  const handleResetSubmit = useCallback(async (studentId: string) => {
    if (!sessionCode) return;
    try {
      const sessionRef = ref(database, `game_sessions/${sessionCode}/players/${studentId}`);
      await update(sessionRef, {
        hasCompletedTest: null,
        forceSubmittedBy: null,
        completedAt: null,
      });
    } catch (err) {
      console.error('❌ [PRD-0036] Failed to reset student submission:', err);
    }
  }, [sessionCode]);

  // PRD-0018 Task 6.4: Headphone permission management for offline mode
  const audioMode = (session as any)?.settings?.audioMode;
  const isOfflineMode = audioMode === 'offline';

  const {
    pendingCount,
    approveRequest: handleApproveHeadphones,
    denyRequest: handleDenyHeadphones,
    revokePermission: handleRevokeHeadphones,
    allRequests,
  } = useHeadphonePermission({
    sessionCode,
    role: 'teacher',
    enabled: isOfflineMode && session?.status === 'in-progress',
  });

  // Wrapped handlers that update local state
  const handleSkipToSection = async (sectionNumber: number) => {
    setCurrentAudioSection(sectionNumber);
    if (skipToSection) await skipToSection(sectionNumber);
  };

  const handleSeekToPosition = async (sectionNumber: number, position: number) => {
    // Broadcast seek command to all students
    if (seekToPosition) await seekToPosition(sectionNumber, position);
  };

  const handlePauseAudio = async () => {
    setIsAudioPaused(true);
    if (pauseAllAudio) await pauseAllAudio();
  };

  const handleResumeAudio = async () => {
    setIsAudioPaused(false);
    if (resumeAllAudio) await resumeAllAudio();
  };

  const handleSetPlaybackSpeed = async (speed: number) => {
    setCurrentPlaybackSpeed(speed);
    if (setPlaybackSpeed) await setPlaybackSpeed(speed);
  };

  // ═══════════════════════════════════════════════════════════════
  // PRD-0019: Timer Expiry & Countdown Warning Logic
  // ═══════════════════════════════════════════════════════════════

  // Calculate accommodated students (those with extra time)
  const accommodatedStudents = useMemo(() => {
    if (!session?.players || !testData) return [];

    const now = Date.now();
    const baseEndTime = session.baseTimeExpiredAt || 0;

    return Object.entries(session.players)
      .filter(([_, player]: [string, any]) => {
        const extraTime = player.accommodation?.extraTime || 0;
        const hasCompleted = player.hasCompletedTest || false;
        return extraTime > 0 && !hasCompleted;
      })
      .map(([id, player]: [string, any]) => {
        const extraTime = player.accommodation?.extraTime || 0;
        const extraTimeMs = extraTime * 60 * 1000;

        // Calculate remaining time: baseEndTime + extraTime - now
        const totalEndTime = baseEndTime + extraTimeMs;
        const remaining = Math.max(0, Math.floor((totalEndTime - now) / 1000));

        return {
          id,
          name: player.name || player.playerName || `Student ${id.slice(0, 6)}`,
          extraTime,
          extraTimeRemaining: remaining,
        };
      });
  }, [session?.players, session?.baseTimeExpiredAt, testData]);

  const accommodatedCount = accommodatedStudents.length;

  // Calculate max time remaining among accommodated students
  const maxTimeRemaining = useMemo(() => {
    if (accommodatedStudents.length === 0) return 0;
    return Math.max(...accommodatedStudents.map(s => s.extraTimeRemaining));
  }, [accommodatedStudents]);

  // PRD-0019 Task 5.4 & 5.6: Auto-redirect when all students (including accommodated) complete
  const isEndingRef = useRef(false);

  useEffect(() => {
    if (!isEndingRef.current && session?.baseTimeExpired && accommodatedCount === 0 && session?.status === 'in-progress') {
      console.log('✅ [PRD-0019] All students finished (base + accommodated). Ending session...');
      isEndingRef.current = true;

      notifications.show({
        title: 'All Finished!',
        message: 'All students have completed the test. Redirecting to results...',
        color: 'green',
        autoClose: 2000,
        withCloseButton: false,
      });

      // 2-second delay before redirect
      setTimeout(() => {
        // Redirect to results = true, Skip confirmation = true
        endFullSession(true, true).catch(() => { isEndingRef.current = false; });
      }, 2000);
    }
  }, [session?.baseTimeExpired, accommodatedCount, session?.status, endFullSession]);

  // Timer expiry hook for countdown warning
  const {
    isCountdownWarningActive,
    countdownWarningRemaining,
    triggerCountdownWarning,
    cancelCountdown,
    endNow,
  } = useTimerExpiry({
    warningThreshold: 10,
    onWarningStart: () => {
      console.log('⏰ [PRD-0019] Countdown warning started');
    },
    onWarningCancel: async () => {
      console.log('⏰ [PRD-0019] Countdown cancelled, pausing test');
      await pauseTest();
    },
    onEndNow: async () => {
      console.log('⏰ [PRD-0019] End Now triggered, completing base test');
      if (completeBaseTest) {
        await completeBaseTest();
      }
    },
  });

  // Monitor timer and trigger countdown warning at 10 seconds
  React.useEffect(() => {
    if (!session || !testData) return;

    const { status, startTime, isPaused, pausedAt, totalPausedDuration = 0 } = session;

    if (status !== 'in-progress' || isPaused) return;
    if (!startTime) return;

    // Calculate time remaining
    const testDurationMs = testData.duration * 60 * 1000;
    const now = Date.now();
    const elapsed = now - startTime - totalPausedDuration;
    const remaining = testDurationMs - elapsed;
    const remainingSeconds = Math.floor(remaining / 1000);

    // Trigger countdown warning when 10 seconds remain
    if (remainingSeconds <= 10 && remainingSeconds > 0 && !isCountdownWarningActive) {
      console.log(`⏰ [PRD-0019] Timer at ${remainingSeconds}s, triggering countdown warning`);
      triggerCountdownWarning(remainingSeconds);
    }
  }, [session, testData, isCountdownWarningActive, triggerCountdownWarning]);

  // Handle countdown complete (auto-trigger completeBaseTest)
  const handleCountdownComplete = async () => {
    console.log('⏰ [PRD-0019] Countdown complete, auto-completing base test');
    if (completeBaseTest) {
      await completeBaseTest();
    }
  };

  // Use extracted hook for pagination
  const { currentPage, totalPages, paginatedItems: paginatedStudents, showPagination, handlePageChange } =
    usePagination(students, 30);

  // Calculate session statistics using extracted utility
  const statistics = useMemo(
    () => calculateSessionStatistics(students),
    [students]
  );

  // Auto-redirect if test is cleared (testId becomes null/undefined)
  // Firebase RTDB removes null fields, so testId becomes undefined, not null
  React.useEffect(() => {
    if (session && !session.testId && !loading) {
      console.log('⚠️ [Monitor] Test cleared - auto-redirecting to lobby');
      navigateTo('TEACHER_LOBBY',
        { sessionCode: sessionCode || '' },
        { reason: 'test_cleared_auto_redirect', replace: true }
      );
    }
  }, [session, loading, navigateTo, sessionCode]);

  // Handle back navigation
  const handleBack = () => {
    navigateTo('SESSIONS', {}, { reason: 'back_from_monitor' });
  };

  // Enhanced page change handler with smooth scroll
  const handlePageChangeWithScroll = (page: number) => {
    handlePageChange(page);
    window.scrollTo({ top: 400, behavior: 'smooth' });
  };

  /**
   * Render loading state
   * Show loader if:
   * 1. Initial session load is in progress (loading=true)
   * 2. Session loaded, has testId, but testData not yet loaded (and no error)
   * 3. Session exists but testId was cleared (test ended) - about to auto-redirect to lobby
   */
  // Note: Firebase RTDB removes null fields, so !session.testId catches both null and undefined
  const isTestCleared = session && !session.testId && !loading;
  const isDataLoading = loading || (session?.testId && !testData && !error) || isTestCleared;

  if (isDataLoading) {
    return (
      <Center style={{ height: '100vh', flexDirection: 'column', gap: '1rem' }}>
        <Loader size="xl" />
        {isTestCleared && (
          <div style={{ fontSize: '1rem', color: '#64748b' }}>
            Returning to lobby...
          </div>
        )}
      </Center>
    );
  }

  /**
   * Render error state
   */
  if (error || !session || !testData) {
    return (
      <Center style={{ height: '100vh', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ fontSize: '3rem' }}>⚠️</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1e293b' }}>
          {error || 'Failed to load test session'}
        </div>
        <Button variant="primary" onClick={handleBack}>
          Return to Sessions
        </Button>
      </Center>
    );
  }

  // Destructure statistics for easier access
  const { totalStudents, submittedCount, workingCount, disconnectedCount, averageProgress } = statistics;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, rgba(250, 245, 255, 0.95) 0%, rgba(240, 249, 255, 0.95) 50%, rgba(240, 253, 250, 0.95) 100%)',
      }}
    >
      {/* Control Bar */}
      <TeacherTestControlBar
        sessionCode={sessionCode || ''}
        session={session as any} // Type assertion: session structure is compatible, sessionCode passed separately
        testData={testData}
        accommodatedCount={accommodatedCount} // PRD-0019
        onStartTest={startTest}
        onPauseTest={pauseTest}
        onEndTest={endTest}
        onExtendTime={extendTime}
        onPauseAllAudio={handlePauseAudio}
        onResumeAllAudio={handleResumeAudio}
        onSkipToSection={handleSkipToSection}
        onSetPlaybackSpeed={handleSetPlaybackSpeed}
        currentAudioSection={currentAudioSection}
      />

      {/* PRD-0019: Accommodation Status Bar (shown after base time expires) */}
      {session?.baseTimeExpired && accommodatedCount > 0 && (
        <AccommodationStatusBar
          accommodatedStudents={accommodatedStudents}
          maxTimeRemaining={maxTimeRemaining}
          onViewStudents={() => {
            // TODO: Implement filter/highlight logic
            console.log('View accommodated students clicked');
          }}
        />
      )}

      {/* Audio Progress Panel (Listening Tests Only) */}
      {testData?.skill === 'Listening' && testData?.audioSections && testData.audioSections.length > 0 && session?.status === 'in-progress' && (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '1rem 2rem 0' }}>
          <AudioProgressPanel
            audioSections={testData.audioSections}
            currentSection={currentAudioSection}
            isPlaying={!isAudioPaused && !session?.isPaused}
            isPaused={isAudioPaused || !!session?.isPaused}
            onSkipToSection={handleSkipToSection}
            onSeekToPosition={handleSeekToPosition}
            onPauseAudio={handlePauseAudio}
            onResumeAudio={handleResumeAudio}
            playbackSpeed={currentPlaybackSpeed}
            sessionCode={sessionCode}
            audioMode={audioMode}
            enableUnifiedAudio={true}
          />

          {/* PRD-0018 Task 6.4: Headphone Request Panel (Offline Mode Only) */}
          {isOfflineMode && (
            <div style={{ marginTop: '1rem' }}>
              <HeadphoneRequestPanel
                requests={allRequests}
                onApprove={handleApproveHeadphones}
                onDeny={handleDenyHeadphones}
                onRevoke={handleRevokeHeadphones}
                collapsed={pendingCount === 0}
              />
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div style={{ padding: '2rem' }}>
        {/* Compact Dashboard Info */}
        <div style={{ maxWidth: '1400px', margin: '0 auto', marginBottom: '2rem' }}>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '1rem',
            marginBottom: '1rem'
          }}>
            {/* Test Info Compact */}
            <Card variant="glass">
              <CardBody style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
                    Active Test
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {testData.title}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    {testData.type} • {testData.skill}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1.5rem', borderLeft: '1px solid #e2e8f0', paddingLeft: '1.5rem' }}>
                  <div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', lineHeight: 1 }}>
                      {testData.duration}m
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase' }}>Time</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', lineHeight: 1 }}>
                      {testData?.questionCount}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase' }}>Q's</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b', lineHeight: 1 }}>
                      {totalStudents}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#64748b', textTransform: 'uppercase' }}>Students</div>
                  </div>
                </div>
              </CardBody>
            </Card>

            {/* Live Stats Compact */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
              <Card variant="glass" style={{ background: 'rgba(255, 255, 255, 0.6)' }}>
                <CardBody style={{ padding: '0.75rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10b981' }}>{submittedCount}</div>
                  <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>Done</div>
                </CardBody>
              </Card>
              <Card variant="glass" style={{ background: 'rgba(255, 255, 255, 0.6)' }}>
                <CardBody style={{ padding: '0.75rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#3b82f6' }}>{workingCount}</div>
                  <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>Working</div>
                </CardBody>
              </Card>
              <Card variant="glass" style={{ background: 'rgba(255, 255, 255, 0.6)' }}>
                <CardBody style={{ padding: '0.75rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f59e0b' }}>{disconnectedCount}</div>
                  <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>Offline</div>
                </CardBody>
              </Card>
              <Card variant="glass" style={{ background: 'rgba(255, 255, 255, 0.6)' }}>
                <CardBody style={{ padding: '0.75rem', textAlign: 'center' }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#8b5cf6' }}>{averageProgress}%</div>
                  <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>Avg</div>
                </CardBody>
              </Card>
            </div>
          </div>
        </div>

        {/* Student Grid */}
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          {students.length === 0 ? (
            <Card variant="glass">
              <CardBody>
                <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👥</div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1e293b', marginBottom: '0.5rem' }}>
                    No Students Yet
                  </h3>
                  <p style={{ fontSize: '0.875rem', maxWidth: '400px', margin: '0 auto' }}>
                    Waiting for students to join the test session...
                  </p>
                </div>
              </CardBody>
            </Card>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '1.5rem',
              }}
            >
              {paginatedStudents.map((student) => {
                // PRD-0019: Calculate extra time remaining for this student
                const studentAccommodation = (session as any)?.studentAccommodations?.[student.studentId];
                const hasExtraTime = studentAccommodation?.extraTime && studentAccommodation.extraTime > 0;

                let extraTimeRemaining = 0;
                if (hasExtraTime && session?.baseTimeExpiredAt) {
                  const extraTimeMs = (studentAccommodation.extraTime || 0) * 60 * 1000;
                  const totalEndTime = session.baseTimeExpiredAt + extraTimeMs;
                  extraTimeRemaining = Math.max(0, Math.floor((totalEndTime - Date.now()) / 1000));
                }

                // PRD-0030: Render Writing monitor card
                if (isWritingSession) {
                  // PRD-0036: Read integrity data for writing students
                  const wPlayerData = session?.players?.[student.studentId];
                  const wViolationCount = wPlayerData?.integrity?.violationCount || 0;
                  const wForceSubmitted = wPlayerData?.integrity?.forceSubmitted || false;
                  const wRisk = computeRiskLevel(wViolationCount, wForceSubmitted);
                  return (
                    <WritingMonitorCard
                      key={student.studentId}
                      sessionCode={sessionCode || ''}
                      studentUid={student.studentId}
                      studentName={student.name}
                      testFormat={writingTestFormat}
                      onPeek={(uid) => setPeekStudentUid(uid)}
                      onReopen={handleWritingReopen}
                      integrityData={{ violationCount: wViolationCount, riskLevel: wRisk }}
                    />
                  );
                }

                // PRD-0028: Render THCS card if THCS session
                if (isTHCSSession) {
                  const playerData = session?.players?.[student.studentId];
                  const partBreakdown = getStudentPartBreakdownRef.current(playerData);
                  const writingInfo = getStudentWritingInfoRef.current(playerData);
                  // PRD-0036: Integrity data
                  const tViolationCount = playerData?.integrity?.violationCount || 0;
                  const tForceSubmitted = playerData?.integrity?.forceSubmitted || false;
                  const tRisk = computeRiskLevel(tViolationCount, tForceSubmitted);
                  return (
                    <THCSStudentProgressCard
                      key={student.studentId}
                      studentId={student.studentId}
                      name={student.name}
                      progress={student.progress}
                      answeredCount={student.answeredCount}
                      totalQuestions={testData?.questionCount || 40}
                      status={student.status}
                      partBreakdown={partBreakdown}
                      writingSubmitted={writingInfo.submitted}
                      writingTotal={writingInfo.total}
                      writingGraded={writingInfo.graded}
                      autoScore={student.bandScore ? parseFloat(String(student.bandScore)) : undefined}
                      maxScore={fullTestData?.totalPoints}
                      onClick={() => setSelectedStudentId(student.studentId)}
                      onGradeWriting={student.status === 'submitted' ? () => setGradingStudentId(student.studentId) : undefined}
                      integrityData={{ violationCount: tViolationCount, riskLevel: tRisk }}
                    />
                  );
                }

                // PRD-0036: Integrity data for IELTS/regular cards
                const iPlayerData = session?.players?.[student.studentId];
                const iViolationCount = iPlayerData?.integrity?.violationCount || 0;
                const iForceSubmitted = iPlayerData?.integrity?.forceSubmitted || false;
                const iRisk = computeRiskLevel(iViolationCount, iForceSubmitted);

                return (
                  <StudentProgressCard
                    key={student.studentId}
                    studentId={student.studentId}
                    name={student.name}
                    progress={student.progress}
                    answeredCount={student.answeredCount}
                    totalQuestions={testData?.questionCount || 40}
                    timeElapsed={student.lastActivity - (session?.createdAt || 0)}
                    status={student.status}
                    currentQuestion={student.currentQuestion}
                    recentAnswers={student.recentAnswers}
                    bandScore={student.bandScore}
                    accommodations={studentAccommodation || null}
                    baseTimeExpired={session?.baseTimeExpired || false}
                    extraTimeRemaining={hasExtraTime ? extraTimeRemaining : undefined}
                    integrityData={{ violationCount: iViolationCount, riskLevel: iRisk }}
                    onForceSubmit={() => handleForceSubmit(student.studentId)}
                    onResetSubmit={() => handleResetSubmit(student.studentId)}
                    onClick={() => {
                      setSelectedStudentId(student.studentId);
                    }}
                  />
                );
              })}
            </div>
          )}

          {/* PRD-0036: Refresh Logs button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', marginBottom: '0.5rem' }}>
            <Button
              variant="glass"
              size="sm"
              onClick={async () => {
                if (!sessionCode) return;
                try {
                  await get(ref(database, `game_sessions/${sessionCode}`));
                } catch (err) {
                  console.error('❌ [PRD-0036] Refresh failed:', err);
                }
              }}
            >
              🔄 Refresh
            </Button>
          </div>

          {/* Pagination Controls */}
          {showPagination && (
            <div
              style={{
                marginTop: '2rem',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              {/* Previous Button */}
              <Button
                variant="glass"
                size="sm"
                onClick={() => handlePageChangeWithScroll(currentPage - 1)}
                disabled={currentPage === 1}
              >
                ← Previous
              </Button>

              {/* Page Numbers */}
              <div style={{ display: 'flex', gap: '0.25rem' }}>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <Button
                    key={page}
                    variant={page === currentPage ? 'primary' : 'glass'}
                    size="sm"
                    onClick={() => handlePageChangeWithScroll(page)}
                    style={{
                      width: '2.5rem',
                      height: '2.5rem',
                      padding: '0.5rem',
                    }}
                  >
                    {page}
                  </Button>
                ))}
              </div>

              {/* Next Button */}
              <Button
                variant="glass"
                size="sm"
                onClick={() => handlePageChangeWithScroll(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Next →
              </Button>

              {/* Page Info */}
              <div
                style={{
                  marginLeft: '1rem',
                  fontSize: '0.875rem',
                  color: '#64748b',
                  fontWeight: 500,
                }}
              >
                Page {currentPage} of {totalPages} ({totalStudents} students)
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Student Detail Modal - uses real-time data from students array */}
      {selectedStudentId && (() => {
        // Find current student data from students array (real-time)
        const currentStudent = students.find(s => s.studentId === selectedStudentId);
        if (!currentStudent) return null;

        // Transform answers for modal display
        const transformedAnswers = transformAnswersForModal(currentStudent.rawAnswers);

        return (
          <StudentDetailModal
            opened={true}
            onClose={() => setSelectedStudentId(null)}
            studentName={currentStudent.name}
            studentId={currentStudent.studentId}
            answers={transformedAnswers}
            totalQuestions={testData?.questionCount || 40}
            status={currentStudent.status}
            timeElapsed={currentStudent.lastActivity - (session?.createdAt || 0)}
            sessionCode={sessionCode}
            testQuestions={fullTestData?.questions}
            testSkill={testData?.skill || fullTestData?.skill}
            onSetAccommodation={setStudentAccommodation}
            onClearAccommodation={clearStudentAccommodation}
            currentAccommodation={(session as any)?.studentAccommodations?.[currentStudent.studentId] || null}
            examMode={(session as any)?.settings?.examMode || false}
            thcsSections={isTHCSSession ? thcsSections as any : undefined}
            thcsResults={isTHCSSession ? (session as any)?.results?.[currentStudent.studentId]?.questionResults : undefined}
          />
        );
      })()}

      {/* PRD-0019: Countdown Warning Modal */}
      {isCountdownWarningActive && (
        <CountdownWarningModal
          countdownSeconds={countdownWarningRemaining}
          accommodatedCount={accommodatedCount}
          onCancel={cancelCountdown}
          onEndNow={endNow}
          onCountdownComplete={handleCountdownComplete}
        />
      )}

      {/* PRD-0028: Inline Writing Grader Overlay */}
      {gradingStudentId && isTHCSSession && (() => {
        const gradingPlayer = session?.players?.[gradingStudentId];
        const writingAnswers = getWritingAnswersForStudent(gradingStudentId);
        if (!gradingPlayer || writingAnswers.length === 0) return null;
        return (
          <InlineWritingGrader
            sessionCode={sessionCode || ''}
            testName={testData?.title || 'Test'}
            studentId={gradingStudentId}
            studentName={gradingPlayer.name || gradingPlayer.playerName || 'Student'}
            writingAnswers={writingAnswers}
            onClose={() => setGradingStudentId(null)}
            onGradeComplete={() => setGradingStudentId(null)}
          />
        );
      })()}

      {/* PRD-0030: Writing Peek Modal */}
      {peekStudentUid && isWritingSession && (
        <WritingPeekModal
          isOpen={true}
          onClose={() => setPeekStudentUid(null)}
          sessionCode={sessionCode || ''}
          studentUid={peekStudentUid}
          studentName={students.find(s => s.studentId === peekStudentUid)?.name || 'Student'}
          testFormat={writingTestFormat}
        />
      )}
    </div>
  );
};

export default TeacherTestMonitorPage;
