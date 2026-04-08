/**
 * useTestSubmission Hook
 * Handles test submission and marking logic
 * 
 * PRD-0019: Added hasCompletedTest flag and input locking for grace period
 */

import { useState, useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { sessionService } from '../../services/sessionService';
import { calculateIELTSReadingBandScore } from '../../config/scoring.config';
// @ts-ignore - Firebase is a .js file
import { database } from '../../services/firebase';
// @ts-ignore - Firebase is a .js file
import { ref, update, get } from 'firebase/database';
import { saveTestResult } from '../../services/testResults.service';
import { deriveIeltsPassageResults } from '../../services/ieltsPassageResults.service';
import { sendResultNotification } from '../../services/emailNotification.service';
import { auth } from '../../services/firebase';
import { scoreQuestion } from '../../services/autoMarking.service';
import type { IntegrityReport } from '../../types/integrity.types'; // PRD-0036

interface Question {
  number: number;
  type: string;
  answer: string | string[] | Record<string, string>;
  [key: string]: any;
}

interface TestData {
  id: string;
  duration: number;
  questions: Question[];
  questionCount: number;
  /** PRD-0019: Test skill for redirect logic */
  skill?: 'Listening' | 'Reading' | 'Writing' | string;
}

interface StudentAnswers {
  [questionNumber: number]: string | string[] | Record<string, string>;
}

interface TestResults {
  correctAnswers: number;
  totalQuestions: number;
  totalScore?: number;
  percentage?: number;
  bandScore?: number; // IELTS band score (0.5 - 9.0)
  questionResults: Record<number, boolean>;
}

interface TestSession {
  testId: string;
  sessionCode: string;
  studentName: string;
  startTime: number;
  answers: StudentAnswers;
  isSubmitted: boolean;
}

interface ClassAssignmentLocationState {
  classId?: string;
  assignmentId?: string;
}

interface UseTestSubmissionOptions {
  testData: TestData | null;
  session: TestSession | null;
  sessionCode: string | undefined;
  answers: StudentAnswers;
  timeRemaining: number;
  skipConfirm?: boolean;
  /** PRD-0036: Optional integrity report to attach on submission */
  integrityReport?: IntegrityReport | null;
  /**
   * PRD-0036 Task 9.4: Ref to original questions WITH answer keys.
   * Used for grading instead of testData.questions (which may be stripped).
   */
  questionsWithAnswersRef?: MutableRefObject<Question[] | null>;
}

interface UseTestSubmissionReturn {
  isSubmitting: boolean;
  testSubmitted: boolean;
  testResults: TestResults | null;
  loadedAnswers: StudentAnswers | null;
  handleSubmit: (isAutoSubmit?: boolean) => Promise<void>;
  markTest: () => TestResults;
  /** PRD-0019: Whether inputs should be locked (during grace period) */
  isLocked: boolean;
  /** PRD-0019: Lock all inputs (called when grace period starts) */
  lockInputs: () => void;
}

export const useTestSubmission = ({
  testData,
  session,
  sessionCode,
  answers,
  timeRemaining,
  skipConfirm = false,
  integrityReport,
  questionsWithAnswersRef,
}: UseTestSubmissionOptions): UseTestSubmissionReturn => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testSubmitted, setTestSubmitted] = useState(false);
  const [testResults, setTestResults] = useState<TestResults | null>(null);
  const [loadedAnswers, setLoadedAnswers] = useState<StudentAnswers | null>(null);
  const [isLocked, setIsLocked] = useState(false); // PRD-0019: Input locking during grace period
  const hasCheckedExistingSubmission = useRef(false);
  const classAssignmentState = ((location.state || null) as ClassAssignmentLocationState | null) || null;

  /**
   * Transform answers from Firebase format to UI format
   * Firebase stores: { questionNum: { answer: value, timestamp: ... } }
   * UI expects: { questionNum: value }
   */
  const transformAnswersFromFirebase = (firebaseAnswers: Record<string, any>): StudentAnswers => {
    const transformed: StudentAnswers = {};

    Object.entries(firebaseAnswers).forEach(([questionNum, data]) => {
      // If data has an 'answer' property, extract it (auto-save format)
      // Otherwise use the data directly (old format or direct submission)
      if (data && typeof data === 'object' && 'answer' in data) {
        transformed[parseInt(questionNum)] = data.answer;
      } else {
        transformed[parseInt(questionNum)] = data;
      }
    });

    return transformed;
  };

  /**
   * Mark the test and calculate results
   */
  // Check for existing submission AND load in-progress answers on component mount
  useEffect(() => {
    if (!sessionCode || !testData || hasCheckedExistingSubmission.current) return;

    const checkExistingSubmission = async () => {
      try {
        const playerId = sessionService.getPlayerId();
        if (!playerId) return;

        const playerRef = ref(database, `game_sessions/${sessionCode}/players/${playerId}`);
        const snapshot = await get(playerRef);

        if (snapshot.exists()) {
          const playerData = snapshot.val();
          // Only log once when actually checking, not on every re-render
          if (!hasCheckedExistingSubmission.current) {
            console.log('Checking existing data for player:', playerId);
          }

          // Check if player has already submitted - must have submittedAt timestamp
          const hasSubmitted = playerData.submittedAt && typeof playerData.submittedAt === 'number' && playerData.submittedAt > 0;

          if (hasSubmitted) {
            console.log('✅ Student has already submitted this test at:', new Date(playerData.submittedAt));
            setTestSubmitted(true);

            // Load submitted answers and calculate results
            if (playerData.answers && Object.keys(playerData.answers).length > 0) {
              console.log('Loading submitted answers:', Object.keys(playerData.answers).length, 'questions');
              const transformedAnswers = transformAnswersFromFirebase(playerData.answers);
              setLoadedAnswers(transformedAnswers);
              const results = markTestWithAnswers(transformedAnswers);
              setTestResults(results);
            } else {
              console.warn('Submission exists but no answers found, marking with empty answers');
              setLoadedAnswers({});
              const results = markTestWithAnswers({});
              setTestResults(results);
            }
          } else {
            // Test not submitted yet - check for in-progress answers from auto-save
            console.log('📝 Test not submitted yet, checking for in-progress answers...');

            if (playerData.answers && Object.keys(playerData.answers).length > 0) {
              const transformedAnswers = transformAnswersFromFirebase(playerData.answers);
              const answerCount = Object.keys(transformedAnswers).length;
              console.log(`✅ Loaded ${answerCount} in-progress answer(s) from Firebase`);
              setLoadedAnswers(transformedAnswers);
            } else {
              console.log('No in-progress answers found - starting fresh');
            }
          }
        } else {
          console.log('No player data found in Firebase for this session');
        }

        hasCheckedExistingSubmission.current = true;
      } catch (error) {
        console.error('Error checking existing submission:', error);
      }
    };

    checkExistingSubmission();
  }, [sessionCode, testData]);

  /**
   * Mark test with specific answers
   * Used for both loading existing submissions and marking current answers
   */
  const markTestWithAnswers = (submittedAnswers: StudentAnswers): TestResults => {
    if (!testData) {
      return { correctAnswers: 0, totalQuestions: 0, questionResults: {} };
    }

    let correctAnswers = 0;
    const questionResults: Record<number, boolean> = {};

    // PRD-0036 Task 9.4: Prefer original questions (with answer keys) for grading
    const gradingQuestions = questionsWithAnswersRef?.current ?? testData.questions;

    gradingQuestions.forEach(question => {
      const studentAnswer = submittedAnswers[question.number];

      // Delegate to the robust autoMarking service
      // We pass the full question object (including acceptableAnswers, options, etc.)
      // and adapt the studentAnswer to what scoreQuestion expects
      const result = scoreQuestion(
        question as any,
        studentAnswer === undefined || studentAnswer === null ? '' : String(studentAnswer)
      );

      const isCorrect = result.isCorrect;

      questionResults[question.number] = isCorrect;
      if (isCorrect) correctAnswers++;
    });

    const percentage = Math.round((correctAnswers / testData.questions.length) * 100);
    const bandScore = calculateIELTSReadingBandScore(correctAnswers, testData.questions.length);

    return {
      correctAnswers,
      totalQuestions: testData.questions.length,
      questionResults,
      percentage,
      bandScore,
      totalScore: correctAnswers, // Can be enhanced with weighted scoring
    };
  };

  const markTest = (): TestResults => {
    return markTestWithAnswers(answers);
  };



  /**
   * Helper: Save detailed results to permanent storage
   * This is separate from the session state and persists after the session ends
   */
  const savePermanentResult = async (
    playerId: string,
    playerName: string,
    results: TestResults
  ): Promise<string | null> => {
    if (!testData || !sessionCode) return null;

    try {
      console.log('💾 Saving permanent test result...');

      // 1. Convert simple results to robust TestMarkingResult format required by storage service
      // This reconstructs the detailed marking data needed for the Results page

      // Map simplified answers to StudentAnswer objects
      const studentAnswers: Record<number, any> = {};
      testData.questions.forEach(q => {
        if (answers[q.number] !== undefined) {
          studentAnswers[q.number] = {
            questionId: String(q.id || q.number),
            questionNumber: q.number,
            answer: answers[q.number]
          };
        }
      });

      // Construct QuestionMarkingResult array from our local results
      const questionResultsList = testData.questions.map(q => {
        const isCorrect = results.questionResults[q.number] || false;
        // Determine score (simplified: 1 for correct, 0 for incorrect)
        const score = isCorrect ? 1 : 0;

        return {
          questionId: String(q.id || q.number),
          questionNumber: q.number,
          questionType: q.type as any,
          studentAnswer: answers[q.number] || '',
          correctAnswer: q.answer as any,
          isCorrect,
          score,
          maxScore: 1,
          feedback: isCorrect ? 'Correct' : 'Incorrect',
          partialCredit: false
        };
      });

      const markingResult: any = {
        totalScore: results.totalScore || results.correctAnswers,
        maxScore: results.totalQuestions, // Assuming 1 point per question
        percentage: results.percentage || 0,
        questionResults: questionResultsList,
        summary: {
          correct: results.correctAnswers,
          incorrect: results.totalQuestions - results.correctAnswers,
          partialCredit: 0,
          totalQuestions: results.totalQuestions
        },
        correct: results.correctAnswers,
        incorrect: results.totalQuestions - results.correctAnswers,
        partialCredit: 0,
        totalQuestions: results.totalQuestions,
        completedAt: Date.now()
      };

      // 2. Extract metadata
      // Try to get title from testData if available (it might be extended type)
      const testTitle = (testData as any).title || sessionCode + ' Test';
      const testType = (testData as any).type || 'reading'; // Default to reading
      const testSkill = (testData as any).skill || 'reading';

      // 3. Fetch session metadata (teacherId, courseId, moduleId, classId)
      let courseId: string | null = null;
      let moduleId: string | null = null;
      let classId: string | null = null;
      const assignmentId = classAssignmentState?.assignmentId || null;
      const fallbackClassId = classAssignmentState?.classId || null;

      try {
        const sessionRef = ref(database, `game_sessions/${sessionCode}`);
        const sessionSnapshot = await get(sessionRef);
        if (sessionSnapshot.exists()) {
          const sessionData = sessionSnapshot.val();
          courseId = sessionData.courseId || null;
          moduleId = sessionData.moduleId || null;
          classId = sessionData.linkedClassId || fallbackClassId || null;

          // Record attendance if this session has module context
          if (courseId && classId && moduleId) {
            try {
              const { recordAttendance } = await import('../../services/attendanceService');

              // Record attendance for this module
              await recordAttendance(
                courseId,
                classId,
                moduleId,
                playerId,
                playerName,
                sessionCode
              );

              console.log(`✅ Attendance recorded for module ${moduleId}`);
            } catch (attendanceErr) {
              console.warn('Failed to record attendance:', attendanceErr);
              // Don't fail the submission if attendance recording fails
            }
          }
        }
      } catch (err) {
        console.warn('Could not fetch session metadata', err);
      }

      if (!classId && fallbackClassId) {
        classId = fallbackClassId;
      }

      const resultContext = {
        type: 'class_session' as const,
        source: {
          type: 'class' as const,
          id: sessionCode,
          name: testTitle,
          sessionCode,
          classId: classId || undefined,
          courseId: courseId || undefined,
        },
        sessionCode,
        classId: classId || undefined,
        courseId: courseId || undefined,
        assignmentId: assignmentId || undefined,
        configApplied: {
          timerMinutes: testData.duration,
          feedbackTiming: 'after_completion' as const,
          source: 'material_default' as const,
        },
      };

      // 4. Determine if guest
      const isGuest = !auth.currentUser && playerId.startsWith('guest_');

      // 5. Derive IELTS passage results for IELTS Reading/Listening only (PRD-0039 Task 2.1-2.2)
      const isIeltsReadingOrListening =
        String(testType).toLowerCase().includes('ielts') &&
        (String(testSkill).toLowerCase() === 'reading' ||
         String(testSkill).toLowerCase() === 'listening');

      let ieltsData: { passageResults: ReturnType<typeof deriveIeltsPassageResults> } | undefined;

      if (isIeltsReadingOrListening) {
        try {
          // Map Question[] (uses .number) to GradingQuestion[] (uses .questionNumber)
          const mappedQuestions = testData.questions.map((q: any) => ({
            questionNumber: q.number,
            passageId: q.passageId ?? q.passage ?? undefined,
            sectionId: q.sectionId ?? (q.sectionNumber !== undefined && q.sectionNumber !== null ? String(q.sectionNumber) : undefined),
            passageName: q.passageName ?? q.passageTitle ?? (q.passage ? String(q.passage) : undefined),
            sectionName: q.sectionName ?? (q.sectionNumber !== undefined && q.sectionNumber !== null ? `Part ${q.sectionNumber}` : undefined),
          }));
          const passageResults = deriveIeltsPassageResults(
            mappedQuestions,
            questionResultsList
          );
          // Task 2.3: Do not pass undefined fields into RTDB writes
          if (passageResults.length > 0) {
            ieltsData = { passageResults };
          }
        } catch (ieltsErr) {
          console.warn('Failed to derive IELTS passage results:', ieltsErr);
          // Non-blocking — still save the result
        }
      }

      // 6. Save to permanent storage with academic context
      const resultId = await saveTestResult(
        sessionCode,
        testData.id || sessionCode,
        playerId,
        playerName,
        markingResult,
        {
          title: testTitle,
          type: testType,
          skill: testSkill,
          duration: testData.duration
        },
        (testData.duration * 60) - timeRemaining,
        undefined,
        isGuest,
        undefined, // submissionContent (not applicable for auto-marked tests)
        // Pass academic context
        courseId || classId || moduleId ? {
          courseId: courseId || undefined,
          classId: classId || undefined,
          moduleId: moduleId || undefined
        } : undefined,
        // PRD-0041: Pass canonical class-session identifiers only; ownership resolves downstream
        resultContext,
        undefined, // thcsData (not applicable for session-based tests)
        ieltsData // PRD-0039: IELTS passage results
      );

      console.log('✅ Permanent result saved with ID:', resultId);

      try {
        await update(ref(database, `game_sessions/${sessionCode}/players/${playerId}`), {
          latestResultId: resultId,
          lastResultPersistedAt: Date.now(),
        });
      } catch (pointerErr) {
        console.warn('Failed to persist latestResultId pointer:', pointerErr);
      }

      // Link test result to attendance record if module context exists
      if (courseId && classId && moduleId && resultId) {
        try {
          const { linkTestResultToAttendance } = await import('../../services/attendanceService');
          await linkTestResultToAttendance(courseId, classId, moduleId, playerId, resultId);
          console.log('✅ Test result linked to attendance record');
        } catch (linkErr) {
          console.warn('Failed to link test result to attendance:', linkErr);
        }
      }

      if (classId && assignmentId && resultId) {
        try {
          const progressRef = ref(
            database,
            `classes/${classId}/students/${playerId}/assignments/${assignmentId}`,
          );
          const progressSnapshot = await get(progressRef);
          const existingProgress =
            progressSnapshot.exists() && progressSnapshot.val()
              ? (progressSnapshot.val() as Record<string, any>)
              : {};
          const elapsedSeconds = Math.max((testData.duration * 60) - timeRemaining, 0);
          const assignmentResultUpdate: Record<string, any> = {
            testAssignmentId: existingProgress.testAssignmentId || assignmentId,
            attemptNumber: existingProgress.attemptNumber || 1,
            status: existingProgress.status === 'graded' ? 'graded' : 'submitted',
            submittedAt: existingProgress.submittedAt || markingResult.completedAt,
            resultId,
            score: markingResult.totalScore,
            maxScore: markingResult.maxScore,
            percentage: markingResult.percentage,
          };

          if (existingProgress.timeSpent !== undefined) {
            assignmentResultUpdate.timeSpent = existingProgress.timeSpent;
          } else {
            assignmentResultUpdate.timeSpent = elapsedSeconds;
          }

          if (results.bandScore !== undefined) {
            assignmentResultUpdate.bandScore = results.bandScore;
          }

          await update(progressRef, assignmentResultUpdate);
          console.log(`✅ Result ${resultId} linked to class assignment ${assignmentId}`);
        } catch (assignmentLinkErr) {
          console.warn('Failed to link test result to class assignment:', assignmentLinkErr);
        }
      }

      // Check and award badges (only for authenticated users, not guests)
      if (!isGuest && resultId) {
        try {
          const { checkAndAwardBadges } = await import('../../services/badgeService');
          const badgeContext = {
            studentId: playerId,
            resultId: resultId,
            score: results.percentage || 0,
            courseId: courseId || undefined,
            moduleId: moduleId || undefined,
            testId: testData.id || sessionCode,
            submittedAt: Date.now(),
          };

          const earnedBadges = await checkAndAwardBadges(badgeContext);

          if (earnedBadges.length > 0) {
            console.log(`🏆 Earned ${earnedBadges.length} badge(s):`, earnedBadges.map(b => b.type));
            // Could show a toast notification here in the future
          }
        } catch (badgeErr) {
          console.warn('Failed to check/award badges:', badgeErr);
          // Don't fail the submission if badge checking fails
        }
      }

      return resultId;
    } catch (saveErr) {
      console.error('❌ Failed to save permanent result:', saveErr);
      // Don't throw - we still want the session submission to succeed even if permanent save fails
      return null;
    }
  };

  /**
   * Submit test
   * @param {boolean} isAutoSubmit - Whether this is an automatic submission due to time running out
   */
  const handleSubmit = async (isAutoSubmit = false): Promise<void> => {
    if (isSubmitting || !testData || !session || testSubmitted || !sessionCode) return;

    const unansweredCount = testData.questionCount - Object.keys(answers).length;

    // Only show confirm dialog for manual submissions with unanswered questions
    if (!isAutoSubmit && !skipConfirm && unansweredCount > 0) {
      const confirmed = window.confirm(
        `You have ${unansweredCount} unanswered question(s). Are you sure you want to submit?`
      );
      if (!confirmed) return;
    }

    setIsSubmitting(true);

    try {
      // Get student ID from sessionService
      const playerId = sessionService.getPlayerId();
      const playerName = sessionService.getPlayerName() || 'Student';

      if (!playerId) {
        throw new Error('Student ID not found');
      }

      // Mark the test first to get results
      const results = markTest();

      // Transform answers to include metadata (consistent with auto-save format)
      // This ensures teacher view sees proper answer data
      const transformedAnswers: Record<string, any> = {};
      Object.entries(answers).forEach(([questionNum, answer]) => {
        transformedAnswers[questionNum] = {
          answer: answer,
          timestamp: Date.now(),
          // timeSpent per question could be calculated here in future
        };
      });

      // NEW: Save permanent result record
      const resultId = await savePermanentResult(playerId, playerName, results);
      if (!resultId) {
        throw new Error('Failed to persist test result. Submission was not finalized.');
      }

      // Update player's answers and results in the session only after the
      // canonical result exists so the UI never advertises a result that failed to save.
      const playerRef = ref(database, `game_sessions/${sessionCode}/players/${playerId}`);
      const now = Date.now();
      await update(playerRef, {
        answers: transformedAnswers, // Use transformed format for consistency
        submittedAt: now,
        timeSpent: (testData.duration * 60) - timeRemaining,
        correctCount: results.correctAnswers,
        totalQuestions: results.totalQuestions,
        percentage: results.percentage,
        bandScore: results.bandScore,
        score: results.totalScore,
        maxScore: results.totalQuestions, // Assuming 1 point per question
        isSubmitted: true,
        // PRD-0019: Completion flags to prevent re-entry
        hasCompletedTest: true,
        completedAt: now,
        submittedBy: isAutoSubmit ? 'system-timeout' : 'student',
      });

      // PRD-0036: Write integrity report to player's integrity sub-path
      if (integrityReport) {
        try {
          const integrityRef = ref(database, `game_sessions/${sessionCode}/players/${playerId}/integrity`);
          await update(integrityRef, integrityReport);
          console.log('✅ [PRD-0036] Integrity report saved');
        } catch (integrityErr) {
          console.warn('[PRD-0036] Failed to save integrity report:', integrityErr);
        }
      }

      // Update local state
      setTestResults(results);
      setTestSubmitted(true);

      // Store submission info in sessionService for potential navigation
      sessionService.setTestSubmission({
        sessionCode,
        testId: testData.id,
        studentId: playerId,
        studentName: playerName,
        answers,
        results,
        startTime: session.startTime,
        submitTime: Date.now(),
        timeElapsed: (testData.duration * 60) - timeRemaining,
      });

      // Send email notification if authenticated
      const user = auth.currentUser;
      if (user && user.email) {
        const emailData: any = {
          studentName: playerName,
          percentage: results.percentage || 0,
          score: results.totalScore || results.correctAnswers,
          totalQuestions: results.totalQuestions,
          bandScore: results.bandScore,
          isGuest: false
        };
        const title = (testData as any).title || 'Test Result';
        sendResultNotification(user.email, emailData, title).catch(e => console.warn('Email failed', e));
      }

      // PRD-0019 + PRD-TEST-END-FLOW: Skill-based redirect logic
      // Auto-gradable tests: redirect to waiting lobby with results modal
      // This keeps students in the session loop, consistent with teacher-end flow
      const testSkill = testData.skill || '';
      if (testSkill === 'Listening' || testSkill === 'Reading') {
        console.log(`✅ [PRD-0019] Redirecting to waiting lobby with results modal for ${testSkill} test`);
        navigate(`/student-wait/${sessionCode}`, {
          replace: true,
          state: { showResults: Boolean(resultId), sessionCode, testId: testData.id },
        });
      } else if (testSkill === 'Writing') {
        // Writing tests: redirect to submission confirmation
        console.log('✅ [PRD-0019] Redirecting to submission confirmation for Writing test');
        navigate('/submission-complete', {
          state: {
            sessionCode,
            testId: testData.id,
            studentName: playerName
          }
        });
      } else {
        // Fallback for unknown skills: redirect to waiting lobby with results
        console.log(`✅ [PRD-0019] Redirecting to waiting lobby for unknown skill: ${testSkill}`);
        navigate(`/student-wait/${sessionCode}`, {
          replace: true,
          state: { showResults: true, sessionCode, testId: testData.id },
        });
      }
    } catch (err) {
      console.error('Error submitting test:', err);
      alert('Failed to submit test. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * PRD-0019: Lock all inputs during grace period
   * Called by useTestTimer when grace period starts
   */
  const lockInputs = () => {
    console.log('🔒 [PRD-0019] Locking all inputs during grace period');
    setIsLocked(true);
  };

  return {
    isSubmitting,
    testSubmitted,
    testResults,
    loadedAnswers,
    handleSubmit,
    markTest,
    isLocked,
    lockInputs,
  };
};
