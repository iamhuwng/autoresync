/**
 * Student Test Results Page
 * Displays test results with detailed feedback for students
 * 
 * Features:
 * - Overall score and percentage
 * - IELTS band score
 * - Performance feedback
 * - Question-by-question review
 * - Correct/incorrect highlighting
 * - Answer comparison
 */

import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { ref, get, onValue } from 'firebase/database';
// @ts-ignore
import { database } from '../services/firebase';
import { Card, CardBody } from '../components/modern';
import { Button } from '../components/modern';
import {
  markTest,
  calculateBandScore,
  generatePerformanceFeedback,
  TestMarkingResult,
  Question,
  StudentAnswer,
} from '../services/autoMarking.service';
import { generateCertificatePDF, isPDFGenerationAvailable } from '../utils/pdfCertificate';
import { TestResultRecord, getStudentSessionResult, getTestResult } from '../services/testResults.service';
import { WritingSpeakingPlaceholder } from '../components/test/WritingSpeakingPlaceholder';
import { sessionService } from '../services/sessionService';
import { getCourseAverage } from '../services/resultsService';
import { FeedbackDisplay } from '../components/feedback/FeedbackDisplay';
import { getSubmissionsBySession } from '../services/writingSubmissionService';
import type { WritingSubmission } from '../types/ielts-writing.types';
import { deriveSessionReleaseState, getReleaseVisibility } from '../types/releaseState.types';
import { FEATURE_IDS } from '../config/featureRegistry';
import { useFeatureTracking } from '../hooks/useFeatureTracking';
import { useNavigation } from '../hooks/useNavigation';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { StudentLayout } from '../components/layout/StudentLayout';
import { StudentSidebar } from '../components/layout/StudentSidebar';
import { mobileStyles, studentTokens } from '../components/layout/studentLayoutStyles';


// PRD-0030 Task 6.1.1: Lazy-load WritingResultView for Writing tests
const WritingResultView = lazy(() => import('../components/writing-results/WritingResultView'));

interface TestSession {
  sessionCode: string;
  testId: string;
  quizId?: string;
  status: string;
  createdAt: number;
  players: Record<string, any>;
  courseId?: string;
  courseName?: string;
  reviewReleaseState?: string;
}

interface TestData {
  title: string;
  type: string;
  skill: string;
  questions: Question[];
  duration: number;
}

const centerStateStyle: React.CSSProperties = {
  minHeight: '60vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const spinnerStyle: React.CSSProperties = {
  width: '2.5rem',
  height: '2.5rem',
  borderRadius: '50%',
  border: `3px solid ${studentTokens.borderWhisper}`,
  borderTopColor: studentTokens.accent,
  display: 'inline-block',
  animation: 'studentResultsSpin 0.8s linear infinite',
};

export const StudentTestResultsPage: React.FC = () => {
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const location = useLocation();
  const { navigateTo } = useNavigation('student');
  const { trackAction } = useFeatureTracking(FEATURE_IDS.results);
  const sidebar = <StudentSidebar activePage="records" />;
  const isMobile = useMediaQuery('(max-width: 768px)');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<TestSession | null>(null);
  const [testData, setTestData] = useState<TestData | null>(null);
  const [results, setResults] = useState<TestMarkingResult | null>(null);
  const [permanentResultRecord, setPermanentResultRecord] = useState<TestResultRecord | null>(null);
  const [courseAverage, setCourseAverage] = useState<number | null>(null);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<number>>(new Set());
  const [pdfAvailable, setPdfAvailable] = useState(false);
  // PRD-0030 Task 6.1.1: Writing submission for WritingResultView
  const [writingSubmission, setWritingSubmission] = useState<WritingSubmission | null>(null);

  const applyPermanentResult = async (
    permanentResult: TestResultRecord,
    studentId: string,
    activeSessionCode: string
  ) => {
    console.log('[Results] Found permanent result record');
    setPermanentResultRecord(permanentResult);

    setTestData({
      title: permanentResult.testTitle || 'Test',
      type: permanentResult.testType || 'reading',
      skill: permanentResult.testSkill || 'Reading',
      questions: permanentResult.questionResults.map(qr => ({
        number: qr.questionNumber,
        type: qr.questionType,
        answer: qr.correctAnswer,
      })) as any,
      duration: permanentResult.testDuration || 0,
    });

    if ((permanentResult.testSkill || '').toLowerCase() === 'writing') {
      console.log('[Results] Writing test detected â€” fetching writing submission');
      try {
        const subResult = await getSubmissionsBySession(activeSessionCode);
        if (subResult.success && subResult.data) {
          const mySubmission = subResult.data.find(
            s => s.studentId === studentId
          );
          if (mySubmission) {
            setWritingSubmission(mySubmission);
            setLoading(false);
            return;
          }
        }
        console.warn('[Results] Writing submission not found in Firestore, falling back to standard results');
      } catch (writingErr) {
        console.warn('[Results] Failed to fetch writing submission:', writingErr);
      }
    }

    const adaptedResult: TestMarkingResult = {
      totalScore: permanentResult.totalScore,
      maxScore: permanentResult.maxScore,
      percentage: permanentResult.percentage,
      questionResults: permanentResult.questionResults.map(qr => ({
        questionId: String(qr.questionNumber),
        questionNumber: qr.questionNumber,
        questionType: qr.questionType as any,
        studentAnswer: qr.studentAnswer,
        correctAnswer: qr.correctAnswer,
        isCorrect: qr.isCorrect,
        score: qr.score,
        maxScore: qr.maxScore,
        feedback: qr.feedback,
        partialCredit: false
      })),
      summary: {
        correct: permanentResult.correct,
        incorrect: permanentResult.incorrect,
        partialCredit: permanentResult.partialCredit,
        totalQuestions: permanentResult.totalQuestions
      },
      completedAt: permanentResult.submittedAt,
      correct: permanentResult.correct,
      incorrect: permanentResult.incorrect,
      partialCredit: permanentResult.partialCredit,
      totalQuestions: permanentResult.totalQuestions
    } as TestMarkingResult;

    setResults(adaptedResult);
    setLoading(false);
  };

  /**
   * Keep the live session snapshot fresh so release-state changes update
   * while the page stays open.
   */
  useEffect(() => {
    if (!sessionCode) {
      return;
    }

    const sessionRef = ref(database, `game_sessions/${sessionCode}`);
    const unsubscribe = onValue(
      sessionRef,
      (snapshot) => {
        setSession(snapshot.exists() ? snapshot.val() : null);
      },
      (listenerError) => {
        console.warn('[Results] Live session listener failed:', listenerError);
      },
    );

    return () => unsubscribe();
  }, [sessionCode]);

  /**
   * Load session and calculate results
   */
  useEffect(() => {
    if (!sessionCode) {
      setError('No session code provided');
      setLoading(false);
      return;
    }

    let cancelled = false;

    const startLoad = async () => {
      const isLegacyStudentResultLink = location.pathname.startsWith('/student/results/');

      if (isLegacyStudentResultLink) {
        try {
          const directResult = await getTestResult(sessionCode);
          if (!cancelled && directResult) {
            navigateTo('RESULT_DETAIL', { resultId: sessionCode }, { replace: true, reason: 'legacy_student_result_redirect' });
            return;
          }
        } catch (legacyLookupError) {
          console.warn('[Results] Legacy result link lookup failed, falling back to session loading:', legacyLookupError);
        }
      }

      if (!cancelled) {
        loadResults();
        isPDFGenerationAvailable().then((available) => {
          if (!cancelled) {
            setPdfAvailable(available);
          }
        });
      }
    };

    startLoad();

    return () => {
      cancelled = true;
    };
  }, [sessionCode, location.pathname, navigateTo]);

  const loadResults = async (retryCount = 0) => {
    try {
      console.log(`[Results] Loading results for session: ${sessionCode} (attempt ${retryCount + 1})`);

      // Load session
      const sessionRef = ref(database, `game_sessions/${sessionCode}`);
      const sessionSnap = await get(sessionRef);

      if (!sessionSnap.exists()) {
        setError('Session not found');
        setLoading(false);
        return;
      }

      const sessionData = sessionSnap.val();
      setSession(sessionData);

      // Fetch course average if available
      if (sessionData.courseId) {
        getCourseAverage(sessionData.courseId, sessionData.testId || sessionData.quizId).then(setCourseAverage);
      }

      // Identify Student ID FIRST (needed for permanent result lookup)
      let studentId: string | undefined = sessionService.getPlayerId() || undefined;

      if (!sessionData.players) {
        setError('No players found in session');
        setLoading(false);
        return;
      }

      const playerIds = Object.keys(sessionData.players);
      if (playerIds.length === 0) {
        setError('No players found in session');
        setLoading(false);
        return;
      }

      if (!studentId || !sessionData.players[studentId]) {
        studentId = playerIds[0];
      }

      if (!studentId) {
        setError('Invalid student ID');
        setLoading(false);
        return;
      }

      console.log(`[Results] Looking up permanent result for student: ${studentId}`);

      // ---------------------------------------------------------
      // ATTEMPT 1: Fetch Permanent Result (Enhanced System)
      // PRIMARY path - works even when teacher has already cleared
      // testId from the session (teacher-end scenario)
      // ---------------------------------------------------------
      try {
        const permanentResult = await getStudentSessionResult(studentId, sessionCode!);

        if (permanentResult) {
          await applyPermanentResult(permanentResult, studentId, sessionCode!);
          return;

          console.log('[Results] Found permanent result record');
          setPermanentResultRecord(permanentResult);

          // Set testData from permanent result metadata
          // so UI has test info even when testId is cleared from session
          setTestData({
            title: permanentResult.testTitle || 'Test',
            type: permanentResult.testType || 'reading',
            skill: permanentResult.testSkill || 'Reading',
            questions: permanentResult.questionResults.map(qr => ({
              number: qr.questionNumber,
              type: qr.questionType,
              answer: qr.correctAnswer,
            })) as any,
            duration: permanentResult.testDuration || 0,
          });

          // PRD-0030 Task 6.1.1: Writing skill → fetch WritingSubmission from Firestore
          if ((permanentResult.testSkill || '').toLowerCase() === 'writing') {
            console.log('[Results] Writing test detected — fetching writing submission');
            try {
              const subResult = await getSubmissionsBySession(sessionCode!);
              if (subResult.success && subResult.data) {
                // Find this student's submission
                const mySubmission = subResult.data.find(
                  s => s.studentId === studentId
                );
                if (mySubmission) {
                  setWritingSubmission(mySubmission);
                  setLoading(false);
                  return;
                }
              }
              console.warn('[Results] Writing submission not found in Firestore, falling back to standard results');
            } catch (writingErr) {
              console.warn('[Results] Failed to fetch writing submission:', writingErr);
            }
          }

          // Adapt TestResultRecord to TestMarkingResult for UI
          const adaptedResult: TestMarkingResult = {
            totalScore: permanentResult.totalScore,
            maxScore: permanentResult.maxScore,
            percentage: permanentResult.percentage,
            questionResults: permanentResult.questionResults.map(qr => ({
              questionId: String(qr.questionNumber),
              questionNumber: qr.questionNumber,
              questionType: qr.questionType as any,
              studentAnswer: qr.studentAnswer,
              correctAnswer: qr.correctAnswer,
              isCorrect: qr.isCorrect,
              score: qr.score,
              maxScore: qr.maxScore,
              feedback: qr.feedback,
              partialCredit: false
            })),
            summary: {
              correct: permanentResult.correct,
              incorrect: permanentResult.incorrect,
              partialCredit: permanentResult.partialCredit,
              totalQuestions: permanentResult.totalQuestions
            },
            completedAt: permanentResult.submittedAt,
            correct: permanentResult.correct,
            incorrect: permanentResult.incorrect,
            partialCredit: permanentResult.partialCredit,
            totalQuestions: permanentResult.totalQuestions
          } as TestMarkingResult;

          setResults(adaptedResult);
          setLoading(false);
          return;
        } else {
          console.log('[Results] No permanent result found yet');

          const latestResultId = sessionData.players?.[studentId]?.latestResultId;
          if (latestResultId) {
            console.log(`[Results] Falling back to player latestResultId pointer: ${latestResultId}`);
            const directResult = await getTestResult(latestResultId);

            if (
              directResult
              && directResult.studentId === studentId
              && directResult.sessionCode === sessionCode
            ) {
              await applyPermanentResult(directResult, studentId, sessionCode!);
              return;
            }
          }
        }
      } catch (permErr) {
        console.warn('[Results] Error fetching permanent result:', permErr);
      }

      // ---------------------------------------------------------
      // ATTEMPT 2: Load test data from Firebase and calculate
      // Requires testId to still exist in the session
      // ---------------------------------------------------------
      const testId = sessionData.testId;
      if (!testId) {
        // testId was cleared by teacher ending the test
        // The permanent result may not be written yet (race condition)
        // Retry up to 5 times with increasing delay
        const MAX_RETRIES = 5;
        if (retryCount < MAX_RETRIES) {
          const delay = (retryCount + 1) * 1500; // 1.5s, 3s, 4.5s, 6s, 7.5s
          console.log(`[Results] testId cleared, no permanent result yet. Retrying in ${delay}ms (attempt ${retryCount + 2}/${MAX_RETRIES + 1})...`);
          setTimeout(() => loadResults(retryCount + 1), delay);
          return;
        }

        console.warn('[Results] testId cleared and no permanent result found after all retries');
        setError('Test results are still being processed. Please try refreshing the page.');
        setLoading(false);
        return;
      }

      const testRef = ref(database, `tests/${testId}`);
      const testSnap = await get(testRef);

      if (!testSnap.exists()) {
        setError('Test not found');
        setLoading(false);
        return;
      }

      const test = testSnap.val();
      setTestData(test);


      // ---------------------------------------------------------
      // ATTEMPT 2: Fallback to Calculation (Legacy/Migration)
      // ---------------------------------------------------------
      console.log('⚠️ No permanent result found, recalculating from raw answers...');
      const studentData = sessionData.players[studentId];

      if (!studentData || !studentData.answers || Object.keys(studentData.answers).length === 0) {
        // ATTEMPT 3: Use pre-calculated scores from session player data
        // This handles the case where submission succeeded but permanent save failed
        if (studentData && studentData.submittedAt && studentData.percentage !== undefined) {
          console.log('📊 Using pre-calculated scores from session player data');
          const totalQ = studentData.totalQuestions || test.questions.length;
          const correct = studentData.correctCount || 0;
          const pct = studentData.percentage || 0;
          const fallbackResult: TestMarkingResult = {
            totalScore: correct,
            maxScore: totalQ,
            percentage: pct,
            questionResults: test.questions.map((q: any, idx: number) => ({
              questionId: String(q.id || q.number || idx + 1),
              questionNumber: q.number || idx + 1,
              questionType: q.type || 'unknown',
              studentAnswer: '',
              correctAnswer: q.answer || '',
              isCorrect: false,
              score: 0,
              maxScore: 1,
              feedback: 'Answer details not available',
              partialCredit: false,
            })),
            summary: {
              correct,
              incorrect: totalQ - correct,
              partialCredit: 0,
              totalQuestions: totalQ,
            },
            completedAt: studentData.submittedAt,
            correct,
            incorrect: totalQ - correct,
            partialCredit: 0,
            totalQuestions: totalQ,
          } as TestMarkingResult;

          setResults(fallbackResult);
          setLoading(false);
          return;
        }

        setError('No answers found. Your test may still be processing. Please try refreshing the page.');
        setLoading(false);
        return;
      }

      // Convert answers to format expected by marking service
      const studentAnswers: Record<number, StudentAnswer> = {};
      Object.entries(studentData.answers).forEach(([qNum, answer]: [string, any]) => {
        studentAnswers[parseInt(qNum)] = {
          questionId: `q${qNum}`,
          questionNumber: parseInt(qNum),
          answer: answer.answer !== undefined ? answer.answer : answer,
          timeSpent: answer.timeSpent,
          timestamp: answer.timestamp,
        };
      });

      // Mark the test
      const markingResult = markTest(test.questions, studentAnswers);
      setResults(markingResult);

      setLoading(false);
    } catch (err) {
      console.error('Error loading results:', err);
      setError('Failed to load results');
      setLoading(false);
    }
  };

  /**
   * Toggle question expansion
   */
  const toggleQuestion = (questionNumber: number) => {
    const newExpanded = new Set(expandedQuestions);
    const willExpand = !newExpanded.has(questionNumber);
    if (newExpanded.has(questionNumber)) {
      newExpanded.delete(questionNumber);
    } else {
      newExpanded.add(questionNumber);
    }
    trackAction('viewQuestion', {
      source: 'student_test_results_page',
      questionNumber,
      expanded: willExpand,
    });
    setExpandedQuestions(newExpanded);
  };

  /**
   * Format answer display
   */
  const formatAnswer = (answer: string | string[] | Record<string, string>): string => {
    if (Array.isArray(answer)) {
      return answer.join(', ');
    }
    if (typeof answer === 'object') {
      return JSON.stringify(answer, null, 2);
    }
    return String(answer);
  };

  /**
   * Render loading state
   */
  if (loading) {
    return (
      <StudentLayout sidebar={sidebar} mobileTitle="Test Results">
        <div style={centerStateStyle}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <span aria-label="Loading" style={spinnerStyle} />
            <span style={{ fontSize: '0.95rem', fontWeight: 600, color: studentTokens.textBody }}>Loading results...</span>
          </div>
        </div>
        <style>{`@keyframes studentResultsSpin { to { transform: rotate(360deg); } }`}</style>
      </StudentLayout>
    );
  }

  /**
   * Render error state
   */
  if (error || !session || !testData || (!results && !writingSubmission)) {
    return (
      <StudentLayout sidebar={sidebar} mobileTitle="Test Results">
        <div style={centerStateStyle}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem' }}>⚠️</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600, color: '#1e293b' }}>
              {error || 'Failed to load results'}
            </div>
            <Button
              variant="primary"
              onClick={() => {
                trackAction('returnToDashboard', { source: 'student_results_error_state' });
                navigateTo('STUDENT_DASHBOARD', {}, { reason: 'student_results_error_return' });
              }}
            >
              Return to Home
            </Button>
          </div>
        </div>
        <style>{`@keyframes studentResultsSpin { to { transform: rotate(360deg); } }`}</style>
      </StudentLayout>
    );
  }

  const effectiveReleaseState = deriveSessionReleaseState(session);
  const visibility = getReleaseVisibility(effectiveReleaseState);
  const canRevealWritingPublishedData = effectiveReleaseState === 'feedback-released';
  const writingReleaseNotice = writingSubmission && effectiveReleaseState !== 'feedback-released'
    ? {
        tone: effectiveReleaseState === 'locked-review' ? 'warning' as const : 'info' as const,
        title: effectiveReleaseState === 'locked-review' ? 'Detailed review is still locked' : 'Feedback is not released yet',
        body: effectiveReleaseState === 'locked-review'
          ? 'This session result is still governed by the live-session release state. Writing feedback will appear here after the teacher publishes and releases it.'
          : 'The teacher has released result access, but detailed Writing feedback is still pending release.',
      }
    : null;

  // PRD-0030 Task 6.1.1: Writing test — render WritingResultView
  if (writingSubmission && testData.skill === 'Writing') {
    return (
      <StudentLayout sidebar={sidebar} mobileTitle="Test Results">
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : '256px minmax(0, 980px) 1fr',
            gap: isMobile ? '16px' : '24px',
            padding: isMobile ? '16px 0 24px' : '24px 0 40px',
          }}
        >
          <aside
            style={{
              position: isMobile ? 'static' : 'sticky',
              top: isMobile ? 0 : 24,
              alignSelf: 'start',
              display: 'grid',
              gap: '16px',
            }}
          >
            <div style={{ background: '#ffffff', borderRadius: '20px', border: '1px solid #e5e7eb', padding: '18px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#6b7280', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Writing Result
              </div>
              <h1 style={{ margin: '8px 0 0', fontSize: '1.45rem', fontWeight: 800, color: '#111827' }}>
                {testData.title}
              </h1>
              <div style={{ marginTop: '8px', color: '#6b7280', fontSize: '0.9rem', lineHeight: 1.6 }}>
                Review the published Writing feedback here once your teacher releases it.
              </div>
            </div>

            <div style={{ background: '#ffffff', borderRadius: '20px', border: '1px solid #e5e7eb', padding: '18px', display: 'grid', gap: '10px' }}>
              <button
                type="button"
                onClick={() => {
                  trackAction('returnToDashboard', { source: 'student_writing_result_page' });
                  navigateTo('STUDENT_DASHBOARD', {}, { reason: 'student_writing_results_return' });
                }}
                style={{
                  border: 'none',
                  borderRadius: '999px',
                  background: '#111827',
                  color: '#ffffff',
                  padding: '12px 16px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  ...(isMobile ? mobileStyles.fullWidthButton : {}),
                }}
              >
                Return to Home
              </button>
              <button
                type="button"
                onClick={() => {
                  trackAction('printWritingResults', {
                    source: 'student_writing_result_page',
                    submissionId: writingSubmission.id,
                  });
                  window.print();
                }}
                style={{
                  border: '1px solid #d1d5db',
                  borderRadius: '999px',
                  background: '#ffffff',
                  color: '#374151',
                  padding: '12px 16px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  ...(isMobile ? mobileStyles.fullWidthButton : {}),
                }}
              >
                Print Result
              </button>
            </div>
          </aside>

          <main style={{ minWidth: 0 }}>
            <Suspense
              fallback={
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '3rem 0', gap: '0.5rem' }}>
                  <div style={{
                    width: '2rem', height: '2rem',
                    border: '3px solid #e2e8f0',
                    borderTop: '3px solid #4f46e5',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              }
            >
              <WritingResultView
                submission={writingSubmission}
                canRevealPublishedData={canRevealWritingPublishedData}
                releaseNotice={writingReleaseNotice}
                variant="page"
                onMarkupViewChange={(taskNumber, mode) => {
                  trackAction('switchWritingMarkupMode', {
                    source: 'student_writing_result_page',
                    submissionId: writingSubmission.id,
                    taskNumber,
                    mode,
                  });
                }}
                onCriteriaToggle={(expanded) => {
                  trackAction('toggleWritingCriteriaFeedback', {
                    source: 'student_writing_result_page',
                    submissionId: writingSubmission.id,
                    expanded,
                  });
                }}
              />
            </Suspense>
          </main>

          {!isMobile && <aside aria-hidden="true" />}
        </div>
        <style>{`@keyframes studentResultsSpin { to { transform: rotate(360deg); } }`}</style>
      </StudentLayout>
    );
  }

  // At this point, results is guaranteed non-null (error guard + writing branch returned above)
  const safeResults = results!;
  const bandScore = calculateBandScore(safeResults.percentage);
  const storedFeedback =
    permanentResultRecord?.formativeFeedback?.aiFeedback?.summary?.trim()
    || permanentResultRecord?.formativeFeedback?.deterministicFeedback?.trim();
  const feedback = storedFeedback || generatePerformanceFeedback(safeResults.percentage);

  // PRD-0040 Task 4.4: Release-state governance for session-scoped results
  return (
    <StudentLayout sidebar={sidebar} mobileTitle="Test Results">
      <div
        style={{
          minHeight: '100%',
          background: 'linear-gradient(135deg, rgba(250, 245, 255, 0.95) 0%, rgba(240, 249, 255, 0.95) 50%, rgba(240, 253, 250, 0.95) 100%)',
          padding: isMobile ? mobileStyles.feedPadding.padding : '2rem',
        }}
      >
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <h1
            style={{
              margin: 0,
              fontSize: isMobile ? '2rem' : '2.5rem',
              fontWeight: 800,
              background: 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              marginBottom: '0.5rem',
            }}
          >
            Test Results
          </h1>
          <div style={{ fontSize: '1.125rem', color: '#64748b', fontWeight: 500 }}>
            {testData.title}
          </div>
          <div style={{ fontSize: isMobile ? '0.8125rem' : '0.875rem', color: '#94a3b8', marginTop: '0.25rem' }}>
            {testData.type} - {testData.skill}
          </div>
        </div>

        {/* PRD-0040 Task 4.4: Release-state governance banner */}
        {effectiveReleaseState === 'locked-review' && (
          <div style={{
            padding: '1rem 1.5rem',
            background: 'rgba(100, 116, 139, 0.08)',
            border: '1px solid rgba(100, 116, 139, 0.2)',
            borderRadius: '0.75rem',
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            alignItems: isMobile ? 'flex-start' : 'center',
            gap: '0.75rem',
            marginBottom: '1.5rem',
          }}>
            <span style={{ fontSize: '1.25rem' }}>🔒</span>
            <div>
              <div style={{ fontWeight: 600, color: '#475569', fontSize: '0.9375rem' }}>Detailed Review Locked</div>
              <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>Your teacher will release answers and feedback when ready.</div>
            </div>
          </div>
        )}
        {effectiveReleaseState === 'review-released' && (
          <div style={{
            padding: '1rem 1.5rem',
            background: 'rgba(59, 130, 246, 0.06)',
            border: '1px solid rgba(59, 130, 246, 0.15)',
            borderRadius: '0.75rem',
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            alignItems: isMobile ? 'flex-start' : 'center',
            gap: '0.75rem',
            marginBottom: '1.5rem',
          }}>
            <span style={{ fontSize: '1.25rem' }}>📋</span>
            <div>
              <div style={{ fontWeight: 600, color: '#1e40af', fontSize: '0.9375rem' }}>Answers Released</div>
              <div style={{ fontSize: '0.8125rem', color: '#3b82f6' }}>Correct answers are now available. Detailed feedback will follow.</div>
            </div>
          </div>
        )}

        {/* Score Summary Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: isMobile ? '1rem' : '1.5rem',
            marginBottom: '2rem',
          }}
        >
          {/* Total Score */}
          <Card variant="glass">
            <CardBody style={{ padding: isMobile ? '1.25rem' : '2rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.875rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.5rem' }}>
                Your Score
              </div>
              <div style={{ fontSize: isMobile ? '2.25rem' : '3rem', fontWeight: 800, color: '#8b5cf6', marginBottom: '0.5rem', wordBreak: 'break-word' }}>
                {safeResults.totalScore}/{safeResults.maxScore}
              </div>
              <div style={{ fontSize: isMobile ? '1.125rem' : '1.25rem', fontWeight: 700, color: '#64748b' }}>
                {safeResults.percentage.toFixed(1)}%
              </div>
            </CardBody>
          </Card>

          {/* Band Score */}
          <Card variant="glass">
            <CardBody style={{ padding: isMobile ? '1.25rem' : '2rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.875rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.5rem' }}>
                IELTS Band Score
              </div>
              <div style={{ fontSize: isMobile ? '2.25rem' : '3rem', fontWeight: 800, color: '#10b981', marginBottom: '0.5rem' }}>
                {bandScore.toFixed(1)}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#64748b' }}>
                Out of 9.0
              </div>
            </CardBody>
          </Card>

          {/* Questions Summary */}
          <Card variant="glass">
            <CardBody style={{ padding: isMobile ? '1.25rem' : '2rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.875rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.5rem' }}>
                Questions
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: isMobile ? 'column' : 'row',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: isMobile ? '0.75rem' : '1rem',
                  marginTop: '1rem',
                }}
              >
                <div>
                  <div style={{ fontSize: isMobile ? '1.75rem' : '2rem', fontWeight: 800, color: '#10b981' }}>
                    {safeResults.summary.correct}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Correct</div>
                </div>
                <div>
                  <div style={{ fontSize: isMobile ? '1.75rem' : '2rem', fontWeight: 800, color: '#f59e0b' }}>
                    {safeResults.summary.partialCredit}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Partial</div>
                </div>
                <div>
                  <div style={{ fontSize: isMobile ? '1.75rem' : '2rem', fontWeight: 800, color: '#ef4444' }}>
                    {safeResults.summary.incorrect}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Incorrect</div>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Course Average Card */}
          {session.courseId && courseAverage !== null && (
            <Card variant="glass">
              <CardBody style={{ padding: isMobile ? '1.25rem' : '2rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.875rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.5rem' }}>
                  {session.courseName ? `${session.courseName} Avg` : 'Course Average'}
                </div>
                <div style={{ fontSize: isMobile ? '2.25rem' : '3rem', fontWeight: 800, color: '#3b82f6', marginBottom: '0.5rem' }}>
                  {courseAverage.toFixed(1)}%
                </div>
                <div style={{
                  fontSize: '0.875rem',
                  color: safeResults.percentage >= courseAverage ? '#10b981' : '#ef4444',
                  fontWeight: 700,
                  display: 'flex',
                  flexDirection: isMobile ? 'column' : 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: isMobile ? '0.25rem' : '0.5rem',
                }}>
                  {safeResults.percentage >= courseAverage ? 'Above Average' : 'Below Average'}
                </div>
              </CardBody>
            </Card>
          )}
        </div>

        {/* Performance Feedback — gated by release state */}
        {visibility.showAIFeedback && (
        <Card variant="glass" style={{ marginBottom: '2rem' }}>
          <CardBody style={{ padding: isMobile ? '1.25rem' : '2rem' }}>
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: '1rem' }}>
              <div style={{ fontSize: '3rem' }}>
                {safeResults.percentage >= 80 ? '🎉' : safeResults.percentage >= 60 ? '👍' : '📚'}
              </div>
              <div style={{ flex: 1, width: '100%' }}>
                <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem' }}>
                  Performance Feedback
                </div>
                <div style={{ fontSize: '1rem', color: '#64748b', lineHeight: 1.6 }}>
                  {feedback}
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
        )}

        {/* Teacher Overall Feedback — gated by release state */}
        {visibility.showTeacherFeedback && permanentResultRecord?.overallFeedback && (
          <div style={{ marginBottom: '2rem' }}>
            <FeedbackDisplay
              feedback={permanentResultRecord.overallFeedback}
              teacherName={(permanentResultRecord as any).feedbackUpdatedByTeacherName || permanentResultRecord.feedbackUpdatedBy || 'Your Teacher'}
              updatedAt={permanentResultRecord.feedbackUpdatedAt || Date.now()}
              isOverall={true}
              variant="highlighted"
            />
          </div>
        )}

        {/* Question-by-Question Review */}
        <div style={{ marginBottom: '2rem' }}>
          <h2
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: '#1e293b',
              marginBottom: '1rem',
            }}
          >
            Question Review
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {safeResults.questionResults.map((result) => {
              const isExpanded = expandedQuestions.has(result.questionNumber);
              // PRD-0040 Task 4.4: In locked-review, use neutral styling (no correct/incorrect indicators)
              const statusColor = !visibility.showQuestionScoring
                ? { bg: 'rgba(100, 116, 139, 0.06)', border: '#cbd5e1', text: '#64748b' }
                : result.isCorrect
                  ? { bg: 'rgba(16, 185, 129, 0.1)', border: '#10b981', text: '#059669' }
                  : result.partialCredit
                    ? { bg: 'rgba(245, 158, 11, 0.1)', border: '#f59e0b', text: '#d97706' }
                    : { bg: 'rgba(239, 68, 68, 0.1)', border: '#ef4444', text: '#dc2626' };

              return (
                <Card key={result.questionNumber} variant="glass">
                  <CardBody style={{ padding: isMobile ? '1rem' : '1.5rem' }}>
                    {/* Question Header */}
                    <button
                      type="button"
                      onClick={() => toggleQuestion(result.questionNumber)}
                      style={{
                        display: 'flex',
                        width: '100%',
                        border: 'none',
                        background: 'transparent',
                        padding: 0,
                        textAlign: 'left',
                        cursor: 'pointer',
                        marginBottom: isExpanded ? '1rem' : 0,
                        ...(isMobile ? mobileStyles.touchTarget : {}),
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: isMobile ? 'column' : 'row',
                          justifyContent: 'space-between',
                          alignItems: isMobile ? 'stretch' : 'center',
                          gap: '1rem',
                          flex: 1,
                          width: '100%',
                          minWidth: 0,
                        }}
                      >
                        {/* Question Number */}
                        <div
                          style={{
                            width: isMobile ? '2.75rem' : '3rem',
                            height: isMobile ? '2.75rem' : '3rem',
                            borderRadius: '50%',
                            background: statusColor.bg,
                            border: `2px solid ${statusColor.border}`,
                            color: statusColor.text,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '1.125rem',
                            flexShrink: 0,
                          }}
                        >
                          {result.questionNumber}
                        </div>

                        {/* Question Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '1rem', fontWeight: 600, color: '#1e293b', marginBottom: '0.25rem' }}>
                            Question {result.questionNumber}
                          </div>
                          <div style={{ fontSize: '0.875rem', color: statusColor.text, fontWeight: 600, lineHeight: 1.5 }}>
                            {visibility.showQuestionScoring
                              ? `${result.isCorrect ? '✓ Correct' : result.partialCredit ? '⚡ Partial Credit' : '✗ Incorrect'} - ${result.score}/${result.maxScore} points`
                              : 'Tap to view your answer'}
                          </div>
                        </div>

                        {/* Expand Icon */}
                        <div
                          style={{
                            fontSize: '1.5rem',
                            color: '#64748b',
                            transition: 'transform 0.2s',
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            alignSelf: isMobile ? 'flex-end' : 'center',
                          }}
                        >
                          ▼
                        </div>
                      </div>
                    </button>

                    {/* Question Details (Expanded) */}
                    {isExpanded && (
                      <div style={{ paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
                        {/* Your Answer */}
                        <div style={{ marginBottom: '1rem' }}>
                          <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.5rem' }}>
                            Your Answer
                          </div>
                          <div
                            style={{
                              padding: isMobile ? '0.875rem' : '1rem',
                              background: statusColor.bg,
                              border: `1px solid ${statusColor.border}`,
                              borderRadius: '0.5rem',
                              fontSize: '0.9375rem',
                              fontWeight: 500,
                              color: '#1e293b',
                              fontFamily: 'monospace',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                            }}
                          >
                            {result.studentAnswer ? formatAnswer(result.studentAnswer) : '(No answer submitted)'}
                          </div>
                        </div>

                        {/* Correct Answer — gated by release state */}
                        {visibility.showCorrectAnswers && !result.isCorrect && (
                          <div style={{ marginBottom: '1rem' }}>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.5rem' }}>
                              Correct Answer
                            </div>
                            <div
                              style={{
                                padding: isMobile ? '0.875rem' : '1rem',
                                background: 'rgba(16, 185, 129, 0.1)',
                                border: '1px solid #10b981',
                                borderRadius: '0.5rem',
                                fontSize: '0.9375rem',
                                fontWeight: 600,
                                color: '#059669',
                                fontFamily: 'monospace',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                              }}
                            >
                              {formatAnswer(result.correctAnswer)}
                            </div>
                          </div>
                        )}

                        {/* Auto-Generated Feedback — gated by release state */}
                        {visibility.showAIFeedback && (
                        <div
                          style={{
                            padding: isMobile ? '0.875rem' : '0.75rem 1rem',
                            background: 'rgba(248, 250, 252, 0.8)',
                            borderRadius: '0.5rem',
                            fontSize: '0.875rem',
                            color: '#64748b',
                            fontStyle: 'italic',
                            marginBottom: permanentResultRecord?.questionResults?.find(q => q.questionNumber === result.questionNumber)?.teacherFeedback ? '1rem' : 0,
                          }}
                        >
                          {result.feedback}
                        </div>
                        )}

                        {/* Teacher Feedback — gated by release state */}
                        {visibility.showTeacherFeedback && (() => {
                          const questionFeedback = permanentResultRecord?.questionResults?.find(
                            q => q.questionNumber === result.questionNumber
                          )?.teacherFeedback;

                          if (!questionFeedback) return null;

                          return (
                            <div style={{ marginTop: '1rem' }}>
                              <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.5rem' }}>
                                Teacher's Feedback
                              </div>
                              <FeedbackDisplay
                                feedback={questionFeedback}
                                teacherName={(permanentResultRecord as any)?.feedbackUpdatedByTeacherName || permanentResultRecord?.feedbackUpdatedBy || 'Your Teacher'}
                                updatedAt={permanentResultRecord?.feedbackUpdatedAt || Date.now()}
                                questionId={String(result.questionNumber)}
                                variant="default"
                              />
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </CardBody>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Action Buttons */}
        <div
          style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            justifyContent: 'center',
            alignItems: isMobile ? 'stretch' : 'center',
            gap: '1rem',
            marginTop: '2rem',
            flexWrap: 'wrap',
          }}
        >
          <Button
            variant="primary"
            onClick={() => {
              trackAction('returnToDashboard', { source: 'student_test_results_page' });
              navigateTo('STUDENT_DASHBOARD', {}, { reason: 'student_results_return' });
            }}
            style={isMobile ? mobileStyles.fullWidthButton : undefined}
          >
            🏠 Return to Home
          </Button>

          {pdfAvailable && (
            <Button
              variant="primary"
              onClick={async () => {
                trackAction('exportResultsPdf', {
                  source: 'student_test_results_page',
                  sessionCode,
                  hasPermanentRecord: Boolean(permanentResultRecord),
                });
                // Scenario A: Use Permanent Record (Preferred)
                if (permanentResultRecord) {
                  await generateCertificatePDF(permanentResultRecord);
                  return;
                }

                // Scenario B: Legacy Fallback (Reconstruct from Session)
                if (!session || !testData || !safeResults || !sessionCode) return;
                if (!session.players || Object.keys(session.players).length === 0) return;

                const studentId = Object.keys(session.players)[0];
                if (!studentId) return;

                const studentData = session.players[studentId];

                // Convert to TestResultRecord format
                const resultRecord: TestResultRecord = {
                  resultId: `${sessionCode}_temp`,
                  sessionCode,
                  testId: session.testId,
                  studentId,
                  studentName: studentData?.name || 'Student',
                  totalScore: safeResults.totalScore,
                  maxScore: safeResults.maxScore,
                  percentage: safeResults.percentage,
                  bandScore: calculateBandScore(safeResults.percentage),
                  questionResults: safeResults.questionResults.map(qr => ({
                    questionNumber: qr.questionNumber,
                    questionType: qr.questionType,
                    isCorrect: qr.isCorrect,
                    score: qr.score,
                    maxScore: qr.maxScore,
                    studentAnswer: qr.studentAnswer,
                    correctAnswer: qr.correctAnswer,
                    feedback: qr.feedback,
                  })),
                  correct: safeResults.summary.correct,
                  incorrect: safeResults.summary.incorrect,
                  partialCredit: safeResults.summary.partialCredit,
                  totalQuestions: safeResults.summary.totalQuestions,
                  submittedAt: safeResults.completedAt,
                  timeElapsed: 0,
                  testDuration: testData.duration,
                  createdAt: Date.now(),
                  testTitle: testData.title,
                  testType: testData.type,
                  testSkill: testData.skill,
                };

                await generateCertificatePDF(resultRecord);
              }}
              style={isMobile ? mobileStyles.fullWidthButton : undefined}
            >
              📄 Download Certificate
            </Button>
          )}

          <Button
            variant="glass"
            onClick={() => {
              trackAction('printResults', {
                source: 'student_test_results_page',
                sessionCode,
              });
              window.print();
            }}
            style={isMobile ? mobileStyles.fullWidthButton : undefined}
          >
            🖨️ Print Results
          </Button>
        </div>

        {/* Writing/Speaking Placeholder */}
        {(permanentResultRecord?.writingSubmission || permanentResultRecord?.speakingSubmission) && (
          <div style={{ marginTop: '2rem', width: '100%', minWidth: 0 }}>
            <WritingSpeakingPlaceholder
              type={permanentResultRecord.testSkill === 'speaking' ? 'speaking' : 'writing'}
              submission={permanentResultRecord.writingSubmission || permanentResultRecord.speakingSubmission}
              status={permanentResultRecord.markingStatus}
            />
          </div>
        )}
      </div>
      </div>
      <style>{`@keyframes studentResultsSpin { to { transform: rotate(360deg); } }`}</style>
    </StudentLayout>
  );
};

export default StudentTestResultsPage;
