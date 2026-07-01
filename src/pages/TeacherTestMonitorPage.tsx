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
import type { ReviewReleaseState } from '../types/releaseState.types';
import { getEffectiveReleaseState } from '../types/releaseState.types';
import { Card, CardBody, toast, VanillaLoader } from '../components/modern';
import { Button } from '../components/modern';
import { IntegrityDetailPanel } from '../components/test/IntegrityDetailPanel';
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
import {
  requestIntegrityLogRefresh,
  requestTeacherForceSubmit,
  resetStudentSessionSubmission,
} from '../services/sessionStudentControlService';
import { reportingService } from '../services/reportingService';
import { ref, get, set } from 'firebase/database';
// @ts-ignore — JS service file
import { database } from '../services/firebase';
import type { WritingTestFormat, IELTSWritingTest } from '../types/ielts-writing.types';
import type { IntegrityViewData } from '../utils/integrityUtils';
import { getIntegritySummary, normalizeHomeworkIntegrity, normalizeIntegrityReport } from '../utils/integrityUtils'; // PRD-0036
import type { LiveAudioAuthoritySnapshot } from '../features/assessment/listening/live-session/authority/liveAudioAuthorityTransaction';
import {
  readListeningLiveVersionId,
  refreshListeningLiveAudioDelivery,
  resolveListeningLiveAudioSection,
  type ListeningLiveAudioResolution,
} from '../features/assessment/listening/live-session/delivery/listeningLiveDeliveryAdapter';
import { createListeningLiveDeliveryIssuer } from '../features/assessment/listening/live-session/delivery/listeningLiveDeliveryClient';
import type { ListeningDeliveryIssuedUrl } from '../features/assessment/listening/storage/listeningAssetDelivery.service';
import type { AuthorizedDeliveryConfig } from '../skills/listening/components/AudioPlayer';

const RISK_LABELS: Record<'low' | 'medium' | 'high', string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const RISK_COLORS: Record<'low' | 'medium' | 'high', { bg: string; border: string; text: string }> = {
  low: { bg: '#ecfdf5', border: '#a7f3d0', text: '#047857' },
  medium: { bg: '#fffbeb', border: '#fcd34d', text: '#b45309' },
  high: { bg: '#fef2f2', border: '#fca5a5', text: '#b91c1c' },
};

const RISK_ORDER: Record<'low' | 'medium' | 'high', number> = {
  high: 0,
  medium: 1,
  low: 2,
};

// Types imported from hooks (StudentProgress used internally by useMonitorSession)

export const TeacherTestMonitorPage: React.FC = () => {
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const { navigateTo } = useNavigation('teacher');

  // State for student detail modal - only store the ID, get current data from students array
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedIntegrity, setSelectedIntegrity] = useState<{
    report: IntegrityViewData;
    studentName: string;
  } | null>(null);

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
  const [isRefreshingLogs, setIsRefreshingLogs] = useState(false);
  const writingEndSubmitRef = useRef(false);
  const hasInitializedIntegrityAlertsRef = useRef(false);
  const previousIntegrityCountsRef = useRef<Record<string, number>>({});

  // Use extracted hooks for session monitoring
  const { session, students, testData, fullTestData, loading, error } = useMonitorSession(sessionCode);
  const canonicalMasterAudioState = (session as any)?.masterAudioState as
    | { revision?: number; section?: number; isPlaying?: boolean; position?: number; speed?: number }
    | undefined;
  const monitorDeliveryIssuer = useMemo(() => createListeningLiveDeliveryIssuer(), []);
  const monitorDeliveryRef = useRef<Record<number, ListeningDeliveryIssuedUrl>>({});
  const [monitorAudioResolutions, setMonitorAudioResolutions] = useState<
    Record<number, ListeningLiveAudioResolution>
  >({});
  const [monitorDeliveryError, setMonitorDeliveryError] = useState<string | null>(null);
  const monitorTestId = typeof session?.testId === 'string' ? session.testId : undefined;
  const monitorVersionId = useMemo(
    () => readListeningLiveVersionId(fullTestData),
    [fullTestData],
  );
  const monitorClassId = typeof session?.classId === 'string' ? session.classId : undefined;
  const monitorTeacherId = (typeof session?.createdByUserId === 'string' ? session.createdByUserId : undefined)
    ?? (typeof session?.createdBy === 'string' ? session.createdBy : undefined)
    ?? (typeof session?.teacherId === 'string' ? session.teacherId : undefined);

  useEffect(() => {
    const sourceSections = testData?.skill === 'Listening' ? testData.audioSections ?? [] : [];
    if (
      !sessionCode
      || !monitorTestId
      || !monitorTeacherId
      || sourceSections.length === 0
    ) {
      setMonitorAudioResolutions({});
      setMonitorDeliveryError(null);
      monitorDeliveryRef.current = {};
      return;
    }

    let cancelled = false;
    Promise.all(sourceSections.map(async (section) => {
      const resolution = await resolveListeningLiveAudioSection({
        sessionCode,
        testId: monitorTestId,
        materialVersionId: monitorVersionId,
        studentId: monitorTeacherId,
        classId: monitorClassId,
        now: Date.now(),
        section,
        deliveryIssuer: monitorDeliveryIssuer,
      });
      return [section.number, resolution] as const;
    }))
      .then((entries) => {
        if (cancelled) return;
        const resolutions = Object.fromEntries(entries);
        setMonitorAudioResolutions(resolutions);
        monitorDeliveryRef.current = Object.fromEntries(
          entries
            .filter((entry): entry is readonly [number, Extract<ListeningLiveAudioResolution, {
              kind: 'authorized-asset-delivery';
            }>] => entry[1].kind === 'authorized-asset-delivery')
            .map(([sectionNumber, resolution]) => [sectionNumber, resolution.delivery]),
        );
        setMonitorDeliveryError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setMonitorAudioResolutions({});
        monitorDeliveryRef.current = {};
        setMonitorDeliveryError('listening_live_delivery_failed');
      });

    return () => {
      cancelled = true;
    };
  }, [
    monitorClassId,
    monitorDeliveryIssuer,
    monitorTeacherId,
    monitorTestId,
    monitorVersionId,
    sessionCode,
    testData?.audioSections,
    testData?.skill,
  ]);

  const monitorAudioSections = useMemo(() => (
    (testData?.audioSections ?? []).map((section) => {
      const resolution = monitorAudioResolutions[section.number];
      if (!resolution) {
        return section.assetId
          ? { ...section, audioUrl: '', streamUrl: undefined }
          : section;
      }
      return {
        ...section,
        audioUrl: resolution.audioUrl,
        streamUrl: resolution.kind === 'legacy-public-r2' ? resolution.streamUrl : undefined,
      };
    })
  ), [monitorAudioResolutions, testData?.audioSections]);

  const monitorAuthorizedDelivery = useMemo<AuthorizedDeliveryConfig | undefined>(() => {
    const resolution = monitorAudioResolutions[currentAudioSection];
    if (!resolution || resolution.kind !== 'authorized-asset-delivery') return undefined;

    return {
      expiresAt: resolution.delivery.expiresAt,
      refreshAfter: resolution.delivery.refreshAfter,
      refreshSource: async () => {
        const previous = monitorDeliveryRef.current[currentAudioSection] ?? resolution.delivery;
        const refreshed = await refreshListeningLiveAudioDelivery({
          previous,
          sessionCode: sessionCode!,
          testId: monitorTestId!,
          materialVersionId: monitorVersionId!,
          studentId: monitorTeacherId!,
          classId: monitorClassId,
          sectionNumber: currentAudioSection,
          now: Date.now(),
          deliveryIssuer: monitorDeliveryIssuer,
        });
        monitorDeliveryRef.current[currentAudioSection] = refreshed;
        return {
          url: refreshed.url,
          expiresAt: refreshed.expiresAt,
          refreshAfter: refreshed.refreshAfter,
        };
      },
    };
  }, [
    currentAudioSection,
    monitorAudioResolutions,
    monitorClassId,
    monitorDeliveryIssuer,
    monitorTeacherId,
    monitorTestId,
    monitorVersionId,
    sessionCode,
  ]);

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

  useEffect(() => {
    if (testData?.skill !== 'Listening' || session?.status !== 'in-progress') {
      return;
    }

    const section = Number(canonicalMasterAudioState?.section);
    const speed = Number(canonicalMasterAudioState?.speed);

    if (
      !Number.isInteger(section)
      || section <= 0
      || !Number.isFinite(speed)
      || typeof canonicalMasterAudioState?.isPlaying !== 'boolean'
    ) {
      return;
    }

    setCurrentAudioSection(section);
    setIsAudioPaused(!canonicalMasterAudioState.isPlaying);
    setCurrentPlaybackSpeed(speed);
  }, [
    canonicalMasterAudioState?.isPlaying,
    canonicalMasterAudioState?.revision,
    canonicalMasterAudioState?.section,
    canonicalMasterAudioState?.speed,
    session?.status,
    testData?.skill,
  ]);

  // PRD-0030: Writing test format for monitor cards
  const writingTestFormat: WritingTestFormat = useMemo(() => {
    if (!isWritingSession || !fullTestData) return 'full-test';
    return (fullTestData as any).metadata?.format || 'full-test';
  }, [isWritingSession, fullTestData]);

  const getIntegrityViewData = useCallback((studentId: string): IntegrityViewData | null => {
    const rawIntegrity = session?.players?.[studentId]?.integrity;
    return normalizeIntegrityReport(rawIntegrity) ?? normalizeHomeworkIntegrity(rawIntegrity);
  }, [session?.players]);

  const integrityAlerts = useMemo(() => {
    return students
      .map((student) => {
        const report = getIntegrityViewData(student.studentId);
        if (!report || report.violationCount <= 0) {
          return null;
        }

        return {
          studentId: student.studentId,
          studentName: student.name,
          report,
        };
      })
      .filter((alert): alert is { studentId: string; studentName: string; report: IntegrityViewData } => Boolean(alert))
      .sort((left, right) => {
        const riskDelta = RISK_ORDER[left.report.riskLevel] - RISK_ORDER[right.report.riskLevel];
        if (riskDelta !== 0) {
          return riskDelta;
        }

        return right.report.violationCount - left.report.violationCount;
      });
  }, [getIntegrityViewData, students]);

  const integrityStats = useMemo(() => {
    return integrityAlerts.reduce(
      (summary, alert) => {
        summary.flaggedStudents += 1;
        summary.totalViolations += alert.report.violationCount;
        summary[alert.report.riskLevel] += 1;
        return summary;
      },
      {
        flaggedStudents: 0,
        totalViolations: 0,
        low: 0,
        medium: 0,
        high: 0,
      },
    );
  }, [integrityAlerts]);

  const monitoringPresetLabel = useMemo(() => {
    const preset = session?.antiCheatConfig?.preset;
    if (!preset || typeof preset !== 'string') {
      return 'Custom';
    }

    return `${preset.charAt(0).toUpperCase()}${preset.slice(1)}`;
  }, [session?.antiCheatConfig?.preset]);

  const openIntegrityDetails = useCallback((studentId: string, studentName: string) => {
    const report = getIntegrityViewData(studentId);
    if (!report) {
      return;
    }

    reportingService.trackAction('liveSessions', 'viewIntegrityDetails', {
      sessionCode,
      studentId,
      studentName,
      violationCount: report.violationCount,
      riskLevel: report.riskLevel,
    });

    setSelectedIntegrity({ report, studentName });
  }, [getIntegrityViewData, sessionCode]);

  useEffect(() => {
    const nextCounts = Object.fromEntries(
      students.map((student) => [
        student.studentId,
        getIntegrityViewData(student.studentId)?.violationCount || 0,
      ]),
    );

    if (!hasInitializedIntegrityAlertsRef.current) {
      previousIntegrityCountsRef.current = nextCounts;
      hasInitializedIntegrityAlertsRef.current = true;
      return;
    }

    students.forEach((student) => {
      const report = getIntegrityViewData(student.studentId);
      if (!report || report.violationCount <= 0) {
        return;
      }

      const previousCount = previousIntegrityCountsRef.current[student.studentId] || 0;
      if (report.violationCount <= previousCount) {
        return;
      }

      toast.show({
        title: report.riskLevel === 'high' ? 'High-Risk Integrity Alert' : 'Integrity Alert',
        message: `${student.name}: ${getIntegritySummary(report)}. Counted violations: ${report.violationCount}.`,
        tone: report.riskLevel === 'high' ? 'error' : 'warning',
        duration: 5000,
      });
    });

    previousIntegrityCountsRef.current = nextCounts;
  }, [getIntegrityViewData, students]);

  // PRD-0030: Handle Reopen — teacher reopens a submitted student's writing test
  const handleWritingReopen = useCallback(async (studentUid: string) => {
    if (!sessionCode) return;
    try {
      await set(
        ref(database, `game_sessions/${sessionCode}/students/${studentUid}/writing/reopened`),
        true
      );
      toast.show({
        title: 'Reopened',
        message: 'Student can continue writing.',
        tone: 'info',
        duration: 3000,
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
      toast.show({
        title: 'Auto-submitted',
        message: `${unsubmittedUids.length} student(s) auto-submitted.`,
        tone: 'success',
        duration: 3000,
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
    setReviewReleaseState, // PRD-0040 Phase 2: Release state control
  } = useMonitorControls(sessionCode, session, testData, fullTestData);

  // PRD-0036: Force-submit and reset handlers
  const handleForceSubmit = useCallback(async (studentId: string) => {
    if (!sessionCode) return;
    try {
      await requestTeacherForceSubmit(sessionCode, studentId);
      reportingService.trackAction('liveSessions', 'forceSubmitStudent', {
        sessionCode,
        studentId,
      });
      toast.show({
        title: 'Force submit requested',
        message: 'The student client is submitting this test now.',
        tone: 'warning',
        duration: 3000,
      });
    } catch (err) {
      console.error('❌ [PRD-0036] Failed to force submit student:', err);
    }
  }, [sessionCode]);

  const handleResetSubmit = useCallback(async (
    studentId: string,
    latestResultId?: string | null,
  ) => {
    if (!sessionCode) return;
    try {
      const { deletedResultCount } = await resetStudentSessionSubmission(
        sessionCode,
        studentId,
        latestResultId,
      );
      reportingService.trackAction('liveSessions', 'resetStudentSubmission', {
        sessionCode,
        studentId,
        deletedResultCount,
      });
      toast.show({
        title: 'Submission reset',
        message: 'The student can re-enter the active test and continue working.',
        tone: 'info',
        duration: 3000,
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
  const handleSkipToSection = async (sectionNumber: number, snapshot?: LiveAudioAuthoritySnapshot) => {
    try {
      if (skipToSection) await skipToSection(sectionNumber, snapshot);
      setCurrentAudioSection(sectionNumber);
      reportingService.trackAction('liveSessions', 'listeningLive.skipSection', {
        sessionCode,
        sectionNumber,
      });
    } catch (error) {
      console.error('[Monitor] Failed to skip listening audio section:', error);
    }
  };

  const handleSeekToPosition = async (
    sectionNumber: number,
    position: number,
    snapshot?: LiveAudioAuthoritySnapshot,
  ) => {
    try {
      if (seekToPosition) await seekToPosition(sectionNumber, position, snapshot);
      reportingService.trackAction('liveSessions', 'listeningLive.seekAudio', {
        sessionCode,
        sectionNumber,
        position,
      });
    } catch (error) {
      console.error('[Monitor] Failed to seek listening audio:', error);
    }
  };

  const handlePauseAudio = async (snapshot?: LiveAudioAuthoritySnapshot) => {
    try {
      if (pauseAllAudio) await pauseAllAudio(snapshot);
      setIsAudioPaused(true);
      reportingService.trackAction('liveSessions', 'listeningLive.pauseAudio', {
        sessionCode,
      });
    } catch (error) {
      console.error('[Monitor] Failed to pause listening audio:', error);
    }
  };

  const handleResumeAudio = async (snapshot?: LiveAudioAuthoritySnapshot) => {
    try {
      if (resumeAllAudio) await resumeAllAudio(snapshot);
      setIsAudioPaused(false);
      reportingService.trackAction('liveSessions', 'listeningLive.resumeAudio', {
        sessionCode,
      });
    } catch (error) {
      console.error('[Monitor] Failed to resume listening audio:', error);
    }
  };

  const handleSetPlaybackSpeed = async (speed: number, snapshot?: LiveAudioAuthoritySnapshot) => {
    try {
      if (setPlaybackSpeed) await setPlaybackSpeed(speed, snapshot);
      setCurrentPlaybackSpeed(speed);
      reportingService.trackAction('liveSessions', 'listeningLive.changeSpeed', {
        sessionCode,
        speed,
      });
    } catch (error) {
      console.error('[Monitor] Failed to change listening audio speed:', error);
    }
  };

  const handleRefreshLogs = useCallback(async () => {
    if (!sessionCode) return;

    setIsRefreshingLogs(true);
    try {
      await requestIntegrityLogRefresh(sessionCode);
      reportingService.trackAction('liveSessions', 'refreshIntegrityLogs', {
        sessionCode,
      });
      toast.show({
        title: 'Integrity refresh requested',
        message: 'Active student clients are flushing their latest integrity logs now.',
        tone: 'info',
        duration: 3000,
      });
    } catch (err) {
      console.error('❌ [PRD-0036] Failed to refresh integrity logs:', err);
    } finally {
      setIsRefreshingLogs(false);
    }
  }, [sessionCode]);

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

      toast.show({
        title: 'All Finished!',
        message: 'All students have completed the test. Redirecting to results...',
        tone: 'success',
        duration: 2000,
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

    const { status, startTime, isPaused, totalPausedDuration = 0 } = session;

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
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }} role="status" aria-live="polite">
        <VanillaLoader size="xl" />
        {isTestCleared && (
          <div style={{ fontSize: '1rem', color: '#64748b' }}>
            Returning to lobby...
          </div>
        )}
      </div>
    );
  }

  /**
   * Render error state
   */
  if (error || !session || !testData) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', padding: '1rem', textAlign: 'center' }} role="alert">
        <div style={{ fontSize: '3rem' }}>⚠️</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1e293b' }}>
          {error || 'Failed to load test session'}
        </div>
        <Button variant="primary" onClick={handleBack}>
          Return to Sessions
        </Button>
      </div>
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
        currentPlaybackSpeed={currentPlaybackSpeed}
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
            audioSections={monitorAudioSections}
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
            authorizedDelivery={monitorAuthorizedDelivery}
            masterRevision={canonicalMasterAudioState?.revision ?? null}
            canonicalPosition={canonicalMasterAudioState?.position ?? null}
            authorizedDeliveryError={monitorDeliveryError}
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
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              marginBottom: '1rem',
            }}
          >
            <Button
              variant="glass"
              size="sm"
              onClick={handleRefreshLogs}
              disabled={isRefreshingLogs || session?.status !== 'in-progress'}
            >
              {isRefreshingLogs ? 'Refreshing Logs...' : 'Refresh Logs'}
            </Button>
          </div>

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

        {/* PRD-0040 Phase 2: Review Release Controls */}
        {/* Show when test has submitted students (session active or ended) */}
        {submittedCount > 0 && (() => {
          const currentReleaseState = getEffectiveReleaseState(
            (session as any)?.reviewReleaseState
          );
          const releaseStates: { key: ReviewReleaseState; label: string; icon: string; desc: string }[] = [
            { key: 'locked-review', label: 'Locked', icon: '🔒', desc: 'Score only' },
            { key: 'review-released', label: 'Review', icon: '📋', desc: '+ Correct answers' },
            { key: 'feedback-released', label: 'Full', icon: '💬', desc: '+ AI & Teacher feedback' },
          ];

          return (
            <div style={{ maxWidth: '1400px', margin: '0 auto', marginBottom: '1.5rem' }}>
              <Card variant="glass">
                <CardBody style={{ padding: '1rem 1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>
                        Student Review Access
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.15rem' }}>
                        Controls what students see in their results
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {releaseStates.map((rs) => {
                        const isActive = currentReleaseState === rs.key;
                        return (
                          <button
                            key={rs.key}
                            onClick={async () => {
                              if (isActive) return;
                              try {
                                await setReviewReleaseState(rs.key);
                                toast.show({
                                  title: `Review Access: ${rs.label}`,
                                  message: rs.desc,
                                  tone: rs.key === 'locked-review' ? 'warning' : rs.key === 'review-released' ? 'info' : 'success',
                                  duration: 3000,
                                });
                              } catch {
                                toast.show({
                                  title: 'Failed',
                                  message: 'Could not update review access. Try again.',
                                  tone: 'error',
                                  duration: 3000,
                                });
                              }
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              padding: '0.5rem 1rem',
                              borderRadius: '8px',
                              border: isActive ? '2px solid' : '1px solid rgba(148, 163, 184, 0.3)',
                              borderColor: isActive
                                ? rs.key === 'locked-review' ? '#f59e0b' : rs.key === 'review-released' ? '#3b82f6' : '#10b981'
                                : undefined,
                              background: isActive
                                ? rs.key === 'locked-review' ? 'rgba(245, 158, 11, 0.1)' : rs.key === 'review-released' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(16, 185, 129, 0.1)'
                                : 'rgba(255, 255, 255, 0.5)',
                              cursor: isActive ? 'default' : 'pointer',
                              fontFamily: 'inherit',
                              fontSize: '0.8rem',
                              fontWeight: isActive ? 700 : 500,
                              color: isActive ? '#1e293b' : '#64748b',
                              transition: 'all 0.2s ease',
                              opacity: isActive ? 1 : 0.8,
                            }}
                            onMouseEnter={(e) => { if (!isActive) (e.currentTarget.style.opacity = '1'); }}
                            onMouseLeave={(e) => { if (!isActive) (e.currentTarget.style.opacity = '0.8'); }}
                          >
                            <span>{rs.icon}</span>
                            <span>{rs.label}</span>
                            {isActive && <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </CardBody>
              </Card>
            </div>
          );
        })()}

        {session?.antiCheatConfig && (
          <div style={{ maxWidth: '1400px', margin: '0 auto 1.5rem' }}>
            <Card variant="glass">
              <CardBody style={{ padding: '1.25rem 1.5rem', display: 'grid', gap: '1rem' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '1rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'grid', gap: '0.35rem' }}>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: '#64748b',
                        textTransform: 'uppercase',
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                      }}
                    >
                      Session Integrity
                    </div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a' }}>
                      Monitoring active: {monitoringPresetLabel} preset
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#475569', maxWidth: '720px' }}>
                      Live sessions record integrity violations for teacher review. Use the alerts below or click a card badge to inspect a student.
                    </div>
                  </div>

                  <Button
                    variant="glass"
                    size="sm"
                    onClick={handleRefreshLogs}
                    disabled={isRefreshingLogs}
                  >
                    {isRefreshingLogs ? 'Refreshing…' : 'Refresh Logs'}
                  </Button>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div
                    style={{
                      padding: '0.65rem 0.85rem',
                      borderRadius: '0.85rem',
                      background: 'rgba(59,130,246,0.08)',
                      border: '1px solid rgba(59,130,246,0.18)',
                      minWidth: '140px',
                    }}
                  >
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#1d4ed8' }}>
                      {integrityStats.flaggedStudents}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                      Flagged Students
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '0.65rem 0.85rem',
                      borderRadius: '0.85rem',
                      background: 'rgba(239,68,68,0.08)',
                      border: '1px solid rgba(239,68,68,0.18)',
                      minWidth: '140px',
                    }}
                  >
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#dc2626' }}>
                      {integrityStats.high}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                      High Risk
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '0.65rem 0.85rem',
                      borderRadius: '0.85rem',
                      background: 'rgba(245,158,11,0.08)',
                      border: '1px solid rgba(245,158,11,0.18)',
                      minWidth: '140px',
                    }}
                  >
                    <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#d97706' }}>
                      {integrityStats.totalViolations}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                      Counted Violations
                    </div>
                  </div>
                </div>

                {integrityAlerts.length === 0 ? (
                  <div
                    style={{
                      padding: '0.9rem 1rem',
                      borderRadius: '1rem',
                      background: 'rgba(16,185,129,0.08)',
                      border: '1px solid rgba(16,185,129,0.18)',
                      color: '#047857',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                    }}
                  >
                    No integrity violations recorded yet for active students.
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    {integrityAlerts.map((alert) => {
                      const colors = RISK_COLORS[alert.report.riskLevel];
                      return (
                        <button
                          key={alert.studentId}
                          type="button"
                          onClick={() => openIntegrityDetails(alert.studentId, alert.studentName)}
                          style={{
                            border: `1px solid ${colors.border}`,
                            background: colors.bg,
                            color: colors.text,
                            borderRadius: '1rem',
                            padding: '0.85rem 1rem',
                            minWidth: '240px',
                            textAlign: 'left',
                            cursor: 'pointer',
                            display: 'grid',
                            gap: '0.2rem',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
                            <span style={{ fontWeight: 800, color: '#0f172a' }}>{alert.studentName}</span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: colors.text }}>
                              {RISK_LABELS[alert.report.riskLevel]}
                            </span>
                          </div>
                          <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                            {getIntegritySummary(alert.report)}
                          </div>
                          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: colors.text }}>
                            Counted violations: {alert.report.violationCount}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </CardBody>
            </Card>
          </div>
        )}

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
                  const wIntegrity = getIntegrityViewData(student.studentId);
                  return (
                    <WritingMonitorCard
                      key={student.studentId}
                      sessionCode={sessionCode || ''}
                      studentUid={student.studentId}
                      studentName={student.name}
                      status={student.status}
                      testFormat={writingTestFormat}
                      onPeek={(uid) => setPeekStudentUid(uid)}
                      onReopen={handleWritingReopen}
                      integrityData={
                        wIntegrity
                          ? {
                              violationCount: wIntegrity.violationCount,
                              riskLevel: wIntegrity.riskLevel,
                            }
                          : undefined
                      }
                      onIntegrityClick={
                        wIntegrity
                          ? () => openIntegrityDetails(student.studentId, student.name)
                          : undefined
                      }
                    />
                  );
                }

                // PRD-0028: Render THCS card if THCS session
                if (isTHCSSession) {
                  const playerData = session?.players?.[student.studentId];
                  const partBreakdown = getStudentPartBreakdownRef.current(playerData);
                  const writingInfo = getStudentWritingInfoRef.current(playerData);
                  const tIntegrity = getIntegrityViewData(student.studentId);
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
                      onForceSubmit={() => handleForceSubmit(student.studentId)}
                      onResetSubmit={() => handleResetSubmit(
                        student.studentId,
                        playerData?.latestResultId ?? null,
                      )}
                      integrityData={
                        tIntegrity
                          ? {
                              violationCount: tIntegrity.violationCount,
                              riskLevel: tIntegrity.riskLevel,
                            }
                          : undefined
                      }
                      onIntegrityClick={
                        tIntegrity
                          ? () => openIntegrityDetails(student.studentId, student.name)
                          : undefined
                      }
                    />
                  );
                }

                const iPlayerData = session?.players?.[student.studentId];
                const iIntegrity = getIntegrityViewData(student.studentId);

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
                    integrityData={
                      iIntegrity
                        ? {
                            violationCount: iIntegrity.violationCount,
                            riskLevel: iIntegrity.riskLevel,
                          }
                        : undefined
                    }
                    onIntegrityClick={
                      iIntegrity
                        ? () => openIntegrityDetails(student.studentId, student.name)
                        : undefined
                    }
                    onForceSubmit={() => handleForceSubmit(student.studentId)}
                    onResetSubmit={() => handleResetSubmit(
                      student.studentId,
                      iPlayerData?.latestResultId ?? null,
                    )}
                    onClick={() => {
                      setSelectedStudentId(student.studentId);
                    }}
                  />
                );
              })}
            </div>
          )}


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

      {selectedIntegrity && (
        <IntegrityDetailPanel
          report={selectedIntegrity.report}
          studentName={selectedIntegrity.studentName}
          isOpen={true}
          onClose={() => setSelectedIntegrity(null)}
        />
      )}
    </div>
  );
};

export default TeacherTestMonitorPage;
