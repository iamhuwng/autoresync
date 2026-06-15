/**
 * Test Page Router
 * Routes students to skill-specific test pages based on test type
 *
 * Architecture:
 * - Reads test data from Firebase to determine skill
 * - Routes to ReadingTestPage for Reading tests
 * - Routes to generic StudentTestPage for other skills (until implemented)
 * - Provides loading state and error handling
 *
 * Created: Phase 2 Step 2.8 (Nov 24, 2025)
 */

import React, { useEffect, useState, lazy, Suspense, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { ref, get, onValue } from 'firebase/database';
import { database } from '../services/firebase';
import { useNavigation } from '../hooks/useNavigation';
import { useFeatureTracking } from '../hooks/useFeatureTracking';
import { FEATURE_IDS } from '../config/featureRegistry';
import {
  READING_V2_ENGINE_FIELDS,
  isReadingV2Payload,
} from '../config/readingV2FeatureFlags';
import ReadingTestPage from '../skills/reading/components/ReadingTestPage';
import ListeningTestPage from '../skills/listening/components/ListeningTestPage';
import StudentTestPage from './StudentTestPage';
import {
  ReadingV2RuntimeShell,
  type ReadingV2AnswerValue,
  type ReadingV2RuntimeLifecycle,
  type ReadingV2RuntimeSubmitPayload,
  type ReadingV2RuntimeTimer,
} from '../components/reading-v2/runtime/ReadingV2RuntimeShell';
import type { ReadingV2DerivedProjection } from '../services/reading-v2/readingV2Projection.service';
import {
  buildReadingV2LaunchReadPlan,
  isReadingV2LaunchCandidate,
  resolveReadingV2LaunchDecision,
} from '../services/reading-v2/readingV2LaunchIntegration.service';
import {
  isReadingV2RuntimeSubmissionConfigured,
  submitReadingV2RuntimeAttempt,
} from '../services/reading-v2/readingV2RuntimeSubmission.service';
import { sessionService } from '../services/sessionService';
import { useAntiCopyPaste } from '../hooks/test/useAntiCopyPaste';
import { useFullscreenMode } from '../hooks/test/useFullscreenMode';
import { useIntegrityRefreshRequest } from '../hooks/test/useIntegrityRefreshRequest';
import { useTestIntegrity } from '../hooks/test/useTestIntegrity';
import type { AntiCheatConfig } from '../types/integrity.types';

// PRD-0027: Lazy-load THCS-THPT student layout
const THCSTestLayout = lazy(() => import('../components/thcs-student/THCSTestLayout'));
// PRD-0030: Lazy-load IELTS Writing student page
const WritingTestPage = lazy(() => import('../components/writing-student/WritingTestPage'));

interface TestPageRouterProps {
  // No props needed - reads from URL params
}

type CanonicalIeltsSkill = 'Reading' | 'Listening' | 'Writing' | 'Speaking';

interface ReadingV2LiveSessionState {
  readonly status: 'waiting' | 'in-progress' | 'paused' | 'completed' | 'expired';
  readonly startTime: number | null;
  readonly pausedDurationMs: number;
  readonly durationMinutes: number | null;
  readonly forceSubmitToken: string | number | null;
  readonly integrityRefreshRequestedAt: number | null;
}

const READING_V2_RUNTIME_GUARD_MESSAGE =
  'Reading V2 payloads require a published session-safe projection before launch.';

const fullPageStatusStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const loadingSpinnerStyle: React.CSSProperties = {
  display: 'inline-block',
  width: 48,
  height: 48,
  borderRadius: '50%',
  border: '4px solid rgba(79, 70, 229, 0.16)',
  borderTopColor: '#4f46e5',
  animation: 'testPageRouterSpin 0.9s linear infinite',
};

function TestPageRouterSpinner() {
  return (
    <>
      <span aria-label="Loading" style={loadingSpinnerStyle} />
      <style>{'@keyframes testPageRouterSpin { to { transform: rotate(360deg); } }'}</style>
    </>
  );
}

function FullPageState({ children }: { children: React.ReactNode }) {
  return <div style={fullPageStatusStyle}>{children}</div>;
}

const normalizeIeltsSkill = (rawSkill: unknown): CanonicalIeltsSkill | null => {
  if (typeof rawSkill !== 'string') {
    return null;
  }

  switch (rawSkill.trim().toLowerCase()) {
    case 'reading':
      return 'Reading';
    case 'listening':
      return 'Listening';
    case 'writing':
      return 'Writing';
    case 'speaking':
      return 'Speaking';
    default:
      return null;
  }
};

const inferIeltsSkillFromTestId = (testId: string): CanonicalIeltsSkill | null => {
  const normalizedTestId = testId.trim().toLowerCase();

  if (normalizedTestId.includes('listening')) {
    return 'Listening';
  }

  if (normalizedTestId.includes('writing')) {
    return 'Writing';
  }

  if (normalizedTestId.includes('reading')) {
    return 'Reading';
  }

  if (normalizedTestId.includes('speaking')) {
    return 'Speaking';
  }

  return null;
};

const TestPageRouter: React.FC<TestPageRouterProps> = () => {
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const { navigateTo } = useNavigation('student');
  const { trackAction } = useFeatureTracking(FEATURE_IDS.testTaking);
  const [skill, setSkill] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [thcsTestData, setThcsTestData] = useState<any>(null); // PRD-0027: THCS test data for layout
  const [writingTestData, setWritingTestData] = useState<any>(null); // PRD-0030: Writing test data
  const [readingV2Projection, setReadingV2Projection] = useState<ReadingV2DerivedProjection | null>(null);
  const [readingV2DurationMinutes, setReadingV2DurationMinutes] = useState<number | null>(null);
  const [readingV2Answers, setReadingV2Answers] = useState<Readonly<Record<string, ReadingV2AnswerValue>>>({});
  const [readingV2LiveSession, setReadingV2LiveSession] = useState<ReadingV2LiveSessionState>({
    status: 'waiting',
    startTime: null,
    pausedDurationMs: 0,
    durationMinutes: null,
    forceSubmitToken: null,
    integrityRefreshRequestedAt: null,
  });
  const [readingV2AntiCheatConfig, setReadingV2AntiCheatConfig] = useState<AntiCheatConfig | null>(null);
  const [readingV2IntegrityAutoSubmitToken, setReadingV2IntegrityAutoSubmitToken] = useState<string | null>(null);
  const readingV2CompletionRedirectRef = useRef<string | null>(null);
  const readingV2RuntimeContainerRef = useRef<HTMLDivElement>(null);

  const {
    addEvent: addReadingV2IntegrityEvent,
    shouldAutoSubmit: shouldAutoSubmitReadingV2,
    flushEvents: flushReadingV2IntegrityEvents,
    getIntegrityReport: getReadingV2IntegrityReport,
  } = useTestIntegrity({
    config: readingV2AntiCheatConfig,
    context: 'session',
    surface: 'reading_v2_live_session',
    sessionCode: sessionCode || '',
    studentId: sessionService.getPlayerId() || '',
    testId: readingV2Projection?.materialId || '',
  });

  useAntiCopyPaste({
    enabled: readingV2AntiCheatConfig?.detectCopyPaste || false,
    containerRef: readingV2RuntimeContainerRef as React.RefObject<HTMLElement>,
    onEvent: addReadingV2IntegrityEvent,
    detectRightClick: readingV2AntiCheatConfig?.detectRightClick || false,
    detectKeyboardShortcuts: readingV2AntiCheatConfig?.detectKeyboardShortcuts || false,
  });

  useFullscreenMode({
    enabled: readingV2AntiCheatConfig?.requireFullscreen || false,
    onFullscreenExit: addReadingV2IntegrityEvent,
  });

  useIntegrityRefreshRequest({
    enabled: skill === 'ReadingV2' && readingV2LiveSession.status === 'in-progress',
    requestTimestamp: readingV2LiveSession.integrityRefreshRequestedAt,
    onRefreshRequested: () => flushReadingV2IntegrityEvents('teacher_refresh'),
  });

  useEffect(() => {
    if (!shouldAutoSubmitReadingV2) {
      return;
    }

    setReadingV2IntegrityAutoSubmitToken((previous) =>
      previous ?? `integrity-auto-submit:${Date.now()}`
    );
  }, [shouldAutoSubmitReadingV2]);

  useEffect(() => {
    const detectSkill = async () => {
      if (!sessionCode) {
        setError('No session code provided');
        setLoading(false);
        return;
      }

      try {
        setReadingV2Projection(null);
        setReadingV2DurationMinutes(null);
        setReadingV2Answers({});
        setReadingV2AntiCheatConfig(null);
        setReadingV2IntegrityAutoSubmitToken(null);
        const t0 = performance.now();

        // PERF FIX: Only read testId from session, NOT the entire session node
        // (which includes all students' answers, progress — potentially huge)
        const testIdRef = ref(database, `game_sessions/${sessionCode}/testId`);
        const testIdSnapshot = await get(testIdRef);
        const t1 = performance.now();
        console.log(`⏱ [TestPageRouter] Session testId fetch: ${Math.round(t1 - t0)}ms`);

        if (!testIdSnapshot.exists()) {
          // Check if session itself exists
          const sessionExistsRef = ref(database, `game_sessions/${sessionCode}/createdAt`);
          const sessionExistsSnap = await get(sessionExistsRef);
          if (!sessionExistsSnap.exists()) {
            setError('Session not found');
          } else {
            // Session exists but no test selected yet
            setSkill('generic');
          }
          setLoading(false);
          return;
        }

        const testId = testIdSnapshot.val();
        const sessionReadingV2Snapshot = await get(ref(database, `game_sessions/${sessionCode}/readingV2`));
        const sessionReadingV2Metadata = sessionReadingV2Snapshot.exists()
          ? sessionReadingV2Snapshot.val()
          : null;

        let readingV2Metadata = isReadingV2LaunchCandidate(sessionReadingV2Metadata)
          ? sessionReadingV2Metadata
          : null;

        if (!readingV2Metadata) {
          const metadataReadPlan = buildReadingV2LaunchReadPlan({
            surface: 'live-session',
            materialId: testId,
            sessionCode,
          });
          const metadataSnap = await get(ref(database, metadataReadPlan.metadataPath));
          readingV2Metadata = metadataSnap.exists() ? metadataSnap.val() : null;
        }

        if (isReadingV2LaunchCandidate(readingV2Metadata)) {
          const snapshotVersionId =
            typeof readingV2Metadata?.publishedSnapshotVersionId === 'string'
              ? readingV2Metadata.publishedSnapshotVersionId
              : undefined;
          const projectionReadPlan = buildReadingV2LaunchReadPlan({
            surface: 'live-session',
            materialId: testId,
            snapshotVersionId,
            sessionCode,
          });
          const projectionSnap = await get(ref(database, projectionReadPlan.projectionPath));
          let readingV2Projection = projectionSnap.exists() ? projectionSnap.val() : undefined;

          if (!readingV2Projection && snapshotVersionId) {
            const publishTemplateReadPlan = buildReadingV2LaunchReadPlan({
              surface: 'live-session',
              materialId: testId,
              snapshotVersionId,
              sessionCode: 'publish-template',
            });
            const publishTemplateProjectionSnap = await get(ref(database, publishTemplateReadPlan.projectionPath));
            readingV2Projection = publishTemplateProjectionSnap.exists()
              ? publishTemplateProjectionSnap.val()
              : undefined;
          }

          const launchDecision = resolveReadingV2LaunchDecision({
            surface: 'live-session',
            metadata: readingV2Metadata,
            projection: readingV2Projection,
          });

          if (launchDecision.status !== 'runtime') {
            trackAction('readingV2LaunchBlocked', {
              surface: 'live-session',
              reason: launchDecision.status === 'blocked'
                ? launchDecision.reason
                : launchDecision.reason,
              sessionCode,
              materialId: testId,
              outcome: 'blocked',
            });
            setError(launchDecision.status === 'blocked'
              ? launchDecision.message
              : READING_V2_RUNTIME_GUARD_MESSAGE);
            setLoading(false);
            return;
          }

          trackAction('launchReadingV2Runtime', {
            surface: 'live-session',
            sessionCode,
            materialId: testId,
            projectionKind: launchDecision.projection.projectionKind,
            sourceSnapshotVersionId: launchDecision.projection.sourceSnapshotVersionId,
            outcome: 'success',
          });
          setReadingV2Projection(launchDecision.projection);
          setReadingV2DurationMinutes(
            typeof readingV2Metadata.durationMinutes === 'number'
              ? readingV2Metadata.durationMinutes
              : null,
          );
          setSkill('ReadingV2');
          setLoading(false);
          return;
        }

        // PERF FIX: First read only testType to decide routing quickly
        const testTypeRef = ref(database, `tests/${testId}/testType`);
        const testTypeSnapshot = await get(testTypeRef);
        const t2 = performance.now();
        console.log(`⏱ [TestPageRouter] Test type fetch: ${Math.round(t2 - t1)}ms`);

        const testType = testTypeSnapshot.val();
        const markerEntries = await Promise.all(
          READING_V2_ENGINE_FIELDS.map(async (field) => {
            const markerSnapshot = await get(ref(database, `tests/${testId}/${field}`));
            return [
              field,
              markerSnapshot.exists() ? markerSnapshot.val() : undefined,
            ] as const;
          }),
        );

        if (isReadingV2Payload(Object.fromEntries(markerEntries))) {
          setError(READING_V2_RUNTIME_GUARD_MESSAGE);
          setLoading(false);
          return;
        }

        const loadNonThcsSkill = async (fallbackSkill: string | null = null) => {
          const skillRef = ref(database, `tests/${testId}/skill`);
          const skillSnapshot = await get(skillRef);
          const rawSkill = skillSnapshot.exists() ? skillSnapshot.val() : fallbackSkill;
          const testSkill = normalizeIeltsSkill(rawSkill)
            ?? inferIeltsSkillFromTestId(testId)
            ?? normalizeIeltsSkill(fallbackSkill);

          if (!normalizeIeltsSkill(rawSkill) && testSkill) {
            console.warn('[TestPageRouter] Inferred IELTS skill from test id fallback', {
              rawSkill,
              inferredSkill: testSkill,
              testId,
            });
          }

          console.log(`📍 Test Page Router: Detected skill = ${testSkill || 'generic'}`);

          if (testSkill === 'Writing') {
            const testRef = ref(database, `tests/${testId}`);
            const testSnapshot = await get(testRef);
            if (!testSnapshot.exists()) {
              setError('Test data not found');
              setLoading(false);
              return;
            }
            setWritingTestData(testSnapshot.val());
          }

          setSkill(testSkill || 'generic');
          setLoading(false);
        };

        // PRD-0027: THCS-THPT tests use testType discriminator, not skill
        if (testType === 'THCS-THPT') {
          console.log('📍 Test Page Router: Detected THCS-THPT test');
          // Fetch full test data for THCS layout
          const testRef = ref(database, `tests/${testId}`);
          const testSnapshot = await get(testRef);
          const t3 = performance.now();
          console.log(`⏱ [TestPageRouter] Full THCS test fetch: ${Math.round(t3 - t2)}ms (total: ${Math.round(t3 - t0)}ms)`);

          if (!testSnapshot.exists()) {
            setError('Test data not found');
            setLoading(false);
            return;
          }

          const testData = testSnapshot.val();
          // PERF FIX: Strip _changelog and stats — student doesn't need version
          // history or aggregated stats. _changelog can be very large with full deltas.
          delete testData._changelog;
          delete testData.stats;

          setThcsTestData(testData);
          setSkill('THCS-THPT');
          setLoading(false);
          return;
        }

        if (!testTypeSnapshot.exists()) {
          await loadNonThcsSkill('Reading');
          return;
        }

        await loadNonThcsSkill(null);
      } catch (err) {
        console.error('Error detecting test skill:', err);
        setError('Failed to load test information');
        setLoading(false);
      }
    };

    detectSkill();
  }, [sessionCode, trackAction]);

  useEffect(() => {
    if (!sessionCode || skill !== 'ReadingV2') {
      return;
    }

    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
    const unsubscribe = onValue(sessionRef, (snapshot) => {
      const data = snapshot.exists() ? snapshot.val() : {};
      const rawStatus = data.status === 'completed'
        ? 'completed'
        : data.status === 'expired'
          ? 'expired'
        : data.status === 'in-progress'
          ? 'in-progress'
          : 'waiting';
      const status = data.isPaused && rawStatus === 'in-progress' ? 'paused' : rawStatus;
      const pausedDurationMs = data.pausedAt && !data.resumedAt
        ? (data.pausedDuration || 0) + (Date.now() - data.pausedAt)
        : data.pausedDuration || 0;
      const playerId = sessionService.getPlayerId();
      const playerData = playerId ? data.players?.[playerId] : undefined;
      const rawDuration = data.duration
        ?? data.testDuration
        ?? data.settings?.duration
        ?? data.settings?.durationMinutes
        ?? readingV2DurationMinutes;
      const durationMinutes = typeof rawDuration === 'number' && Number.isFinite(rawDuration)
        ? rawDuration
        : null;
      const teacherForceToken = playerData?.forceSubmitRequestedAt
        ?? playerData?.forceSubmittedAt
        ?? (playerData?.forceSubmittedBy === 'teacher' && playerData?.hasCompletedTest === true
          ? 'teacher-force-submit'
          : null);
      const antiCheatConfig = data.antiCheatConfig && typeof data.antiCheatConfig === 'object'
        ? data.antiCheatConfig as AntiCheatConfig
        : null;
      const integrityRefreshRequestedAt = typeof data.integrityRefreshRequestedAt === 'number'
        ? data.integrityRefreshRequestedAt
        : null;
      const studentReadingV2State = playerId ? data.students?.[playerId]?.readingV2 : undefined;
      const completedResultId = typeof studentReadingV2State?.resultId === 'string'
        ? studentReadingV2State.resultId
        : typeof playerData?.latestResultId === 'string'
          ? playerData.latestResultId
          : undefined;
      const studentHasCompletedReadingV2 =
        playerData?.hasCompletedTest === true ||
        playerData?.hasSubmitted === true ||
        playerData?.isSubmitted === true ||
        studentReadingV2State?.submitted === true;

      if (studentHasCompletedReadingV2) {
        const redirectKey = `${sessionCode ?? 'unknown-session'}:${completedResultId ?? 'submitted'}`;
        if (readingV2CompletionRedirectRef.current !== redirectKey) {
          readingV2CompletionRedirectRef.current = redirectKey;
          trackAction('readingV2LiveCompletionRedirect', {
            surface: 'live-session',
            sessionCode,
            resultId: completedResultId,
            reason: 'student-completed',
          });
          navigateTo('STUDENT_WAITING', { gameSessionId: sessionCode }, {
            reason: 'reading_v2_student_completed',
            replace: true,
            state: {
              showResults: Boolean(completedResultId),
              sessionCode,
              testId: data.testId,
              resultId: completedResultId,
            },
          });
        }
        return;
      }

      if (data.status === 'waiting') {
        const redirectKey = `${sessionCode ?? 'unknown-session'}:waiting`;
        if (readingV2CompletionRedirectRef.current !== redirectKey) {
          readingV2CompletionRedirectRef.current = redirectKey;
          trackAction('readingV2LiveCompletionRedirect', {
            surface: 'live-session',
            sessionCode,
            reason: 'session-waiting',
          });
          navigateTo('STUDENT_WAITING', { gameSessionId: sessionCode }, {
            reason: 'reading_v2_session_waiting',
            replace: true,
            state: {
              sessionCode,
              testId: data.testId,
            },
          });
        }
        return;
      }

      if (data.status === 'completed' || data.status === 'expired') {
        const redirectKey = `${sessionCode ?? 'unknown-session'}:${data.status}`;
        if (readingV2CompletionRedirectRef.current !== redirectKey) {
          readingV2CompletionRedirectRef.current = redirectKey;
          trackAction('readingV2LiveCompletionRedirect', {
            surface: 'live-session',
            sessionCode,
            reason: 'session-ended',
            status: data.status,
          });
          navigateTo('STUDENT_DASHBOARD', {}, {
            reason: 'reading_v2_session_ended',
            replace: true,
          });
        }
        return;
      }

      setReadingV2LiveSession({
        status,
        startTime: typeof data.startTime === 'number' ? data.startTime : null,
        pausedDurationMs,
        durationMinutes,
        forceSubmitToken: teacherForceToken,
        integrityRefreshRequestedAt,
      });
      setReadingV2AntiCheatConfig(antiCheatConfig);
    });

    return () => unsubscribe();
  }, [navigateTo, readingV2DurationMinutes, sessionCode, skill, trackAction]);

  const handleReadingV2Submit = useCallback(async (payload: ReadingV2RuntimeSubmitPayload) => {
    const trackingPayload = {
      surface: 'live-session',
      sessionCode,
      materialId: payload.materialId ?? readingV2Projection?.materialId ?? 'unknown-material',
      projectionId: payload.projectionId,
      sourceSnapshotVersionId: payload.sourceSnapshotVersionId,
    };

    trackAction('submitReadingV2Attempt', {
      ...trackingPayload,
      outcome: 'requested',
    });

    try {
      await flushReadingV2IntegrityEvents('reading_v2_live_submit');
      const result = await submitReadingV2RuntimeAttempt({
        payload: {
          ...payload,
          integrityReport: readingV2AntiCheatConfig ? getReadingV2IntegrityReport() : null,
        },
        context: {
          surface: 'live-session',
          sessionCode,
          sourceName: readingV2Projection?.content.title,
        },
      });

      trackAction('submitReadingV2Attempt', {
        ...trackingPayload,
        resultId: result.resultId,
        attemptId: result.attemptId,
        outcome: 'success',
      });
    } catch (submitError) {
      trackAction('submitReadingV2Attempt', {
        ...trackingPayload,
        reason: submitError instanceof Error ? submitError.name : 'unknown',
        outcome: 'failure',
      });
      throw submitError;
    }
  }, [
    flushReadingV2IntegrityEvents,
    getReadingV2IntegrityReport,
    readingV2AntiCheatConfig,
    readingV2Projection?.content.title,
    readingV2Projection?.materialId,
    sessionCode,
    trackAction,
  ]);
  const readingV2SubmitHandler = isReadingV2RuntimeSubmissionConfigured()
    ? handleReadingV2Submit
    : undefined;

  // Loading state
  if (loading) {
    return (
      <FullPageState>
        <div style={{ textAlign: 'center' }}>
          <TestPageRouterSpinner />
          <div style={{ marginTop: '1rem', color: '#64748b', fontSize: '1rem' }}>
            Loading test...
          </div>
        </div>
      </FullPageState>
    );
  }

  // Error state
  if (error) {
    return (
      <FullPageState>
        <div style={{
          textAlign: 'center',
          padding: '2rem',
          maxWidth: '400px'
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1e293b', marginBottom: '0.5rem' }}>
            Error Loading Test
          </div>
          <div style={{ color: '#64748b' }}>
            {error}
          </div>
        </div>
      </FullPageState>
    );
  }

  // Route based on skill
  switch (skill) {
    case 'ReadingV2':
      if (readingV2Projection) {
        const liveLifecycle: ReadingV2RuntimeLifecycle = {
          status: readingV2LiveSession.status === 'expired'
            ? 'completed'
            : readingV2LiveSession.status,
          forceSubmitToken: readingV2IntegrityAutoSubmitToken ?? readingV2LiveSession.forceSubmitToken,
        };
        const liveTimer: ReadingV2RuntimeTimer = {
          durationMinutes: readingV2LiveSession.durationMinutes ?? readingV2DurationMinutes,
          startedAt: readingV2LiveSession.startTime,
          pausedDurationMs: readingV2LiveSession.pausedDurationMs,
          running: readingV2LiveSession.status === 'in-progress',
          autoSubmitOnExpiry: true,
        };

        return (
          <div ref={readingV2RuntimeContainerRef}>
            <ReadingV2RuntimeShell
              projection={readingV2Projection}
              onSubmit={readingV2SubmitHandler}
              initialAnswers={readingV2Answers}
              onAnswersChange={setReadingV2Answers}
              persistenceKey={`reading-v2:live:${sessionCode ?? 'unknown-session'}:${readingV2Projection.projectionId}`}
              lifecycle={liveLifecycle}
              timer={liveTimer}
            />
          </div>
        );
      }
      return <StudentTestPage />;

    case 'Reading':
      return <ReadingTestPage />;

    case 'Listening':
      return <ListeningTestPage />;

    // PRD-0027: THCS-THPT routing
    case 'THCS-THPT':
      return (
        <Suspense fallback={<FullPageState><TestPageRouterSpinner /></FullPageState>}>
          <THCSTestLayout testData={thcsTestData} sessionCode={sessionCode!} />
        </Suspense>
      );

    case 'Writing':
      if (writingTestData) {
        return (
          <Suspense fallback={
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', border: '4px solid rgba(59,130,246,0.15)', borderTopColor: '#3b82f6', animation: 'spin 1s linear infinite' }} />
              <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
            </div>
          }>
            <WritingTestPage testData={writingTestData} sessionCode={sessionCode!} />
          </Suspense>
        );
      }
      // No writing test data loaded yet — fallback
      return <StudentTestPage />;

    case 'Speaking':
      // Speaking is not yet implemented — use generic
      console.log(`⚠️ Speaking skill not yet implemented, using generic test page`);
      return <StudentTestPage />;

    case 'generic':
    default:
      // Fallback to generic test page
      return <StudentTestPage />;
  }
};

export default TestPageRouter;
