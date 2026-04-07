/**
 * Reading Test Page
 * IELTS Reading test interface with passage display and two-column layout
 * Extracted from StudentTestPage.tsx as part of Phase 2 refactoring
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';

// Mobile Exam Mode
import { useMobileExamMode } from '../../../core/platform/hooks/useMobileExamMode';
import { MobileReadingExamScaffold } from '../../../components/test/mobile/MobileReadingExamScaffold';

// Generic Test Components (shared across all skills)
import { IELTSQuestionsPanel } from '../../../components/test/IELTSQuestionsPanel';
import { TwoColumnLayout } from '../../../components/test/TwoColumnLayout';
import { ReadingHeader } from '../../../components/test/ReadingHeader';
import { TestWaitingOverlay } from '../../../components/test/TestWaitingOverlay';
import { ReMarkingModal } from '../../../components/test/ReMarkingModal';
import { TestErrorBoundary } from '../../../components/test/TestErrorBoundary';
import { ConnectionMonitor } from '../../../components/test/ConnectionMonitor';
import { InspiraFooterNav } from '../../../components/test/InspiraFooterNav';
import { TimeUpOverlay } from '../../../components/test/TimeUpOverlay'; // PRD-0019
import { ExtraTimeBanner } from '../../../components/test/ExtraTimeBanner'; // PRD-0019

// Reading-Specific Components (moved to Reading skill module)
import { PassageControls } from './PassageControls';
import { PassageRenderer } from './PassageRenderer';

// Core Test Hooks (Phase 1 abstractions)
import { useTestData } from '../../../hooks/test/useTestData';
import { useTestSession, type StudentAnswers } from '../../../hooks/test/useTestSession';
import { useTestTimer } from '../../../hooks/test/useTestTimer';
import { useTestSubmission } from '../../../hooks/test/useTestSubmission';
import { useTestAutoSave } from '../../../hooks/useTestAutoSave';
import { useNavigation } from '../../../hooks/useNavigation';
import { useTestCompletionCheck } from '../../../hooks/test/useTestCompletionCheck'; // PRD-0019 Task 6.3
import { useBeforeUnloadWarning } from '../../../hooks/test/useBeforeUnloadWarning'; // PRD-0019 Task 6.7
import { useTeacherEndRedirect } from '../../../hooks/test/useTeacherEndRedirect'; // BUG-FIX: Redirect to results on teacher-end
import { useIntegrityRefreshRequest } from '../../../hooks/test/useIntegrityRefreshRequest';
import { useTestIntegrity } from '../../../hooks/test/useTestIntegrity';
import { useAntiCopyPaste } from '../../../hooks/test/useAntiCopyPaste';
import { useFullscreenMode } from '../../../hooks/test/useFullscreenMode';
import { toast } from '../../../components/modern/ToastNotification';
import { getIELTSQuestionsForStudent } from '../../../utils/thcsShuffle';

// Services
import { sessionService } from '../../../services/sessionService';

/**
 * Reading Test Page Content Component
 * Main test interface for IELTS Reading tests
 */
const ReadingTestPageContent: React.FC = () => {
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const { navigateTo, handleSessionChange } = useNavigation('student');
  const { isMobileExamMode } = useMobileExamMode();
  const { checkAndRedirect } = useTeacherEndRedirect({ sessionCode }); // BUG-FIX: Redirect to results on teacher-end
  const submitTestRef = useRef<
    ((isAutoSubmit?: boolean) => Promise<void>) | null
  >(null);
  const flushIntegrityRef = useRef<(() => Promise<void>) | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ═══════════════════════════════════════════════════════════════
  // CORE TEST STATE (Phase 1 Abstractions)
  // ═══════════════════════════════════════════════════════════════

  // Load test data and manage active passage
  const {
    testData,
    loading,
    error,
    activePassageId,
    setActivePassageId,
    questionsWithAnswersRef,
  } = useTestData({ sessionCode });

  // PRD-0019 Task 6.3: Re-entry prevention - check if test already completed
  useTestCompletionCheck({
    sessionCode,
    testSkill: testData?.skill,
    enabled: !loading && !!testData,
    surface: 'reading_test',
    onForceSubmit: async () => {
      if (!submitTestRef.current) return;
      if (flushIntegrityRef.current) {
        await flushIntegrityRef.current();
      }
      await submitTestRef.current(true);
    },
  });

  // Answer management
  const [answers, setAnswers] = useState<StudentAnswers>({});
  const [currentQuestionNumber, setCurrentQuestionNumber] = useState(1);
  const hasInitializedQuestionRef = useRef(false);

  // Test submission state (must be declared before useTestSession)
  const [testSubmitted, setTestSubmitted] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);

  // Session management with real-time Firebase sync
  const {
    session,
    sessionStatus,
    isPaused,
    sessionStartTime,
    pausedDuration,
    reMarkingData,
    showReMarkModal,
    setShowReMarkModal,
    isConnected,
    antiCheatConfig,
    integrityRefreshRequestedAt,
  } = useTestSession({
    sessionCode,
    testData,
    answers,
    testSubmitted,
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
    surface: 'reading_test',
    sessionCode: sessionCode || '',
    studentId: sessionService.getPlayerId() || '',
    testId: testData?.id || '',
  });

  useAntiCopyPaste({
    enabled: antiCheatConfig?.detectCopyPaste || false,
    containerRef: containerRef as React.RefObject<HTMLElement>,
    onEvent: addEvent,
    allowEditorPaste: false,
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

  // Status stabilization - prevent navigation on brief status flickers
  const statusStableTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastStableStatusRef = useRef<string | null>(null);
  const currentSessionStatusRef = useRef<string | null>(null);

  // Keep sessionStatus ref up to date
  useEffect(() => {
    currentSessionStatusRef.current = sessionStatus;
  }, [sessionStatus]);

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
    // PRD-TEST-END-FLOW: Redirects to waiting room with results modal via checkAndRedirect
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

    // IMPORTANT: If we have testData loaded, do NOT navigate to waiting room
    // The test is considered active as long as testData exists
    // This prevents the race condition where status briefly shows 'waiting'
    // but testData is still present
    if (testData && sessionCode) {
      // Clear any pending navigation timer since we have valid test data
      if (statusStableTimerRef.current) {
        clearTimeout(statusStableTimerRef.current);
        statusStableTimerRef.current = null;
      }

      // Only log status changes, but don't navigate away
      if (sessionStatus && sessionStatus !== lastStableStatusRef.current) {
        console.log(`📊 [ReadingTestPage] Session status: ${sessionStatus} (testData loaded, staying on test page)`);
        lastStableStatusRef.current = sessionStatus;
      }
      return;
    }

    // Cleanup timer on unmount
    return () => {
      if (statusStableTimerRef.current) {
        clearTimeout(statusStableTimerRef.current);
      }
    };
  }, [testData, loading, error, sessionCode, sessionStatus, navigateTo, handleSessionChange]);

  // Test submission - receives correct timeRemaining from timer
  const {
    testSubmitted: submissionTestSubmitted,
    testResults,
    loadedAnswers,
    handleSubmit: submitTest,
    isLocked, // PRD-0019: Input locking during grace period
    lockInputs: _lockInputs, // PRD-0019: Function to lock inputs
  } = useTestSubmission({
    testData,
    session,
    sessionCode,
    answers,
    timeRemaining,
    integrityReport: antiCheatConfig ? getIntegrityReport() : null,
    questionsWithAnswersRef,
  });

  // Store submit function ref for timer callback
  useEffect(() => {
    submitTestRef.current = submitTest;
  }, [submitTest]);

  // Sync testSubmitted state
  useEffect(() => {
    setTestSubmitted(submissionTestSubmitted);
  }, [submissionTestSubmitted]);

  const displayQuestions = useMemo(() => {
    if (!testData) return [];
    return getIELTSQuestionsForStudent(
      testData.questions,
      sessionService.getPlayerId() || 'anon',
      testData.id,
      {
        shuffleQuestions: antiCheatConfig?.shuffleQuestions || false,
        shuffleOptions: false,
      },
    );
  }, [
    antiCheatConfig?.shuffleQuestions,
    testData,
  ]);

  const activePassageQuestions = useMemo(
    () => displayQuestions.filter((question) => question.passageId === activePassageId),
    [activePassageId, displayQuestions],
  );

  useEffect(() => {
    if (hasInitializedQuestionRef.current || activePassageQuestions.length === 0) {
      return;
    }

    setCurrentQuestionNumber(activePassageQuestions[0]!.number);
    hasInitializedQuestionRef.current = true;
  }, [activePassageQuestions]);

  // PRD-0019 Task 6.7: Warn before leaving page during active test
  useBeforeUnloadWarning({
    enabled: !testSubmitted && sessionStatus === 'in-progress',
  });

  const prevWarningRef = useRef(warningLevel);
  useEffect(() => {
    if (warningLevel !== prevWarningRef.current) {
      prevWarningRef.current = warningLevel;
      if (warningLevel === 'toast' || warningLevel === 'escalated') {
        toast.warning(warningMessage);
      }
    }
  }, [warningLevel, warningMessage]);

  useEffect(() => {
    if (shouldAutoSubmit && !testSubmitted && submitTestRef.current) {
      (async () => {
        await flushEvents('auto_submit');
        await submitTestRef.current?.(true);
      })();
    }
  }, [flushEvents, shouldAutoSubmit, testSubmitted]);

  // Load previously submitted answers if they exist
  useEffect(() => {
    if (loadedAnswers && Object.keys(loadedAnswers).length > 0) {
      console.log('Loading previously submitted answers into UI:', loadedAnswers);
      setAnswers(loadedAnswers);
    }
  }, [loadedAnswers]);

  // Merge test results with remark data
  const mergedQuestionResults = useMemo(() => {
    const baseResults = testResults?.questionResults || {};

    if (reMarkingData?.reMarkDetails) {
      const updatedResults = { ...baseResults };

      Object.entries(reMarkingData.reMarkDetails).forEach(([qNum, score]) => {
        const questionNumber = parseInt(qNum);
        updatedResults[questionNumber] = Number(score) > 0;
      });

      return updatedResults;
    }

    return baseResults;
  }, [testResults?.questionResults, reMarkingData]);

  // Auto-save answers to Firebase in real-time
  const autoSaveStatus = useTestAutoSave({
    sessionCode: sessionCode || '',
    studentId: sessionService.getPlayerId() || '',
    answers,
    enabled: !testSubmitted && sessionStatus === 'in-progress',
  });

  // Log auto-save status for debugging
  useEffect(() => {
    if (autoSaveStatus.status === 'saved') {
      console.log('✅ [ReadingTestPage] Answers auto-saved at', new Date(autoSaveStatus.lastSaved || Date.now()).toLocaleTimeString());
    } else if (autoSaveStatus.status === 'error') {
      console.error('❌ [ReadingTestPage] Auto-save error:', autoSaveStatus.error);
    }
  }, [autoSaveStatus]);

  // ═══════════════════════════════════════════════════════════════
  // READING-SPECIFIC STATE
  // ═══════════════════════════════════════════════════════════════

  // Passage UI controls (Reading-specific)
  const [fontSize, setFontSize] = useState(16);
  const [lineSpacing, setLineSpacing] = useState(1.5);
  const [highlighterActive, setHighlighterActive] = useState(false);
  const [highlightColor, setHighlightColor] = useState('#ffeb3b');
  const [clearHighlightsTrigger, setClearHighlightsTrigger] = useState(0);

  // ═══════════════════════════════════════════════════════════════
  // EVENT HANDLERS
  // ═══════════════════════════════════════════════════════════════

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
   * Navigate to specific question (Reading-specific: also sets active passage)
   */
  const goToQuestion = useCallback((questionNumber: number) => {
    setCurrentQuestionNumber(questionNumber);

    // Find and set active passage for this question
    if (testData) {
      const question = testData.questions.find(q => q.number === questionNumber);
      if (question && question.passageId) {
        setActivePassageId(question.passageId);
      }
    }
  }, [testData, setActivePassageId]);

  /**
   * Handle test submission (wrapper for hook's handleSubmit)
   */
  const handleSubmit = useCallback(() => {
    (async () => {
      await flushEvents('manual_submit');
      await submitTest(false);
    })();
  }, [flushEvents, submitTest]);

  /**
   * Clear highlights handler (Reading-specific)
   */
  const handleClearHighlights = useCallback(() => {
    setClearHighlightsTrigger(prev => prev + 1);
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // LOADING & ERROR STATES
  // ═══════════════════════════════════════════════════════════════

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
            Loading Reading Test...
          </div>
        </div>
      </div>
    );
  }

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

  const currentPassage = testData.passages.find(p => p.id === activePassageId);

  // ═══════════════════════════════════════════════════════════════
  // MOBILE EXAM MODE — Phone-optimized scaffold (PRD-0043)
  // ═══════════════════════════════════════════════════════════════

  if (isMobileExamMode) {
    return (
      <>
        {/* Connection Monitor (always active) */}
        <ConnectionMonitor
          sessionCode={sessionCode}
          onConnectionChange={(connected) => {
            if (!connected && !testSubmitted) {
              console.log('Connection lost during test');
            }
          }}
        />

        {/* Connection Status Indicator */}
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

        {/* Waiting/Paused Overlay (renders above scaffold) */}
        <TestWaitingOverlay
          sessionStatus={sessionStatus}
          isPaused={isPaused}
          sessionCode={sessionCode}
        />

        {/* Mobile Reading Exam Scaffold */}
        <MobileReadingExamScaffold
          mode="live"
          passages={testData.passages.map((p, i) => ({ id: p.id, title: p.title || `Passage ${i + 1}` }))}
          questions={displayQuestions}
          totalQuestions={testData.questionCount || displayQuestions.length}
          activePassageId={activePassageId || ''}
          onPassageChange={setActivePassageId}
          currentPassage={currentPassage}
          PassageRendererComponent={PassageRenderer}
          answers={answers}
          onAnswerChange={(testSubmitted || isLocked) ? () => {} : handleAnswerChange}
          activeQuestionNumber={currentQuestionNumber}
          onQuestionClick={goToQuestion}
          timeRemaining={timeRemaining}
          formatTime={formatTime}
          testSubmitted={testSubmitted}
          isSubmitting={false}
          questionResults={mergedQuestionResults}
          onManualSubmit={handleSubmit}
          onAutoSubmit={() => { submitTestRef.current?.(true); }}
          isConnected={isConnected}
          sessionStatus={sessionStatus}
          isPaused={isPaused}
          fontSize={fontSize}
          lineSpacing={lineSpacing}
          highlighterActive={false} // FR-99/100: suppress highlighter on mobile
          highlightColor={highlightColor}
          clearHighlightsTrigger={clearHighlightsTrigger}
          questionSheetOpen={false}
          onOpenQuestionSheet={() => {}}
          onCloseQuestionSheet={() => {}}
          reviewSummaryOpen={false}
          onOpenReviewSummary={() => {}}
          onCloseReviewSummary={() => {}}
          antiSelectClass={antiCheatConfig?.detectCopyPaste ? 'anti-select' : undefined}
        />

        {/* Re-marking Modal (Generic) */}
        <ReMarkingModal
          show={showReMarkModal}
          reMarkingData={reMarkingData}
          totalQuestions={testData?.questionCount || 0}
          onClose={() => setShowReMarkModal(false)}
        />

        {/* PRD-0019: Time Up Overlay */}
        {showTimeUpOverlay && (
          <TimeUpOverlay
            onComplete={() => {
              console.log('⏰ [PRD-0019] Grace period complete, auto-submitting...');
            }}
            countdownSeconds={gracePeriodRemaining}
          />
        )}
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // DESKTOP/TABLET UI RENDER (existing layout)
  // ═══════════════════════════════════════════════════════════════

  return (
    <div
      ref={containerRef}
      className={antiCheatConfig?.detectCopyPaste ? 'anti-select' : undefined}
      style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#f8fafc',
      position: 'relative'
    }}>
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

      {/* Reading Test Header (IELTS CBT Style) */}
      <ReadingHeader
        testType={testData.type}
        testSkill={testData.skill}
        studentName={session?.studentName || sessionService.getPlayerName() || 'Student'}
        timeRemaining={timeRemaining}
        formatTime={formatTime}
        sessionStatus={sessionStatus}
        isPaused={isPaused}
        testSubmitted={testSubmitted}
      />

      {/* PRD-0019: Extra Time Banner */}
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 2rem' }}>
        <ExtraTimeBanner
          isInExtraTime={isInExtraTime}
          formattedTime={formatTime(timeRemaining)}
        />
      </div>

      {/* Two-column resizable layout (Generic) */}



      {/* Two-column resizable layout (Generic) */}
      <TwoColumnLayout
        leftColumn={
          /* ═══════════════════════════════════════════════════════════════
           * LEFT COLUMN: READING PASSAGES (Reading-Specific)
           * ═══════════════════════════════════════════════════════════════ */
          <div style={{
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
          }}>
            {/* Passage Controls Header (Reading-Specific) */}
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

            {/* Passage Content (Reading-Specific) */}
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
          /* ═══════════════════════════════════════════════════════════════
           * RIGHT COLUMN: QUESTIONS PANEL (Generic - used by all skills)
           * ═══════════════════════════════════════════════════════════════ */
          <IELTSQuestionsPanel
            questions={displayQuestions}
            currentPassageId={activePassageId}
            answers={answers}
            onAnswerChange={(testSubmitted || isLocked) ? () => { } : handleAnswerChange} // PRD-0019: Disable during grace period
            activeQuestionNumber={currentQuestionNumber}
            onQuestionClick={goToQuestion}
            testSubmitted={testSubmitted}
            questionResults={mergedQuestionResults}
            partIndex={testData.passages.findIndex(p => p.id === activePassageId)}
            skill="reading"
          />
        }
      />

      {/* Floating Navigation Arrows (Inspera Style) */}
      {!testSubmitted && (
        <div style={{
          position: 'absolute',
          right: '30px',
          bottom: '75px',
          display: 'flex',
          gap: '8px',
          zIndex: 999,
        }}>
          {(() => {
            const currentQuestionIndex = activePassageQuestions.findIndex(
              (question) => question.number === currentQuestionNumber,
            );
            const previousQuestion = currentQuestionIndex > 0
              ? activePassageQuestions[currentQuestionIndex - 1]
              : null;
            const nextQuestion = currentQuestionIndex >= 0
              ? activePassageQuestions[currentQuestionIndex + 1]
              : null;

            return (
              <>
          <button
            onClick={() => {
              if (previousQuestion) {
                goToQuestion(previousQuestion.number);
              }
            }}
            disabled={!previousQuestion}
            style={{
              width: '45px',
              height: '45px',
              background: '#374151',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: previousQuestion ? 'pointer' : 'not-allowed',
              opacity: previousQuestion ? 1 : 0.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
            }}
          >
            ←
          </button>
          <button
            onClick={() => {
              if (nextQuestion) {
                goToQuestion(nextQuestion.number);
              }
            }}
            disabled={!nextQuestion}
            style={{
              width: '45px',
              height: '45px',
              background: '#000000',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: nextQuestion ? 'pointer' : 'not-allowed',
              opacity: nextQuestion ? 1 : 0.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
            }}
          >
            →
          </button>
              </>
            );
          })()}
        </div>
      )}

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

      {/* Re-marking Modal (Generic) */}
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

/**
 * Reading Test Page - Wrapped with Error Boundary
 * Main export for the Reading Test Page
 */
export const ReadingTestPage: React.FC = () => {
  const { sessionCode } = useParams<{ sessionCode: string }>();

  return (
    <TestErrorBoundary sessionCode={sessionCode}>
      <ReadingTestPageContent />
    </TestErrorBoundary>
  );
};

export default ReadingTestPage;
