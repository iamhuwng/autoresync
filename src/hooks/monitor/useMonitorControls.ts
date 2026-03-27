/**
 * useMonitorControls Hook
 * 
 * Custom hook for test session control actions in the teacher monitor interface.
 * Handles start, pause, resume, end, and time extension operations.
 * 
 * PRD-0019: Added completeBaseTest() and endFullSession() for timer expiry flow
 * 
 * @module hooks/monitor/useMonitorControls
 */

import { get, ref, update } from 'firebase/database';
// @ts-ignore - firebase.js is a JS file without type declarations
import { database } from '../../services/firebase';
import { useNavigation } from '../useNavigation';
import { TestSession, TestData } from './useMonitorSession'; // Import from local definition
import type { MasterAudioState } from '../../types/audio.types';
import type { AntiCheatConfig } from '../../types/integrity.types';
import { autoSubmitDisconnectedStudents, identifyDisconnectedStudents, identifyUnsubmittedStudents, autoSubmitAllUnsubmittedStudents } from '../../utils/monitor';
import { cacheSessionStudentSafeTestData } from '../../services/testStorage';
import type { ReviewReleaseState } from '../../types/releaseState.types';

function resolveCanonicalSessionTeacherId(session: TestSession | null): string | undefined {
  const createdByUserId = typeof (session as any)?.createdByUserId === 'string'
    ? (session as any).createdByUserId.trim()
    : '';
  if (createdByUserId) {
    return createdByUserId;
  }

  const createdBy = typeof (session as any)?.createdBy === 'string'
    ? (session as any).createdBy.trim()
    : '';
  if (createdBy) {
    return createdBy;
  }

  return undefined;
}

function extractMonitorTestQuestions(testRecord: any): any[] | null {
  if (!testRecord) {
    return null;
  }

  if (Array.isArray(testRecord.questions) && testRecord.questions.length > 0) {
    return testRecord.questions;
  }

  if (Array.isArray(testRecord.sections) && testRecord.sections.length > 0) {
    const sectionQuestions = testRecord.sections.flatMap((section: any) => section?.questions || []);
    return sectionQuestions.length > 0 ? sectionQuestions : null;
  }

  return null;
}

/** Per-student accommodation settings */
export interface StudentAccommodationInput {
  extraTime?: number;
  unlimitedReplays?: boolean;
  maxReplays?: number;
  fullAudioControls?: boolean;
}

/** PRD-0019: Result of completeBaseTest operation */
export interface CompleteBaseTestResult {
  submittedCount: number;
  accommodatedRemaining: number;
}

export interface MonitorControlsResult {
  startTest: (antiCheatConfig?: AntiCheatConfig) => Promise<void>;
  pauseTest: () => Promise<void>;
  endTest: () => Promise<void>;
  extendTime: (minutes: number) => Promise<void>;
  /** Listening test: broadcast pause all audio to students */
  pauseAllAudio: () => Promise<void>;
  /** Listening test: broadcast resume all audio to students */
  resumeAllAudio: () => Promise<void>;
  /** Listening test: broadcast skip to section for all students */
  skipToSection: (sectionNumber: number) => Promise<void>;
  /** Listening test: broadcast seek to position for all students */
  seekToPosition: (sectionNumber: number, position: number) => Promise<void>;
  /** Listening test: broadcast playback speed change to all students */
  setPlaybackSpeed: (speed: number) => Promise<void>;
  /** Set accommodation for a specific student */
  setStudentAccommodation: (studentId: string, accommodation: StudentAccommodationInput) => Promise<void>;
  /** Clear accommodation for a specific student */
  clearStudentAccommodation: (studentId: string) => Promise<void>;
  /** PRD-0019: Complete base test - submit base students, mark baseTimeExpired, preserve session */
  completeBaseTest: () => Promise<CompleteBaseTestResult>;
  /** PRD-0019: End full session - cleanup and redirect to results (called when all students complete) */
  endFullSession: (redirectToResults?: boolean, skipConfirmation?: boolean) => Promise<void>;
  /** PRD-0040 Phase 2: Set the review release state for all students in this session */
  setReviewReleaseState: (state: ReviewReleaseState) => Promise<void>;
}

/**
 * Custom hook for managing test session controls.
 * 
 * Features:
 * - Start test (set status to in-progress)
 * - Pause/resume test (with duration tracking)
 * - End test (clear all test data, return to lobby)
 * - Extend test time (adjust start time)
 * 
 * All operations include:
 * - Firebase updates
 * - Error handling with user feedback
 * - Console logging for debugging
 * - Confirmation dialogs where appropriate
 * 
 * @param sessionCode - The unique session code
 * @param session - The current session data
 * @param testData - PRD-0019: Optional test data for question count
 * @param fullTestData - Optional full test data including questions (for auto-submission marking)
 * @returns MonitorControlsResult object with control functions
 * 
 * @example
 * ```typescript
 * const { startTest, pauseTest, endTest, extendTime } = useMonitorControls(sessionCode, session, testData, fullTestData);
 * 
 * <button onClick={startTest}>Start Test</button>
 * <button onClick={pauseTest}>{session.isPaused ? 'Resume' : 'Pause'}</button>
 * <button onClick={endTest}>End Test</button>
 * <button onClick={() => extendTime(5)}>Add 5 Minutes</button>
 * ```
 */
export function useMonitorControls(
  sessionCode: string | undefined,
  session: TestSession | null,
  testData?: TestData | null, // PRD-0019: Optional test data for question count
  fullTestData?: any | null // BUG-FIX: Full test data with questions for auto-submission marking
): MonitorControlsResult {
  const { navigateTo } = useNavigation('teacher');

  const loadQuestionsForAutoSubmit = async (): Promise<any[] | null> => {
    const inMemoryQuestions = extractMonitorTestQuestions(fullTestData);
    if (inMemoryQuestions) {
      return inMemoryQuestions;
    }

    if (!session?.testId) {
      return null;
    }

    const snapshot = await get(ref(database, `tests/${session.testId}`));
    if (!snapshot.exists()) {
      return null;
    }

    return extractMonitorTestQuestions(snapshot.val());
  };

  /**
   * Starts the test by updating session status and setting start time.
   * This triggers students to begin the test.
   */
  const startTest = async (antiCheatConfig?: AntiCheatConfig) => {
    if (!sessionCode) {
      console.error('❌ [Controls] No session code provided');
      return;
    }

    try {
      const currentTestId = (session as any)?.testId;
      if (currentTestId) {
        const payloadResult = await cacheSessionStudentSafeTestData(sessionCode, currentTestId);
        if (!payloadResult.success) {
          throw new Error(payloadResult.error || 'Failed to prepare student-safe test payload');
        }
      }

      const sessionRef = ref(database, `game_sessions/${sessionCode}`);
      await update(sessionRef, {
        status: 'in-progress',
        startTime: Date.now(),
        isPaused: false,
        antiCheatConfig: antiCheatConfig || null,
      });
      console.log('✅ [Controls] Test started successfully');

      // Fire-and-forget: notify class students that the test has started
      const linkedClassId = (session as any)?.linkedClassId;
      const testId = (session as any)?.testId;
      if (linkedClassId && testId) {
        import('../../services/notificationService').then(({ sendTestStartedNotifications }) => {
          import('firebase/database').then(({ get: getDb, ref: dbRef }) => {
            import('../../services/firebase').then(({ database: db }) => {
              getDb(dbRef(db, `tests/${testId}/title`))
                .then(snap => {
                  const testName: string = snap.exists() ? snap.val() : testId;
                  sendTestStartedNotifications(linkedClassId, sessionCode!, testName)
                    .catch((err: Error) => console.warn('[Controls] Test-started feed notification failed:', err));
                })
                .catch(() => {
                  sendTestStartedNotifications(linkedClassId, sessionCode!, testId)
                    .catch((err: Error) => console.warn('[Controls] Test-started feed notification failed:', err));
                });
            });
          });
        }).catch((err: Error) => console.warn('[Controls] Could not load notificationService:', err));
      }
    } catch (error) {
      console.error('❌ [Controls] Error starting test:', error);
      alert('Failed to start test. Please try again.');
    }
  };

  /**
   * Toggles pause/resume state of the test.
   * Tracks pause duration to adjust timer correctly.
   */
  const pauseTest = async () => {
    if (!sessionCode || !session) {
      console.error('❌ [Controls] No session code or session data');
      return;
    }

    try {
      const sessionRef = ref(database, `game_sessions/${sessionCode}`);
      const now = Date.now();

      if (session.isPaused) {
        // Resume test
        const pauseDuration = now - (session.pausedAt || now);
        await update(sessionRef, {
          isPaused: false,
          resumedAt: now,
          pausedDuration: (session.pausedDuration || 0) + pauseDuration,
        });
        console.log('✅ [Controls] Test resumed successfully');
      } else {
        // Pause test
        await update(sessionRef, {
          isPaused: true,
          pausedAt: now,
        });
        console.log('✅ [Controls] Test paused successfully');
      }
    } catch (error) {
      console.error('❌ [Controls] Error toggling pause:', error);
      alert('Failed to pause/resume test. Please try again.');
    }
  };

  /**
   * PRD-0019: Complete base test when base timer expires
   * 
   * This function:
   * - Submits all base students (those without extraTime accommodation)
   * - Sets hasCompletedTest: true for each base student
   * - Sets session flag baseTimeExpired: true
   * - Does NOT clear session data or navigate away
   * - Preserves session for accommodated students to continue
   * 
   * @returns {Promise<CompleteBaseTestResult>} Count of submitted students and remaining accommodated
   */
  const completeBaseTest = async (): Promise<CompleteBaseTestResult> => {
    if (!sessionCode) {
      console.error('❌ [PRD-0019] No session code provided');
      return { submittedCount: 0, accommodatedRemaining: 0 };
    }

    try {
      console.log('🔄 [PRD-0019] Completing base test - submitting base students...');

      const sessionRef = ref(database, `game_sessions/${sessionCode}`);
      const now = Date.now();

      // Identify base students (no accommodation) and accommodated students
      const baseStudents: string[] = [];
      const accommodatedStudents: string[] = [];

      if (session?.players) {
        Object.entries(session.players).forEach(([playerId, playerData]) => {
          // Skip already completed students
          if ((playerData as any).hasCompletedTest) {
            return;
          }

          // Check for accommodation
          const accommodation = (session as any).studentAccommodations?.[playerId];
          const hasExtraTime = accommodation?.extraTime && accommodation.extraTime > 0;

          if (hasExtraTime) {
            accommodatedStudents.push(playerId);
          } else {
            baseStudents.push(playerId);
          }
        });
      }

      console.log(`📊 [PRD-0019] Base students: ${baseStudents.length}, Accommodated: ${accommodatedStudents.length}`);

      // Auto-submit disconnected base students
      if (session?.testId && baseStudents.length > 0) {
        const disconnectedBaseStudents = baseStudents.filter(id => {
          const player = session.players?.[id];
          return player && identifyDisconnectedStudents({ [id]: player }).length > 0;
        });

        if (disconnectedBaseStudents.length > 0) {
          console.log(`🔄 [PRD-0019] Auto-submitting ${disconnectedBaseStudents.length} disconnected base students...`);
          const disconnectedPlayers: Record<string, any> = {};
          disconnectedBaseStudents.forEach(id => {
            if (session.players?.[id]) {
              disconnectedPlayers[id] = session.players[id];
            }
          });

          const disconnectedStudents = identifyDisconnectedStudents(disconnectedPlayers);
          const disconnectedUnsubmittedStudents = identifyUnsubmittedStudents(disconnectedPlayers);
          const testQuestions = testData ? await loadQuestionsForAutoSubmit() : null;

          if (testQuestions && testData && disconnectedUnsubmittedStudents.length > 0) {
            await autoSubmitAllUnsubmittedStudents(
              sessionCode,
              session.testId,
              disconnectedUnsubmittedStudents,
              testQuestions,
              { title: testData.title, type: testData.type, skill: testData.skill, duration: testData.duration },
              resolveCanonicalSessionTeacherId(session) || '',
              session.startTime || null,
              (session as any).academicContext || undefined
            );
          } else if (disconnectedStudents.length > 0) {
            // Emergency fallback preserves the submission instead of dropping it entirely.
            const totalQuestions = testData?.questionCount || 0;
            await autoSubmitDisconnectedStudents(
              sessionCode,
              session.testId,
              disconnectedStudents,
              totalQuestions
            );
          }
        }
      }

      // Mark all base students as completed
      const playerUpdates: Record<string, any> = {};
      baseStudents.forEach(playerId => {
        playerUpdates[`players/${playerId}/hasCompletedTest`] = true;
        playerUpdates[`players/${playerId}/completedAt`] = now;
        playerUpdates[`players/${playerId}/submittedBy`] = 'system-timeout';
      });

      // Update session flags
      await update(sessionRef, {
        ...playerUpdates,
        baseTimeExpired: true,
        baseTimeExpiredAt: now,
        updatedAt: now,
      });

      console.log(`✅ [PRD-0019] Base test completed. Submitted: ${baseStudents.length}, Remaining accommodated: ${accommodatedStudents.length}`);

      return {
        submittedCount: baseStudents.length,
        accommodatedRemaining: accommodatedStudents.length,
      };
    } catch (error) {
      console.error('❌ [PRD-0019] Error completing base test:', error);
      return { submittedCount: 0, accommodatedRemaining: 0 };
    }
  };

  /**
   * PRD-0019: End full session - complete cleanup and optional redirect
   * 
   * This function (renamed from endTest for PRD-0019):
   * - If baseTimeExpired is true, skips resubmitting base students
   * - Submits remaining accommodated students who haven't completed
   * - Sets status: 'waiting'
   * - Clears test-specific data but preserves player entries
   * - Navigates teacher to results dashboard or lobby
   * 
   * @param redirectToResults - If true, redirect to results dashboard. Default: false (lobby)
   * @param skipConfirmation - If true, skip the confirmation dialog. Default: false
   */
  const endFullSession = async (redirectToResults = false, skipConfirmation = false) => {
    if (!sessionCode) {
      console.error('❌ [PRD-0019] No session code provided');
      return;
    }

    if (!skipConfirmation) {
      const confirmed = window.confirm(
        'Are you sure you want to end this test? Students will return to the waiting room.'
      );

      if (!confirmed) {
        console.log('ℹ️ [PRD-0019] Test end cancelled by user');
        return;
      }
    }

    try {
      console.log('🔄 [PRD-0019] Ending full session...');

      const sessionRef = ref(database, `game_sessions/${sessionCode}`);
      const now = Date.now();
      const isBaseTimeExpired = (session as any)?.baseTimeExpired === true;

      // BUG-FIX: Auto-submit ALL unsubmitted students when teacher ends test
      // Previously only handled disconnected students, missing connected but unsubmitted ones
      if (session?.players && session?.testId) {
        const teacherId = resolveCanonicalSessionTeacherId(session) || '';

        // Get academic context from session data if available
        const academicContext = (session as any).academicContext || undefined;
        const testQuestions = testData ? await loadQuestionsForAutoSubmit() : null;

        if (isBaseTimeExpired) {
          // Base time expired: submit remaining accommodated students who haven't completed
          const remainingStudents = Object.entries(session.players)
            .filter(([_, playerData]) => !(playerData as any).hasCompletedTest)
            .map(([id]) => id);

          if (remainingStudents.length > 0) {
            console.log(`🔄 [PRD-0019] Submitting ${remainingStudents.length} remaining accommodated students...`);

            // Mark them as completed in Firebase
            const playerUpdates: Record<string, any> = {};
            remainingStudents.forEach(playerId => {
              playerUpdates[`players/${playerId}/hasCompletedTest`] = true;
              playerUpdates[`players/${playerId}/completedAt`] = now;
              playerUpdates[`players/${playerId}/submittedBy`] = 'teacher-end';
            });
            await update(sessionRef, playerUpdates);

            if (testQuestions && testData) {
              const unsubmittedData = identifyUnsubmittedStudents(
                Object.fromEntries(
                  remainingStudents.map(id => [id, session.players![id]])
                )
              );
              if (unsubmittedData.length > 0) {
                await autoSubmitAllUnsubmittedStudents(
                  sessionCode,
                  session.testId,
                  unsubmittedData,
                  testQuestions,
                  { title: testData.title, type: testData.type, skill: testData.skill, duration: testData.duration },
                  teacherId,
                  session.startTime || null,
                  academicContext
                );
              }
            }
          }
        } else {
          // BUG-FIX: Submit ALL unsubmitted students (not just disconnected ones)
          const unsubmittedStudents = identifyUnsubmittedStudents(session.players);
          if (unsubmittedStudents.length > 0) {
            console.log(`🔄 [BUG-FIX] Found ${unsubmittedStudents.length} unsubmitted students - saving results...`);

            if (testQuestions && testData) {
              // Use proper auto-submit with marking and full Firebase indexes
              await autoSubmitAllUnsubmittedStudents(
                sessionCode,
                session.testId,
                unsubmittedStudents,
                testQuestions,
                { title: testData.title, type: testData.type, skill: testData.skill, duration: testData.duration },
                teacherId,
                session.startTime || null,
                academicContext
              );
            } else {
              // Fallback: use legacy disconnected-only submit if test data not available
              console.warn('⚠️ [BUG-FIX] Full test data not available, falling back to legacy auto-submit');
              const disconnectedStudents = identifyDisconnectedStudents(session.players);
              if (disconnectedStudents.length > 0) {
                await autoSubmitDisconnectedStudents(sessionCode, session.testId, disconnectedStudents);
              }
            }
          }

          // Mark all unsubmitted players as completed in Firebase
          if (unsubmittedStudents.length > 0) {
            const playerCompletionUpdates: Record<string, any> = {};
            unsubmittedStudents.forEach(student => {
              playerCompletionUpdates[`players/${student.studentId}/hasCompletedTest`] = true;
              playerCompletionUpdates[`players/${student.studentId}/completedAt`] = now;
              playerCompletionUpdates[`players/${student.studentId}/submittedBy`] = 'teacher-end';
              playerCompletionUpdates[`players/${student.studentId}/isSubmitted`] = true;
            });
            await update(sessionRef, playerCompletionUpdates);
          }
        }
      }

      // Capture class and test info BEFORE clearing — used for feed notification below
      const savedLinkedClassId = (session as any)?.linkedClassId as string | undefined;
      const savedTestTitle = (testData as any)?.title as string | undefined;

      // CRITICAL FIX: Save lastTestId on EACH player node before clearing session.
      // This ensures students can always find their results even after flags are cleared.
      const currentTestId = session?.testId;
      if (session?.players && currentTestId) {
        const lastTestUpdates: Record<string, any> = {};
        Object.keys(session.players).forEach(playerId => {
          lastTestUpdates[`players/${playerId}/lastTestId`] = currentTestId;
          lastTestUpdates[`players/${playerId}/lastTestSessionCode`] = sessionCode;
          lastTestUpdates[`players/${playerId}/lastTestEndedAt`] = now;
        });
        await update(sessionRef, lastTestUpdates);
        console.log(`📌 [FIX] Saved lastTestId=${currentTestId} on ${Object.keys(session.players).length} player nodes`);
      }

      // Clear ALL test-related data - nothing should remain
      await update(sessionRef, {
        status: 'waiting', // Reset to waiting status
        testId: null, // Clear test ID - makes URL invalid
        startTime: null, // Clear start time
        isPaused: false, // Clear pause state
        pausedAt: null, // Clear pause timestamp
        pausedDuration: 0, // Clear accumulated pause time
        resumedAt: null, // Clear resume timestamp
        showCorrectAnswers: false, // Clear answer visibility
        currentQuestion: null, // Clear current question tracking
        testStartedAt: null, // Clear test start timestamp
        lastTestCompletedAt: now, // Track when test ended for analytics
        lastTestId: currentTestId, // PRD-0019: Save last test ID for results page
        // PRD-0040: Session end auto-releases review while preserving any
        // already-more-permissive feedback release set by the teacher.
        reviewReleaseState: (session?.reviewReleaseState === 'feedback-released'
          ? 'feedback-released'
          : 'review-released') as ReviewReleaseState,
        // PRD-0019: Clear base time expiry flags
        baseTimeExpired: null,
        baseTimeExpiredAt: null,
        integrityRefreshRequestedAt: null,
        updatedAt: now,
      });

      await update(ref(database), {
        [`session_test_payloads/${sessionCode}`]: null,
      });

      // CRITICAL FIX: Delay player data cleanup to give students time to:
      // 1. Detect testData=null via onValue
      // 2. Run checkAndRedirect() which reads player flags
      // 3. Navigate to waiting room with showResults state
      // Without this delay, the cleanup wipes player flags before students can read them.
      const CLEANUP_DELAY_MS = 4000; // 4 seconds - enough for redirect + modal open
      console.log(`⏳ [FIX] Delaying player cleanup by ${CLEANUP_DELAY_MS}ms to let students redirect...`);

      if (session?.players) {
        setTimeout(async () => {
          try {
            const playerUpdates: Record<string, any> = {};

            Object.keys(session.players!).forEach(playerId => {
              // Clear test-specific data for each player, preserve identity
              playerUpdates[`players/${playerId}/answers`] = null;
              playerUpdates[`players/${playerId}/rawAnswers`] = null;
              playerUpdates[`players/${playerId}/score`] = null;
              playerUpdates[`players/${playerId}/bandScore`] = null;
              playerUpdates[`players/${playerId}/hasSubmitted`] = false;
              playerUpdates[`players/${playerId}/isSubmitted`] = null;
              playerUpdates[`players/${playerId}/submittedAt`] = null;
              playerUpdates[`players/${playerId}/testResults`] = null;
              playerUpdates[`players/${playerId}/currentQuestion`] = null;
              playerUpdates[`players/${playerId}/progress`] = 0;
              playerUpdates[`players/${playerId}/lastActivity`] = Date.now();
              // Clear completion flags for next test
              playerUpdates[`players/${playerId}/hasCompletedTest`] = null;
              playerUpdates[`players/${playerId}/completedAt`] = null;
              playerUpdates[`players/${playerId}/submittedBy`] = null;
              playerUpdates[`players/${playerId}/forceSubmittedBy`] = null;
              playerUpdates[`players/${playerId}/forceSubmitRequestedAt`] = null;
              playerUpdates[`players/${playerId}/submissionResetAt`] = null;
              playerUpdates[`players/${playerId}/latestResultId`] = null;
              // NOTE: We intentionally DO NOT clear lastTestId, lastTestSessionCode, lastTestEndedAt
              // These persist so students can always find their last test results
            });

            await update(sessionRef, playerUpdates);
            console.log(`🧹 [FIX] Delayed cleanup complete: cleared test data for ${Object.keys(session.players!).length} players`);
          } catch (cleanupError) {
            console.error('❌ [FIX] Delayed player cleanup failed:', cleanupError);
          }
        }, CLEANUP_DELAY_MS);
      }

      console.log('✅ [PRD-0019] Full session ended - all test data cleared, session reset to waiting');

      // Fire-and-forget: notify class students that the test session has ended
      if (savedLinkedClassId && currentTestId) {
        import('../../services/notificationService').then(({ sendTestEndedNotifications }) => {
          const testName = savedTestTitle || currentTestId;
          sendTestEndedNotifications(savedLinkedClassId, sessionCode!, testName)
            .catch((err: Error) => console.warn('[Controls] Test-ended feed notification failed:', err));
        }).catch((err: Error) => console.warn('[Controls] Could not load notificationService:', err));
      }

      // Navigate based on redirectToResults flag
      if (redirectToResults) {
        console.log('🔄 [PRD-0019] Redirecting to results dashboard...');
        // TODO: Navigate to results dashboard when it's implemented
        // For now, navigate to lobby
        navigateTo('TEACHER_LOBBY',
          { sessionCode },
          { reason: 'test_completed_all_students', replace: true }
        );
      } else {
        console.log('🔄 [PRD-0019] Navigating to Teacher Lobby...');
        navigateTo('TEACHER_LOBBY',
          { sessionCode },
          { reason: 'test_ended_by_teacher', replace: true }
        );
      }
    } catch (error) {
      console.error('❌ [PRD-0019] Error ending full session:', error);
      alert('Failed to end test. Please try again.');
    }
  };

  /**
   * Ends the test and returns students to waiting room.
   * Clears ALL test-related data to prevent issues with next test.
   * Navigates teacher back to session lobby.
   * 
   * @deprecated Use endFullSession() for PRD-0019 compatibility
   */
  const endTest = async () => {
    return endFullSession(false, false);
  };

  /**
   * Extends test time by adjusting the start time backwards.
   * This gives students additional time to complete the test.
   * 
   * @param minutes - Number of minutes to add to the test duration
   */
  const extendTime = async (minutes: number) => {
    if (!sessionCode || !session || !session.startTime) {
      console.error('❌ [Controls] No session code, session data, or start time');
      return;
    }

    if (minutes <= 0) {
      console.error('❌ [Controls] Invalid extension time:', minutes);
      alert('Please enter a valid number of minutes.');
      return;
    }

    try {
      const sessionRef = ref(database, `game_sessions/${sessionCode}`);
      const extension = minutes * 60 * 1000; // Convert to milliseconds

      // Adjust start time backwards to add time
      await update(sessionRef, {
        startTime: session.startTime - extension,
      });

      console.log(`✅ [Controls] Extended test by ${minutes} minutes`);
      alert(`Test time extended by ${minutes} minutes!`);
    } catch (error) {
      console.error('❌ [Controls] Error extending time:', error);
      alert('Failed to extend time. Please try again.');
    }
  };

  /**
   * Broadcasts a pause command to all students' audio players.
   * Students will receive this via Firebase and pause their audio.
   * 
   * PRD-0018: Now also updates masterAudioState for unified audio architecture.
   */
  const pauseAllAudio = async (currentSection: number = 1, currentPosition: number = 0, currentSpeed: number = 1.0) => {
    if (!sessionCode) {
      console.error('❌ [Controls] No session code provided');
      return;
    }

    try {
      const sessionRef = ref(database, `game_sessions/${sessionCode}`);
      const now = Date.now();

      // Build masterAudioState update (PRD-0018)
      const masterAudioState: Partial<MasterAudioState> = {
        section: currentSection,
        position: currentPosition,
        isPlaying: false,
        speed: currentSpeed,
        timestamp: now,
        lastAction: 'pause',
        lastActionTimestamp: now,
      };

      await update(sessionRef, {
        // Legacy audioCommand (for backwards compatibility)
        audioCommand: {
          type: 'pause',
          timestamp: now,
        },
        // New masterAudioState (PRD-0018)
        masterAudioState,
      });
      console.log('✅ [Controls] Pause all audio command broadcast (legacy + masterAudioState)');
    } catch (error) {
      console.error('❌ [Controls] Error broadcasting pause audio:', error);
      alert('Failed to pause audio. Please try again.');
    }
  };

  /**
   * Broadcasts a resume command to all students' audio players.
   * Students will receive this via Firebase and resume their audio.
   * 
   * PRD-0018: Now also updates masterAudioState for unified audio architecture.
   */
  const resumeAllAudio = async (currentSection: number = 1, currentPosition: number = 0, currentSpeed: number = 1.0) => {
    if (!sessionCode) {
      console.error('❌ [Controls] No session code provided');
      return;
    }

    try {
      const sessionRef = ref(database, `game_sessions/${sessionCode}`);
      const now = Date.now();

      // Build masterAudioState update (PRD-0018)
      const masterAudioState: Partial<MasterAudioState> = {
        section: currentSection,
        position: currentPosition,
        isPlaying: true,
        speed: currentSpeed,
        timestamp: now,
        lastAction: 'resume',
        lastActionTimestamp: now,
      };

      await update(sessionRef, {
        // Legacy audioCommand (for backwards compatibility)
        audioCommand: {
          type: 'resume',
          timestamp: now,
        },
        // New masterAudioState (PRD-0018)
        masterAudioState,
      });
      console.log('✅ [Controls] Resume all audio command broadcast (legacy + masterAudioState)');
    } catch (error) {
      console.error('❌ [Controls] Error broadcasting resume audio:', error);
      alert('Failed to resume audio. Please try again.');
    }
  };

  /**
   * Broadcasts a skip to section command to all students.
   * Students will receive this via Firebase and skip to the specified section.
   * 
   * PRD-0018: Now also updates masterAudioState for unified audio architecture.
   * 
   * @param sectionNumber - The section number to skip to
   * @param currentSpeed - Current playback speed
   * @param isPlaying - Whether audio is currently playing
   */
  const skipToSection = async (sectionNumber: number, currentSpeed: number = 1.0, isPlaying: boolean = false) => {
    if (!sessionCode) {
      console.error('❌ [Controls] No session code provided');
      return;
    }

    const confirmed = window.confirm(
      `Skip all students to Section ${sectionNumber}? This will interrupt their current audio.`
    );

    if (!confirmed) {
      console.log('ℹ️ [Controls] Skip to section cancelled by user');
      return;
    }

    try {
      const sessionRef = ref(database, `game_sessions/${sessionCode}`);
      const now = Date.now();

      // Build masterAudioState update (PRD-0018)
      const masterAudioState: Partial<MasterAudioState> = {
        section: sectionNumber,
        position: 0, // Start from beginning of new section
        isPlaying,
        speed: currentSpeed,
        timestamp: now,
        lastAction: 'section',
        lastActionTimestamp: now,
      };

      await update(sessionRef, {
        // Legacy audioCommand (for backwards compatibility)
        audioCommand: {
          type: 'skipToSection',
          sectionNumber,
          timestamp: now,
        },
        // New masterAudioState (PRD-0018)
        masterAudioState,
      });
      console.log(`✅ [Controls] Skip to section ${sectionNumber} command broadcast (legacy + masterAudioState)`);
    } catch (error) {
      console.error('❌ [Controls] Error broadcasting skip to section:', error);
      alert('Failed to skip section. Please try again.');
    }
  };

  /**
   * Broadcasts a playback speed change to all students.
   * Students will receive this via Firebase and adjust their audio playback speed.
   * 
   * PRD-0018: Now also updates masterAudioState for unified audio architecture.
   * 
   * @param speed - The playback speed (0.75, 1.0, 1.25, 1.5, 2.0)
   * @param currentSection - Current section number
   * @param currentPosition - Current position in seconds
   * @param isPlaying - Whether audio is currently playing
   */
  const setPlaybackSpeed = async (speed: number, currentSection: number = 1, currentPosition: number = 0, isPlaying: boolean = false) => {
    if (!sessionCode) {
      console.error('❌ [Controls] No session code provided');
      return;
    }

    try {
      const sessionRef = ref(database, `game_sessions/${sessionCode}`);
      const now = Date.now();

      // Build masterAudioState update (PRD-0018)
      const masterAudioState: Partial<MasterAudioState> = {
        section: currentSection,
        position: currentPosition,
        isPlaying,
        speed,
        timestamp: now,
        lastAction: 'speed',
        lastActionTimestamp: now,
      };

      await update(sessionRef, {
        // Legacy audioCommand (for backwards compatibility)
        audioCommand: {
          type: 'setSpeed',
          speed,
          timestamp: now,
        },
        // New masterAudioState (PRD-0018)
        masterAudioState,
      });
      console.log(`✅ [Controls] Playback speed ${speed}x command broadcast (legacy + masterAudioState)`);
    } catch (error) {
      console.error('❌ [Controls] Error broadcasting playback speed:', error);
      alert('Failed to set playback speed. Please try again.');
    }
  };

  /**
   * Sets accommodation for a specific student.
   * Accommodations override test-level settings for individual students.
   * 
   * @param studentId - The player ID of the student
   * @param accommodation - The accommodation settings to apply
   */
  const setStudentAccommodation = async (studentId: string, accommodation: StudentAccommodationInput) => {
    if (!sessionCode) {
      console.error('❌ [Controls] No session code provided');
      return;
    }

    try {
      const sessionRef = ref(database, `game_sessions/${sessionCode}/studentAccommodations/${studentId}`);
      await update(sessionRef, {
        ...accommodation,
        timestamp: Date.now(),
      });
      console.log(`✅ [Controls] Accommodation set for student ${studentId}:`, accommodation);
    } catch (error) {
      console.error('❌ [Controls] Error setting accommodation:', error);
      alert('Failed to set accommodation. Please try again.');
    }
  };

  /**
   * Broadcasts a seek to position command to all students.
   * Students will receive this via Firebase and seek their audio to the specified time.
   * 
   * PRD-0018: Now also updates masterAudioState for unified audio architecture.
   * 
   * @param sectionNumber - The section number
   * @param position - The position in seconds within the section
   * @param currentSpeed - Current playback speed
   * @param isPlaying - Whether audio is currently playing
   */
  const seekToPosition = async (sectionNumber: number, position: number, currentSpeed: number = 1.0, isPlaying: boolean = false) => {
    if (!sessionCode) {
      console.error('❌ [Controls] No session code provided');
      return;
    }

    try {
      const sessionRef = ref(database, `game_sessions/${sessionCode}`);
      const now = Date.now();

      // Build masterAudioState update (PRD-0018)
      const masterAudioState: Partial<MasterAudioState> = {
        section: sectionNumber,
        position,
        isPlaying,
        speed: currentSpeed,
        timestamp: now,
        lastAction: 'seek',
        lastActionTimestamp: now,
      };

      await update(sessionRef, {
        // Legacy audioCommand (for backwards compatibility)
        audioCommand: {
          type: 'seekToPosition',
          sectionNumber,
          position, // Position in seconds
          timestamp: now,
        },
        // New masterAudioState (PRD-0018)
        masterAudioState,
      });
      console.log(`✅ [Controls] Seek to section ${sectionNumber} at ${position}s command broadcast (legacy + masterAudioState)`);
    } catch (error) {
      console.error('❌ [Controls] Error broadcasting seek position:', error);
    }
  };

  /**
   * Clears accommodation for a specific student.
   * 
   * @param studentId - The player ID of the student
   */
  const clearStudentAccommodation = async (studentId: string) => {
    if (!sessionCode) {
      console.error('❌ [Controls] No session code provided');
      return;
    }

    try {
      const sessionRef = ref(database, `game_sessions/${sessionCode}/studentAccommodations/${studentId}`);
      await update(sessionRef, null as any); // Remove the accommodation
      console.log(`✅ [Controls] Accommodation cleared for student ${studentId}`);
    } catch (error) {
      console.error('❌ [Controls] Error clearing accommodation:', error);
      alert('Failed to clear accommodation. Please try again.');
    }
  };

  /**
   * PRD-0040 Phase 2: Set the review release state for the current session.
   * Controls what students can see in post-test review surfaces.
   * 
   * @param state - The desired release state:
   *   - 'locked-review': Score + counts only
   *   - 'review-released': + correct answers, scoring detail
   *     This is the default state after the teacher ends a session.
   *   - 'feedback-released': + AI feedback, teacher feedback (full access)
   */
  const setReviewReleaseState = async (state: ReviewReleaseState) => {
    if (!sessionCode) {
      console.error('❌ [PRD-0040] No session code provided');
      return;
    }

    try {
      const sessionRef = ref(database, `game_sessions/${sessionCode}`);
      await update(sessionRef, {
        reviewReleaseState: state,
        reviewReleaseStateUpdatedAt: Date.now(),
      });
      console.log(`✅ [PRD-0040] Release state set to '${state}' for session ${sessionCode}`);
    } catch (error) {
      console.error('❌ [PRD-0040] Error setting release state:', error);
      throw error;
    }
  };

  return {
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
    completeBaseTest,
    endFullSession,
    setReviewReleaseState,
  };
}
