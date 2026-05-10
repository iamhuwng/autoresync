/**
 * Student Test Page V2
 * Refactored modular version with better separation of concerns
 * IELTS-style test interface with two-column layout
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';

// Components
// @ts-ignore - PassageRenderer is a .jsx file
import PassageRenderer from '../components/PassageRenderer_v2';
import { IELTSQuestionsPanel } from '../components/test/IELTSQuestionsPanel';
import { TwoColumnLayout } from '../components/test/TwoColumnLayout';
import { TestHeader } from '../components/test/TestHeader';
import { TestWaitingOverlay } from '../components/test/TestWaitingOverlay';
import { ReMarkingModal } from '../components/test/ReMarkingModal';
import { PassageControls } from '../components/test/PassageControls';
import { TestErrorBoundary } from '../components/test/TestErrorBoundary';
import { ConnectionMonitor } from '../components/test/ConnectionMonitor';
import { InspiraFooterNav } from '../components/test/InspiraFooterNav';
import { TimeUpOverlay } from '../components/test/TimeUpOverlay'; // PRD-0019
import { ExtraTimeBanner } from '../components/test/ExtraTimeBanner'; // PRD-0019

// Custom hooks
import { useTestData } from '../hooks/test/useTestData';
import { useTestSession, type StudentAnswers } from '../hooks/test/useTestSession';
import { useTestTimer } from '../hooks/test/useTestTimer';
import { useTestSubmission } from '../hooks/test/useTestSubmission';
import { useTestAutoSave } from '../hooks/useTestAutoSave';
import { useNavigation } from '../hooks/useNavigation';
import { useTestCompletionCheck } from '../hooks/test/useTestCompletionCheck'; // PRD-0019 Task 6.3
import { useBeforeUnloadWarning } from '../hooks/test/useBeforeUnloadWarning'; // PRD-0019 Task 6.7
import { useTeacherEndRedirect } from '../hooks/test/useTeacherEndRedirect'; // BUG-FIX: Redirect to results on teacher-end
import { useIntegrityRefreshRequest } from '../hooks/test/useIntegrityRefreshRequest';
import { useTestIntegrity } from '../hooks/test/useTestIntegrity'; // PRD-0036
import { useAntiCopyPaste } from '../hooks/test/useAntiCopyPaste'; // PRD-0036
import { useFullscreenMode } from '../hooks/test/useFullscreenMode'; // PRD-0036
import { toast } from '../components/modern/ToastNotification'; // PRD-0036
import { getIELTSQuestionsForStudent } from '../utils/thcsShuffle'; // PRD-0036 Task 10.6

// Services
import { sessionService } from '../services/sessionService';

const StudentTestPageContent: React.FC = () => {
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const { navigateTo, handleSessionChange } = useNavigation('student');
  const { checkAndRedirect } = useTeacherEndRedirect({ sessionCode }); // BUG-FIX: Redirect to results on teacher-end
  const submitTestRef = useRef<
    ((submitMode?: boolean | 'teacher') => Promise<void>) | null
  >(null);
  const flushIntegrityRef = useRef<(() => Promise<void>) | null>(null);

  const {
    testData: rawTestData,
    loading,
    error,
    activePassageId,
    setActivePassageId,
    questionsWithAnswersRef, // PRD-0036 Task 9
  } = useTestData({ sessionCode });

  const testData = useMemo(() => {
    if (!rawTestData) {
      return null;
    }

    return {
      ...rawTestData,
      passages: Array.isArray(rawTestData.passages) ? rawTestData.passages : [],
      questions: Array.isArray(rawTestData.questions) ? rawTestData.questions : [],
    };
  }, [rawTestData]);

  const hasUnsupportedTestShape = Boolean(rawTestData)
    && (!Array.isArray(rawTestData.passages) || !Array.isArray(rawTestData.questions));

  // PRD-0019 Task 6.3: Re-entry prevention - check if test already completed
  useTestCompletionCheck({
    sessionCode,
    testSkill: testData?.skill,
    enabled: !loading && !!testData,
    surface: 'student_test',
    onForceSubmit: async () => {
      if (!submitTestRef.current) return;
      if (flushIntegrityRef.current) {
        await flushIntegrityRef.current();
      }
      await submitTestRef.current('teacher');
    },
  });

  // Answer management
  const [answers, setAnswers] = useState<StudentAnswers>({});
  const [currentQuestionNumber, setCurrentQuestionNumber] = useState(1);
  const hasInitializedQuestionRef = useRef(false);

  // Test submission state - moved up to be available for useTestSession
  const [testSubmitted, setTestSubmitted] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);

  // Session management
  const {
    session,
    // setSession, // Not needed in refactored version
    sessionStatus,
    isPaused,
    sessionStartTime,
    pausedDuration,
    reMarkingData,
    showReMarkModal,
    setShowReMarkModal,
    // setTestResults, // Not needed in refactored version
    isConnected,
    antiCheatConfig, // PRD-0036: From RTDB session data
    integrityRefreshRequestedAt,
  } = useTestSession({
    sessionCode,
    testData,
    answers,
    testSubmitted, // Use actual state instead of hardcoded false
    testResults: null,
  });

  // Timer management - must come BEFORE submission to provide timeRemaining
  const handleTimeUp = useCallback(() => {
    // Only auto-submit if test is actually in progress and not already submitted
    if (sessionStatus === 'in-progress' && !testSubmitted && submitTestRef.current) {
      submitTestRef.current(true);
    }
  }, [sessionStatus, testSubmitted]);

  const { timeRemaining: calculatedTime, formatTime, showTimeUpOverlay, gracePeriodRemaining, isInExtraTime } = useTestTimer({
    testData,
    sessionStatus,
    isPaused,
    sessionStartTime,
    pausedDuration,
    testSubmitted,
    onTimeUp: handleTimeUp,
  });

  // Update local timeRemaining state when timer calculates new value
  useEffect(() => {
    setTimeRemaining(calculatedTime);
  }, [calculatedTime]);

  // Status stabilization - prevent navigation on brief status flickers
  const statusStableTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastStableStatusRef = useRef<string | null>(null);

  // Centralized navigation handling via navigationService
  // Handles test end, session status changes, and prevents loops automatically
  useEffect(() => {
    // Guard: Handle authentication errors (redirect to login)
    if (error === 'Authentication required') {
      console.log('🔒 Authentication required, redirecting to login');
      navigateTo('LOGIN', {}, { reason: 'auth_required', replace: true });
      return;
    }

    // Guard: If testData becomes null (test ended), check if student was auto-submitted
    // BUG-FIX: When teacher ends test early, redirect to results page instead of waiting room
    if (!loading && !testData && !error && sessionCode) {
      console.log('⚠️ Test data no longer available, checking if auto-submitted...');
      checkAndRedirect().then((redirected) => {
        if (!redirected) {
          console.log('→ Not auto-submitted, redirecting to waiting room');
          navigateTo('STUDENT_WAITING',
            { gameSessionId: sessionCode },
            { reason: 'test_data_cleared', replace: true }
          );
        }
      });
      return;
    }

    // Status stabilization: Only navigate on 'waiting' if status is stable for 2 seconds
    // This prevents loops caused by brief status oscillations during Firebase sync
    if (sessionStatus && sessionCode) {
      // Clear existing timer
      if (statusStableTimerRef.current) {
        clearTimeout(statusStableTimerRef.current);
      }

      // If status is 'in-progress', handle immediately (test is running)
      if (sessionStatus === 'in-progress') {
        lastStableStatusRef.current = sessionStatus;
        // Don't navigate - student should stay in test
        return;
      }

      // If status is 'waiting', wait 2 seconds to confirm it's stable
      if (sessionStatus === 'waiting') {
        console.log('⏳ Status changed to waiting - verifying stability before navigating...');
        statusStableTimerRef.current = setTimeout(() => {
          // Status has been 'waiting' for 2 seconds - safe to navigate
          if (sessionStatus === 'waiting') {
            console.log('✅ Status confirmed stable (waiting) - navigating to waiting room');
            lastStableStatusRef.current = sessionStatus;
            handleSessionChange(sessionStatus, sessionCode);
          }
        }, 2000); // 2 second debounce
        return;
      }

      // For other statuses (completed, expired), handle immediately
      lastStableStatusRef.current = sessionStatus;
      handleSessionChange(sessionStatus, sessionCode);
    }

    // Cleanup timer on unmount
    return () => {
      if (statusStableTimerRef.current) {
        clearTimeout(statusStableTimerRef.current);
      }
    };
  }, [testData, loading, error, sessionCode, sessionStatus, navigateTo, handleSessionChange]);

  // ── PRD-0036: Anti-Cheat Integration (Task 6.1) ───────────────
  // antiCheatConfig now comes from useTestSession which reads it from RTDB
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    addEvent,
    warningLevel,
    warningMessage,
    shouldAutoSubmit,
    flushEvents,
    getIntegrityReport,
  } = useTestIntegrity({
    config: antiCheatConfig,
    context: 'session',
    surface: 'student_test',
    sessionCode: sessionCode || '',
    studentId: sessionService.getPlayerId() || '',
    testId: testData?.id || '',
  });

  useAntiCopyPaste({
    enabled: antiCheatConfig?.detectCopyPaste || false,
    containerRef: containerRef as React.RefObject<HTMLElement>,
    onEvent: addEvent,
    allowEditorPaste: testData?.skill === 'Writing',
    detectRightClick: antiCheatConfig?.detectRightClick || false,
    detectKeyboardShortcuts: antiCheatConfig?.detectKeyboardShortcuts || false,
  });

  useFullscreenMode({
    enabled: antiCheatConfig?.requireFullscreen || false,
    onFullscreenExit: addEvent,
  });

  useEffect(() => {
    flushIntegrityRef.current = () => flushEvents('teacher_force_submit');
  }, [flushEvents]);

  useIntegrityRefreshRequest({
    enabled: sessionStatus === 'in-progress' && !testSubmitted,
    requestTimestamp: integrityRefreshRequestedAt,
    onRefreshRequested: () => flushEvents('teacher_refresh'),
  });

  // Test submission - now receives correct timeRemaining
  const {
    isSubmitting,
    testSubmitted: submissionTestSubmitted,
    testResults,
    loadedAnswers,
    handleSubmit: submitTest,
    isLocked, // PRD-0019: Input locking during grace period
  } = useTestSubmission({
    testData,
    session,
    sessionCode,
    answers,
    timeRemaining,
    integrityReport: antiCheatConfig ? getIntegrityReport() : null,
    questionsWithAnswersRef, // PRD-0036 Task 9.4
    questionPresentation: {
      studentId: sessionService.getPlayerId() || 'anon',
      shuffleQuestions: antiCheatConfig?.shuffleQuestions || false,
      shuffleOptions: antiCheatConfig?.shuffleOptions || false,
    },
    telemetrySurface: 'student_test',
  });

  // Store submit function ref for timer callback
  useEffect(() => {
    submitTestRef.current = submitTest;
  }, [submitTest]);

  // Sync testSubmitted state
  useEffect(() => {
    setTestSubmitted(submissionTestSubmitted);
  }, [submissionTestSubmitted]);

  // PRD-0019 Task 6.7: Warn before leaving page during active test
  useBeforeUnloadWarning({
    enabled: !testSubmitted && sessionStatus === 'in-progress',
  });

  // PRD-0036 Task 10.6: Deterministic question/option shuffle
  const displayQuestions = useMemo(() => {
    if (!testData) return [];
    return getIELTSQuestionsForStudent(
      testData.questions,
      sessionService.getPlayerId() || 'anon',
      testData.id,
      {
        shuffleQuestions: antiCheatConfig?.shuffleQuestions || false,
        shuffleOptions: antiCheatConfig?.shuffleOptions || false,
      },
    );
  }, [testData, antiCheatConfig?.shuffleQuestions, antiCheatConfig?.shuffleOptions]);

  useEffect(() => {
    if (hasInitializedQuestionRef.current || !activePassageId || displayQuestions.length === 0) {
      return;
    }

    const firstPassageQuestion = displayQuestions.find(
      (question) => question.passageId === activePassageId,
    );

    if (!firstPassageQuestion) {
      return;
    }

    setCurrentQuestionNumber(firstPassageQuestion.number);
    hasInitializedQuestionRef.current = true;
  }, [activePassageId, displayQuestions]);

  // PRD-0036: Show toast warnings on escalation
  const prevWarningRef = useRef(warningLevel);
  useEffect(() => {
    if (warningLevel !== prevWarningRef.current) {
      prevWarningRef.current = warningLevel;
      if (warningLevel === 'toast' || warningLevel === 'escalated') {
        toast.warning(warningMessage);
      }
    }
  }, [warningLevel, warningMessage]);

  // PRD-0036: Auto-submit on violation threshold
  useEffect(() => {
    if (shouldAutoSubmit && !testSubmitted && submitTestRef.current) {
      (async () => {
        await flushEvents('auto_submit');
        await submitTestRef.current?.(true);
      })();
    }
  }, [shouldAutoSubmit, testSubmitted, flushEvents]);

  // Load previously submitted answers if they exist
  useEffect(() => {
    if (loadedAnswers && Object.keys(loadedAnswers).length > 0) {
      console.log('Loading previously submitted answers into UI:', loadedAnswers);
      setAnswers(loadedAnswers);
    }
  }, [loadedAnswers]);

  /**
   * Merge test results with remark data
   * When teacher re-marks, update the question results and correct count
   */
  const mergedQuestionResults = useMemo(() => {
    // Start with original results from submission
    const baseResults = testResults?.questionResults || {};

    // If we have remark data, override with updated results
    if (reMarkingData?.reMarkDetails) {
      const updatedResults = { ...baseResults };

      // Convert reMarkDetails (question -> score) to questionResults (question -> boolean)
      Object.entries(reMarkingData.reMarkDetails).forEach(([qNum, score]) => {
        const questionNumber = parseInt(qNum);
        updatedResults[questionNumber] = Number(score) > 0; // Score > 0 means correct
      });

      return updatedResults;
    }

    return baseResults;
  }, [testResults?.questionResults, reMarkingData]);

  /**
   * Merge test results with correct count from remark data
   */
  const mergedTestResults = useMemo(() => {
    if (!testResults) return null;

    // If we have remark data, use the updated correct count
    if (reMarkingData) {
      return {
        ...testResults,
        correctAnswers: reMarkingData.correctCount,
        totalScore: reMarkingData.score,
        percentage: reMarkingData.maxScore ? Math.round((reMarkingData.score / reMarkingData.maxScore) * 100) : 0,
      };
    }

    return testResults;
  }, [testResults, reMarkingData]);

  // Auto-save answers to Firebase in real-time
  const autoSaveStatus = useTestAutoSave({
    sessionCode: sessionCode || '',
    studentId: sessionService.getPlayerId() || '',
    answers,
    enabled: !testSubmitted && sessionStatus === 'in-progress', // Only auto-save during active test
  });

  // Log auto-save status for debugging
  useEffect(() => {
    if (autoSaveStatus.status === 'saved') {
      console.log('✅ [StudentTestPage] Answers auto-saved at', new Date(autoSaveStatus.lastSaved || Date.now()).toLocaleTimeString());
    } else if (autoSaveStatus.status === 'error') {
      console.error('❌ [StudentTestPage] Auto-save error:', autoSaveStatus.error);
    }
  }, [autoSaveStatus]);

  // Passage UI controls
  const [fontSize, setFontSize] = useState(16);
  const [lineSpacing, setLineSpacing] = useState(1.5);
  const [highlighterActive, setHighlighterActive] = useState(false);
  const [highlightColor, setHighlightColor] = useState('#ffeb3b');
  const [clearHighlightsTrigger, setClearHighlightsTrigger] = useState(0);

  /**
   * Update answer for a question
   */
  const handleAnswerChange = useCallback((
    questionNumber: number,
    answer: string | string[] | Record<string, string>
  ) => {
    setAnswers(prev => ({
      ...prev,
      [questionNumber]: answer,
    }));
  }, []);

  /**
   * Navigate to specific question
   */
  const goToQuestion = useCallback((questionNumber: number) => {
    setCurrentQuestionNumber(questionNumber);

    // Find and set active passage for this question
    // Support both new resourceId and legacy passageId fields
    if (testData) {
      const question = testData.questions.find(q => q.number === questionNumber);
      if (question) {
        // Prefer resourceId (new unified model), fallback to passageId (legacy)
        const targetPassageId = (question as any).resourceId || question.passageId;
        if (targetPassageId) {
          setActivePassageId(targetPassageId);
        }
      }
    }
  }, [testData, setActivePassageId]);

  /**
   * Handle test submission (wrapper for hook's handleSubmit)
   */
  const handleSubmit = useCallback(async () => {
    await flushEvents('manual_submit'); // PRD-0036: Write complete integrity event log before submission
    await submitTest(false); // Manual submission
  }, [flushEvents, submitTest]);

  /**
   * Clear highlights handler
   */
  const handleClearHighlights = useCallback(() => {
    setClearHighlightsTrigger(prev => prev + 1);
  }, []);

  // Loading state
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: '#f8fafc'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1e293b' }}>
            Loading Test...
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !testData) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: '#f8fafc'
      }}>
        <div style={{ textAlign: 'center', maxWidth: '400px', padding: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>❌</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1e293b', marginBottom: '0.5rem' }}>
            Failed to Load Test
          </div>
          <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.5rem' }}>
            {error || 'Test not found'}
          </div>
          <button
            onClick={() => navigateTo('LOGIN', {}, { reason: 'error_return' })}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '0.9375rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (hasUnsupportedTestShape) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: '#f8fafc'
      }}>
        <div style={{ textAlign: 'center', maxWidth: '440px', padding: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1e293b', marginBottom: '0.5rem' }}>
            Unsupported Test Format
          </div>
          <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.5rem' }}>
            This session payload cannot be shown in the generic test page.
          </div>
          <button
            onClick={() => navigateTo('LOGIN', {}, { reason: 'unsupported_test_format' })}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '0.9375rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const currentPassage = testData.passages.find(p => p.id === activePassageId);

  return (
    <div ref={containerRef} style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#f8fafc',
      position: 'relative'
    }} className={antiCheatConfig?.detectCopyPaste ? 'anti-select' : ''}>
      {/* Connection Monitor */}
      <ConnectionMonitor
        sessionCode={sessionCode}
        onConnectionChange={(connected) => {
          if (!connected && !testSubmitted) {
            console.log('Connection lost during test');
          }
        }}
      />

      {/* Connection Status Indicator (only show if disconnected) */}
      {!isConnected && (
        <div style={{
          position: 'fixed',
          top: '80px',
          right: '20px',
          zIndex: 9998,
          background: '#fef2f2',
          border: '2px solid #fecaca',
          borderRadius: '0.5rem',
          padding: '0.75rem 1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
        }}>
          <span style={{ fontSize: '1.25rem' }}>⚠️</span>
          <div>
            <div style={{ fontWeight: '600', color: '#dc2626', fontSize: '0.875rem' }}>
              Connection Issue
            </div>
            <div style={{ fontSize: '0.75rem', color: '#991b1b' }}>
              Your answers are being saved locally
            </div>
          </div>
        </div>
      )}

      {/* Waiting/Paused Overlay */}
      <TestWaitingOverlay
        sessionStatus={sessionStatus}
        isPaused={isPaused}
        sessionCode={sessionCode}
      />

      {/* Header */}
      <TestHeader
        testTitle={testData.title}
        testType={testData.type}
        testSkill={testData.skill}
        studentName={session?.studentName || sessionService.getPlayerName() || 'Student'}
        answeredCount={Object.keys(answers).length}
        totalQuestions={testData.questionCount || 0}
        timeRemaining={timeRemaining}
        formatTime={formatTime}
        sessionStatus={sessionStatus}
        isPaused={isPaused}
        isSubmitting={isSubmitting}
        testSubmitted={testSubmitted}
        testResults={mergedTestResults}
        onSubmit={handleSubmit}
      />

      {/* PRD-0019: Extra Time Banner */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 2rem' }}>
        <ExtraTimeBanner
          isInExtraTime={isInExtraTime}
          formattedTime={formatTime(timeRemaining)}
        />
      </div>



      {/* Two-column resizable layout */}
      <TwoColumnLayout
        leftColumn={
          <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
          }}>
            {/* Passage Controls Header */}
            {currentPassage && (
              <PassageControls
                fontSize={fontSize}
                setFontSize={setFontSize}
                lineSpacing={lineSpacing}
                setLineSpacing={setLineSpacing}
                highlighterActive={highlighterActive}
                setHighlighterActive={setHighlighterActive}
                highlightColor={highlightColor}
                setHighlightColor={setHighlightColor}
                onClearHighlights={handleClearHighlights}
              />
            )}

            {/* Passage Content */}
            <div style={{
              flex: 1,
              overflow: 'auto',
              padding: '1rem',
            }}>
              {currentPassage ? (
                <PassageRenderer
                  passage={currentPassage}
                  fontSize={fontSize}
                  lineSpacing={lineSpacing}
                  highlighterActive={highlighterActive}
                  highlightColor={highlightColor}
                  clearHighlightsTrigger={clearHighlightsTrigger}
                />
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                  No passage selected
                </div>
              )}
            </div>
          </div>
        }
        rightColumn={
          <IELTSQuestionsPanel
            questions={displayQuestions}
            questionGroups={testData.questionGroups || []}
            currentPassageId={activePassageId}
            answers={answers}
            onAnswerChange={(testSubmitted || isLocked) ? () => { } : handleAnswerChange} // PRD-0019: Disable during grace period
            activeQuestionNumber={currentQuestionNumber}
            onQuestionClick={goToQuestion}
            testSubmitted={testSubmitted}
            questionResults={mergedQuestionResults}
            partIndex={testData.passages.findIndex(p => p.id === activePassageId)}
            skill={testData.skill || 'reading'}
          />
        }
      />

      {/* Footer Navigation (Inspera-style) */}
      <InspiraFooterNav
        questions={displayQuestions}
        passages={testData.passages}
        answers={answers}
        activePassageId={activePassageId}
        activeQuestionNumber={currentQuestionNumber}
        onPassageChange={setActivePassageId}
        onQuestionClick={goToQuestion}
        onSubmit={handleSubmit}
        testSubmitted={testSubmitted}
        questionResults={mergedQuestionResults}
      />

      {/* Re-marking Modal */}
      <ReMarkingModal
        show={showReMarkModal}
        reMarkingData={reMarkingData}
        totalQuestions={testData?.questionCount || 0}
        onClose={() => setShowReMarkModal(false)}
      />

      {/* PRD-0019: Time Up Overlay - Shows 5-second countdown before auto-submission */}
      {showTimeUpOverlay && (
        <TimeUpOverlay
          onComplete={() => {
            // Grace period ended, submission will be triggered by useTestTimer
            console.log('⏰ [PRD-0019] Grace period complete, auto-submitting...');
          }}
          countdownSeconds={gracePeriodRemaining}
        />
      )}
    </div>
  );
};

// Wrap with Error Boundary
export const StudentTestPage: React.FC = () => {
  const { sessionCode } = useParams<{ sessionCode: string }>();

  return (
    <TestErrorBoundary sessionCode={sessionCode}>
      <StudentTestPageContent />
    </TestErrorBoundary>
  );
};

export default StudentTestPage;
