/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  ⚠️  STUDENT VIEW DESIGN STANDARD v1.0 — ACTIVE               ║
 * ║                                                                 ║
 * ║  This file uses LEGACY styling (glassmorphism, #667eea, etc.)  ║
 * ║  that is DEPRECATED and scheduled for migration.                ║
 * ║                                                                 ║
 * ║  🚫 DO NOT copy styles from this file for new student pages.   ║
 * ║  ✅ Reference: src/pages/StudentDashboardPage.jsx               ║
 * ║  📖 Spec: documentation/design/student-view-design-standard.md ║
 * ║                                                                 ║
 * ║  BANNED patterns in this file (to be removed during migration): ║
 * ║  - #667eea / #764ba2 (purple gradients)                        ║
 * ║  - linear-gradient backgrounds                                  ║
 * ║  - .glass / .glass-card classes                                 ║
 * ║  - AppShell from @mantine/core                                  ║
 * ║  - Emoji navigation icons                                       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useNavigation } from '../hooks/useNavigation';
import { database } from '../services/firebase';
import { ref, onValue, update, get } from 'firebase/database';
import { calculateScore } from '../utils/scoring';
import { markTest } from '../services/autoMarking.service';
import { saveTestResult } from '../services/testResults.service';
import { deriveIeltsPassageResults } from '../services/ieltsPassageResults.service';
// import { useLog } from '../context/LogContext'; // DISABLED FOR TESTING
import SemicircleTimer from '../components/SemicircleTimer';
import StudentAnswerInput from '../components/StudentAnswerInput';
import { useIntegrityRefreshRequest } from '../hooks/test/useIntegrityRefreshRequest';
import { useTestIntegrity } from '../hooks/test/useTestIntegrity'; // PRD-0036
import { useAntiCopyPaste } from '../hooks/test/useAntiCopyPaste'; // PRD-0036
import { useFullscreenMode } from '../hooks/test/useFullscreenMode'; // PRD-0036 ISSUE-4
import { useBeforeUnloadWarning } from '../hooks/test/useBeforeUnloadWarning'; // PRD-0036 Task 10.2
import { toast } from '../components/modern/ToastNotification'; // PRD-0036

/**
 * StudentQuizPageNew - Enhanced with adaptive layout and all question types
 * Uses StudentAnswerInput component with useAdaptiveLayout hook
 * Supports: multiple-choice, multiple-select, matching, completion, diagram-labeling
 */

const FINAL_QUIZ_STATUSES = new Set(['waiting', 'completed', 'feedback', 'results']);

function getQuizQuestions(quiz) {
  return Array.isArray(quiz?.questions)
    ? quiz.questions
    : Object.keys(quiz?.questions || {})
        .sort((a, b) => Number(a) - Number(b))
        .map(key => quiz.questions[key]);
}

function getQuizTitle(quiz, gameSession) {
  return (
    quiz?.title
    || quiz?.metadata?.title
    || gameSession?.quizTitle
    || gameSession?.testTitle
    || gameSession?.quizId
    || 'Quiz'
  );
}

function getQuizType(quiz, gameSession) {
  return (
    quiz?.type
    || quiz?.metadata?.type
    || gameSession?.quizType
    || 'quiz'
  );
}

function getQuizSkill(quiz, gameSession) {
  return (
    quiz?.skill
    || quiz?.metadata?.skill
    || gameSession?.quizSkill
    || 'General'
  );
}

function getQuizDuration(quiz, gameSession) {
  return (
    quiz?.duration
    || quiz?.metadata?.duration
    || gameSession?.duration
    || gameSession?.timer?.duration
    || 0
  );
}

function getQuizTimeElapsed(gameSession, quiz, player) {
  const completedAt = player?.completedAt || player?.submittedAt || Date.now();
  const startedAt =
    gameSession?.startTime
    || gameSession?.startedAt
    || gameSession?.quizStartedAt
    || null;

  if (
    typeof startedAt === 'number'
    && startedAt > 0
    && typeof completedAt === 'number'
    && completedAt >= startedAt
  ) {
    return Math.max(0, Math.round((completedAt - startedAt) / 1000));
  }

  const fallbackDuration = getQuizDuration(quiz, gameSession);
  return Math.max(0, Number(fallbackDuration) * 60);
}

function extractAnswerValue(answerEntry) {
  if (answerEntry && typeof answerEntry === 'object' && 'answer' in answerEntry) {
    return answerEntry.answer;
  }

  return answerEntry;
}

function buildStudentAnswersForMarking(questions, savedAnswers, pendingQuestionIndex, pendingAnswer) {
  const studentAnswers = {};

  questions.forEach((question, index) => {
    const questionNumber = typeof question?.number === 'number' ? question.number : index + 1;
    const rawAnswer =
      savedAnswers?.[index]
      ?? savedAnswers?.[questionNumber]
      ?? savedAnswers?.[String(index)]
      ?? savedAnswers?.[String(questionNumber)];

    const answer = extractAnswerValue(rawAnswer);
    if (answer !== null && answer !== undefined && answer !== '') {
      studentAnswers[questionNumber] = {
        questionId: String(question?.id || `q${questionNumber}`),
        questionNumber,
        answer,
        timeSpent: rawAnswer?.timeSpent,
        timestamp: rawAnswer?.timestamp,
      };
    }
  });

  if (
    pendingQuestionIndex !== null
    && pendingQuestionIndex !== undefined
    && pendingAnswer !== null
    && pendingAnswer !== undefined
    && pendingAnswer !== ''
  ) {
    const pendingQuestion = questions[pendingQuestionIndex];
    if (pendingQuestion) {
      const questionNumber = typeof pendingQuestion?.number === 'number'
        ? pendingQuestion.number
        : pendingQuestionIndex + 1;
      studentAnswers[questionNumber] = {
        questionId: String(pendingQuestion?.id || `q${questionNumber}`),
        questionNumber,
        answer: pendingAnswer,
      };
    }
  }

  return studentAnswers;
}

function buildQuizResultContext(gameSessionId, gameSession, testTitle, duration) {
  const classId = gameSession?.linkedClassId || gameSession?.classId || null;
  const courseId = gameSession?.courseId || null;

  return {
    type: 'class_session',
    source: {
      type: 'class',
      id: classId || gameSession?.quizId || gameSessionId,
      name: testTitle,
      sessionCode: gameSessionId,
      classId,
      courseId,
      submissionId: gameSessionId,
    },
    sessionCode: gameSessionId,
    classId,
    courseId,
    configApplied: {
      timerMinutes: duration,
      feedbackTiming: 'after_completion',
      source: 'material_default',
    },
  };
}

const StudentQuizPageNew = () => {
  const { gameSessionId } = useParams();
  const { navigateTo, handleSessionChange } = useNavigation('student');
  // const { addLog } = useLog(); // DISABLED FOR TESTING
  const addLog = useCallback(() => {}, []); // No-op function
  const [gameSession, setGameSession] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const selectedAnswerRef = useRef(''); // Store answer synchronously
  const hasSubmittedRef = useRef(false);
  const currentQuestionIndexRef = useRef(null);
  const containerRef = useRef(null); // PRD-0036: Anti-cheat scope
  const flushIntegrityRef = useRef(null);
  const canonicalResultGuardRef = useRef({
    inFlight: false,
    resultId: null,
  });
  const terminalStatusHandledRef = useRef(false);

  // PRD-0036 Task 10.2: Warn student before closing/refreshing during active quiz
  useBeforeUnloadWarning({ enabled: gameSession?.status === 'in-progress' });

  // Listen to game session
  useEffect(() => {
    const gameSessionRef = ref(database, `game_sessions/${gameSessionId}`);
    const unsubscribe = onValue(gameSessionRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        navigateTo('LOGIN', {}, { reason: 'quiz_session_not_found', replace: true });
        return;
      }
      setGameSession(data);
    });
    return () => unsubscribe();
  }, [gameSessionId, navigateTo]);

  // Load quiz
  useEffect(() => {
    if (gameSession?.quizId && !quiz) {
      const quizRef = ref(database, `quizzes/${gameSession.quizId}`);
      get(quizRef).then((snapshot) => {
        if (snapshot.exists()) {
          const quizData = snapshot.val();
          const questionsArray = Array.isArray(quizData.questions)
            ? quizData.questions
            : Object.keys(quizData.questions || {})
                .sort((a, b) => Number(a) - Number(b))
                .map(key => quizData.questions[key]);
          
          addLog('Quiz loaded');
          setQuiz(quizData);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameSession, quiz]);

  const materializeCanonicalQuizResult = useCallback(async () => {
    if (!gameSessionId || !gameSession || !quiz) {
      return null;
    }

    const playerId = typeof window !== 'undefined' ? sessionStorage.getItem('playerId') : null;
    if (!playerId) {
      return null;
    }

    if (canonicalResultGuardRef.current.resultId) {
      return canonicalResultGuardRef.current.resultId;
    }

    if (canonicalResultGuardRef.current.inFlight) {
      return null;
    }

    const player = gameSession.players?.[playerId];
    if (!player) {
      return null;
    }

    canonicalResultGuardRef.current.inFlight = true;

    try {
      const testId = gameSession.quizId || '';
      const latestResultId = player.latestResultId || null;

      if (latestResultId) {
        const latestResultSnap = await get(ref(database, `test_results/${latestResultId}`));
        if (latestResultSnap.exists()) {
          const latestResult = latestResultSnap.val();
          if (
            latestResult?.studentId === playerId
            && latestResult?.sessionCode === gameSessionId
            && latestResult?.testId === testId
          ) {
            canonicalResultGuardRef.current.resultId = latestResultId;
            return latestResultId;
          }
        }
      }

      const studentResultsSnap = await get(ref(database, `test_results_by_student/${playerId}`));
      if (studentResultsSnap.exists()) {
        const studentResults = studentResultsSnap.val() || {};
        const existingResultEntry = Object.entries(studentResults).find(([, entry]) => (
          entry
          && entry.sessionCode === gameSessionId
          && entry.testId === testId
        ));

        if (existingResultEntry) {
          const [existingResultId] = existingResultEntry;
          canonicalResultGuardRef.current.resultId = existingResultId;
          if (!player.latestResultId) {
            await update(ref(database, `game_sessions/${gameSessionId}/players/${playerId}`), {
              latestResultId: existingResultId,
            });
          }
          return existingResultId;
        }
      }

      const questions = getQuizQuestions(quiz);
      const currentQuestionIndex = gameSession.currentQuestionIndex || 0;
      const currentQuestion = questions[currentQuestionIndex];
      const savedAnswers = { ...(player.answers || {}) };
      const pendingAnswer = selectedAnswerRef.current;
      const shouldMergePendingAnswer = Boolean(
        pendingAnswer && !hasSubmittedRef.current && currentQuestion
      );

      if (shouldMergePendingAnswer) {
        await submitAnswer({
          playerId,
          questionIndex: currentQuestionIndex,
          answerToSubmit: pendingAnswer,
          currentPlayer: player,
          question: currentQuestion,
          logPrefix: 'finalizeQuizAttempt',
        });
      }

      const studentAnswers = buildStudentAnswersForMarking(
        questions,
        savedAnswers,
        shouldMergePendingAnswer ? currentQuestionIndex : null,
        shouldMergePendingAnswer ? pendingAnswer : null,
      );
      const markingResult = markTest(questions, studentAnswers);
      const testTitle = getQuizTitle(quiz, gameSession);
      const duration = getQuizDuration(quiz, gameSession);
      const timeElapsed = getQuizTimeElapsed(gameSession, quiz, player);
      const testType = getQuizType(quiz, gameSession);
      const testSkill = getQuizSkill(quiz, gameSession);
      const resultContext = buildQuizResultContext(
        gameSessionId,
        gameSession,
        testTitle,
        duration,
      );

      const isIeltsReadingOrListening =
        String(testType || '').toLowerCase().includes('ielts')
        && ['reading', 'listening'].includes(String(testSkill || '').toLowerCase());

      let ieltsData;
      if (isIeltsReadingOrListening) {
        try {
          const mappedQuestions = questions.map((q) => ({
            questionNumber: q.number,
            passageId: q.passageId ?? q.passage ?? undefined,
            sectionId: q.sectionId ?? (q.sectionNumber !== undefined && q.sectionNumber !== null ? String(q.sectionNumber) : undefined),
            passageName: q.passageName ?? q.passageTitle ?? (q.passage ? String(q.passage) : undefined),
            sectionName: q.sectionName ?? (q.sectionNumber !== undefined && q.sectionNumber !== null ? `Part ${q.sectionNumber}` : undefined),
          }));
          const passageResults = deriveIeltsPassageResults(mappedQuestions, markingResult.questionResults || []);
          if (passageResults.length > 0) {
            ieltsData = { passageResults };
          }
        } catch (ieltsErr) {
          console.warn('[StudentQuizPageNew] Failed to derive IELTS passage results:', ieltsErr);
        }
      }

      const resultId = await saveTestResult(
        gameSessionId,
        testId,
        playerId,
        player.name || player.playerName || player.displayName || 'Student',
        markingResult,
        {
          title: testTitle,
          type: testType,
          skill: testSkill,
          duration,
        },
        timeElapsed,
        undefined,
        false,
        undefined,
        undefined,
        resultContext,
        undefined,
        ieltsData,
      );

      canonicalResultGuardRef.current.resultId = resultId;

      await update(ref(database, `game_sessions/${gameSessionId}/players/${playerId}`), {
        latestResultId: resultId,
      });

      return resultId;
    } catch (error) {
      canonicalResultGuardRef.current.resultId = null;
      throw error;
    } finally {
      canonicalResultGuardRef.current.inFlight = false;
    }
  }, [gameSession, gameSessionId, quiz]);

  const submitAnswer = useCallback(async ({
    playerId,
    questionIndex,
    answerToSubmit,
    currentPlayer,
    question,
    logPrefix,
    markAsSubmitted = true,
  }) => {
    if (flushIntegrityRef.current) {
      await flushIntegrityRef.current();
    }

    const score = answerToSubmit ? calculateScore(question, answerToSubmit) : 0;
    const isCorrect = score === 10;

    addLog(`${logPrefix} - Score: ${score}, Correct: ${isCorrect}`);

    const playerRef = ref(database, `game_sessions/${gameSessionId}/players/${playerId}`);
    await update(playerRef, {
      score: (currentPlayer?.score || 0) + score,
      answers: {
        ...(currentPlayer?.answers || {}),
        [questionIndex]: {
          answer: answerToSubmit || null,
          isCorrect,
          score,
          timeSpent: 0
        }
      }
    });

    if (markAsSubmitted) {
      hasSubmittedRef.current = true;
    }
    addLog(`${logPrefix} - Answer submitted`);
  }, [addLog, gameSessionId]);

  // Reset when question changes
  useEffect(() => {
    if (gameSession && quiz) {
      const newIndex = gameSession.currentQuestionIndex || 0;
      const oldIndex = currentQuestionIndexRef.current;
      
      if (oldIndex !== null && oldIndex !== newIndex) {
        addLog(`Question changed from ${oldIndex} to ${newIndex}`);
        addLog(`Previous answer: ${selectedAnswerRef.current}`);
        
        // 🔧 FIX: Submit answer for OLD question BEFORE resetting
        if (selectedAnswerRef.current && !hasSubmittedRef.current) {
          const playerId = sessionStorage.getItem('playerId');
          if (playerId && gameSession.players && gameSession.players[playerId]) {
            const questions = Array.isArray(quiz.questions) 
              ? quiz.questions 
              : Object.keys(quiz.questions || {})
                  .sort((a, b) => Number(a) - Number(b))
                  .map(key => quiz.questions[key]);
            const question = questions[oldIndex]; // Use OLD index
            
            if (question) {
              const answerToSubmit = selectedAnswerRef.current;
              const currentPlayer = gameSession.players[playerId];
              
              addLog(`Auto-submitting answer for Q${oldIndex}: ${typeof answerToSubmit === 'object' ? JSON.stringify(answerToSubmit) : answerToSubmit}`);

              submitAnswer({
                playerId,
                questionIndex: oldIndex,
                answerToSubmit,
                currentPlayer,
                question,
                logPrefix: `handleQuestionChange Q${oldIndex}`,
                markAsSubmitted: false,
              }).catch((error) => {
                console.error('[StudentQuizPageNew] Failed to auto-submit previous answer:', error);
              });
            }
          }
        }
        
        // Now reset for new question
        setSelectedAnswer('');
        selectedAnswerRef.current = '';
        hasSubmittedRef.current = false;
        addLog(`Reset for new question ${newIndex}`);
        currentQuestionIndexRef.current = newIndex;
      } else if (oldIndex === null) {
        // First load
        currentQuestionIndexRef.current = newIndex;
      }
    }
  }, [gameSession, quiz, addLog, submitAnswer]);

  // Handle timer end - submit current answer
  const handleTimeUp = useCallback(async () => {
    addLog('handleTimeUp called');
    if (hasSubmittedRef.current) {
      addLog('handleTimeUp returned early because hasSubmittedRef.current is true');
      return;
    }
    
    const playerId = sessionStorage.getItem('playerId');
    if (!playerId) {
      addLog('handleTimeUp - ERROR: No playerId in sessionStorage');
      return;
    }
    if (!gameSession) {
      addLog('handleTimeUp - ERROR: No gameSession');
      return;
    }
    if (!gameSession.players) {
      addLog('handleTimeUp - ERROR: gameSession.players is null/undefined');
      return;
    }
    if (!gameSession.players[playerId]) {
      addLog(`handleTimeUp - ERROR: Player ${playerId} not found in gameSession.players`);
      addLog(`Available players: ${Object.keys(gameSession.players).join(', ')}`);
      return;
    }
    if (!quiz) {
      addLog('handleTimeUp - ERROR: No quiz data');
      return;
    }

    const questionIndex = gameSession.currentQuestionIndex || 0;
    
    // Handle both array and object format for questions
    const questions = Array.isArray(quiz.questions) 
      ? quiz.questions 
      : Object.keys(quiz.questions || {})
          .sort((a, b) => Number(a) - Number(b))
          .map(key => quiz.questions[key]);
    const question = questions[questionIndex];
    
    // Use ref value instead of state (eliminates timing issues)
    const answerToSubmit = selectedAnswerRef.current;
    
    const submitDisplay = typeof answerToSubmit === 'object' ? JSON.stringify(answerToSubmit) : answerToSubmit;
    addLog(`handleTimeUp - Submitting answer: ${submitDisplay}`);
    
    const currentPlayer = gameSession.players[playerId];

    await submitAnswer({
      playerId,
      questionIndex,
      answerToSubmit,
      currentPlayer,
      question,
      logPrefix: 'handleTimeUp',
    });
  }, [addLog, gameSession, gameSessionId, quiz, submitAnswer]);

  // Handle answer selection - now using direct click instead of radio onChange
  const handleAnswerSelect = (answer) => {
    // Prevent answer changes after submission
    if (hasSubmittedRef.current) {
      addLog('handleAnswerSelect blocked - answer already submitted');
      return;
    }
    
    const answerDisplay = typeof answer === 'object' ? JSON.stringify(answer) : answer;
    addLog(`handleAnswerSelect called with answer: ${answerDisplay}`);
    
    // Store in ref immediately (synchronous, no timing issues)
    selectedAnswerRef.current = answer;
    
    // Also update state for UI
    setSelectedAnswer(answer);
    
    const storedDisplay = typeof selectedAnswerRef.current === 'object' ? JSON.stringify(selectedAnswerRef.current) : selectedAnswerRef.current;
    addLog(`Answer stored in ref: ${storedDisplay}`);
  };

  // ── PRD-0036: Anti-Cheat Integration (Task 6.3) ─────────────────────────
  const antiCheatConfig = gameSession?.antiCheatConfig || null;
  const playerId = typeof window !== 'undefined' ? sessionStorage.getItem('playerId') : null;

  const {
    addEvent,
    warningLevel,
    warningMessage,
    shouldAutoSubmit,
    flushEvents,
  } = useTestIntegrity({
    config: antiCheatConfig,
    context: 'session',
    surface: 'student_quiz',
    sessionCode: gameSessionId,
    studentId: playerId || '',
    testId: gameSession?.quizId || '',
  });

  flushIntegrityRef.current = () => flushEvents('quiz_answer_write');

  useIntegrityRefreshRequest({
    enabled: gameSession?.status === 'in-progress',
    requestTimestamp: gameSession?.integrityRefreshRequestedAt ?? null,
    onRefreshRequested: () => flushEvents('teacher_refresh'),
  });

  useAntiCopyPaste({
    enabled: antiCheatConfig?.detectCopyPaste || false,
    containerRef,
    onEvent: addEvent,
    detectRightClick: antiCheatConfig?.detectRightClick || false,
    detectKeyboardShortcuts: antiCheatConfig?.detectKeyboardShortcuts || false,
  });

  // PRD-0036 ISSUE-4: Fullscreen mode enforcement for quiz
  useFullscreenMode({
    enabled: antiCheatConfig?.requireFullscreen || false,
    onFullscreenExit: addEvent,
  });

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
    if (shouldAutoSubmit) {
      handleTimeUp().catch((error) => {
        console.error('[StudentQuizPageNew] Auto-submit failed:', error);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoSubmit, handleTimeUp]);

  useEffect(() => {
    if (!gameSession?.status || !gameSessionId) {
      return;
    }

    if (gameSession.status === 'in-progress') {
      canonicalResultGuardRef.current.resultId = null;
      terminalStatusHandledRef.current = false;
      return;
    }

    if (FINAL_QUIZ_STATUSES.has(gameSession.status) && !quiz) {
      if (!gameSession.quizId) {
        handleSessionChange(gameSession.status, gameSessionId);
      }
      return;
    }

    if (!FINAL_QUIZ_STATUSES.has(gameSession.status)) {
      handleSessionChange(gameSession.status, gameSessionId);
      return;
    }

    if (terminalStatusHandledRef.current) {
      return;
    }

    terminalStatusHandledRef.current = true;
    let cancelled = false;

    const finalizeAndNavigate = async () => {
      try {
        await materializeCanonicalQuizResult();
      } catch (error) {
        console.error('[StudentQuizPageNew] Failed to finalize canonical quiz result:', error);
      } finally {
        if (!cancelled) {
          handleSessionChange(gameSession.status, gameSessionId);
        }
      }
    };

    finalizeAndNavigate();

    return () => {
      cancelled = true;
    };
  }, [gameSession, gameSessionId, handleSessionChange, materializeCanonicalQuizResult]);

  if (!gameSession || !quiz) {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        fontSize: '2rem'
      }}>
        Loading...
      </div>
    );
  }

  // Handle both array and object format for questions
  const questions = Array.isArray(quiz.questions) 
    ? quiz.questions 
    : Object.keys(quiz.questions || {})
        .sort((a, b) => Number(a) - Number(b))
        .map(key => quiz.questions[key]);
  const currentQuestion = questions[gameSession.currentQuestionIndex || 0];

  return (
    <div ref={containerRef} style={{
      height: '100vh',
      width: '100vw',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      top: 0,
      left: 0,
      overflow: 'hidden'
    }} className={antiCheatConfig?.detectCopyPaste ? 'anti-select' : ''}>
      {/* Timer */}
      {currentQuestion?.timer && gameSession.timer && (
        <SemicircleTimer
          key={gameSession.currentQuestionIndex}
          timerState={gameSession.timer}
          onTimeUp={handleTimeUp}
        />
      )}

      {/* Answer Input Area */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        paddingTop: currentQuestion?.timer ? '8rem' : '2rem',
        overflow: 'auto'
      }}>
        <div style={{
          width: '100%',
          maxWidth: '1200px',
          height: '100%',
          maxHeight: '800px'
        }}>
          <StudentAnswerInput
            question={currentQuestion}
            onAnswerSubmit={handleAnswerSelect}
            currentAnswer={selectedAnswer}
            disabled={hasSubmittedRef.current}
          />
        </div>
      </div>

      {/* Status Indicator */}
      {hasSubmittedRef.current && (
        <div style={{
          position: 'fixed',
          bottom: '2rem',
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(39, 174, 96, 0.95)',
          color: 'white',
          padding: '1rem 2rem',
          borderRadius: '2rem',
          fontSize: '1.2rem',
          fontWeight: '600',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          zIndex: 20
        }}>
          ✓ Answer Submitted
        </div>
      )}
    </div>
  );
};

export default StudentQuizPageNew;
