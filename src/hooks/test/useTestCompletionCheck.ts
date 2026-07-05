// @ts-nocheck
/**
 * useTestCompletionCheck Hook
 * PRD-0019 Task 6.3: Re-entry prevention for completed tests
 * 
 * Checks if student has already completed the test and redirects accordingly.
 * Prevents students from re-entering a test they've already submitted.
 */

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, onValue } from 'firebase/database';
// @ts-ignore - firebase.js is a JS file
import { database } from '../../services/firebase';
import { sessionService } from '../../services/sessionService';
import {
  getAttemptInfo,
  getLatestSubmission,
  getSubmissionById,
} from '../../services/homeworkSubmissionService';
import type { HomeworkSubmissionStatus } from '../../types/homework.types';
import { trackAntiCheatAction } from '../../services/antiCheatReporting';

interface UseTestCompletionCheckOptions {
  sessionCode: string | undefined;
  testSkill?: 'Listening' | 'Reading' | 'Writing' | string;
  enabled?: boolean;
  /**
   * PRD-0036 Task 10.3: Mode for the check.
   * - 'session' (default): checks RTDB session for hasCompletedTest flag
   * - 'homework': validates real submission and attempt state before entry
   */
  mode?: 'session' | 'homework';
  /** Homework-only: the homework assignment ID (used for redirect) */
  homeworkId?: string;
  /** Homework-only: max allowed attempts override */
  maxAttempts?: number;
  /** Homework-only: completed attempt count override */
  currentAttempt?: number;
  /** Homework-only: current student ID, used to resolve real attempt state */
  studentId?: string;
  /** Homework-only: active submission ID for resume validation */
  submissionId?: string;
  /** Homework-only: attempts were nullified by anti-cheat enforcement */
  attemptsNullified?: boolean;
  /** Homework-only: submission status override */
  submissionStatus?: HomeworkSubmissionStatus | null;
  /** Observability surface label for anti-cheat telemetry */
  surface?: string;
  /** Session-only: called when a live teacher force-submit should trigger client submission */
  onForceSubmit?: (submittedBy: 'teacher') => Promise<void> | void;
}

/**
 * Hook to check if student has completed the test and redirect if needed.
 * 
 * @param options - Configuration options
 * @returns void - Redirects automatically if test is completed
 */
export const useTestCompletionCheck = ({
  sessionCode,
  testSkill = '',
  enabled = true,
  mode = 'session',
  homeworkId,
  maxAttempts,
  currentAttempt,
  studentId,
  submissionId,
  attemptsNullified,
  submissionStatus,
  surface = 'unknown',
  onForceSubmit,
}: UseTestCompletionCheckOptions): void => {
  const navigate = useNavigate();
  const hasCheckedRef = useRef(false);
  const hasTriggeredForceSubmitRef = useRef(false);
  const hasRedirectedRef = useRef(false);

  // PRD-0036 Task 10.3: Homework attempt exhaustion / invalid re-entry check
  useEffect(() => {
    if (mode !== 'homework' || !enabled || hasCheckedRef.current || !homeworkId) {
      return;
    }

    let cancelled = false;

    const runHomeworkCheck = async () => {
      try {
        let resolvedMaxAttempts = maxAttempts;
        let resolvedCurrentAttempt = currentAttempt;
        let resolvedAttemptsNullified = attemptsNullified ?? false;
        let resolvedSubmissionStatus = submissionStatus ?? null;
        let requestedSubmissionMissing = false;

        if (
          studentId &&
          (
            resolvedMaxAttempts === undefined ||
            resolvedCurrentAttempt === undefined ||
            attemptsNullified === undefined ||
            submissionStatus === undefined
          )
        ) {
          const [attemptInfo, activeSubmission] = await Promise.all([
            getAttemptInfo(homeworkId, studentId),
            submissionId
              ? getSubmissionById(submissionId)
              : getLatestSubmission(homeworkId, studentId),
          ]);

          if (cancelled) {
            return;
          }

          resolvedMaxAttempts = attemptInfo.maxAttempts;
          resolvedCurrentAttempt = attemptInfo.usedAttempts;
          resolvedAttemptsNullified =
            attemptInfo.attemptsNullified || Boolean(activeSubmission?.attemptsNullified);
          resolvedSubmissionStatus = activeSubmission?.status ?? null;
          requestedSubmissionMissing = Boolean(submissionId) && !activeSubmission;
        }

        const hasFinishedSubmission =
          resolvedSubmissionStatus === 'submitted' || resolvedSubmissionStatus === 'graded';
        const hasInProgressSubmission = resolvedSubmissionStatus === 'in_progress';
        const hasExhaustedAttempts =
          resolvedMaxAttempts !== null &&
          resolvedMaxAttempts !== undefined &&
          resolvedCurrentAttempt !== undefined &&
          resolvedCurrentAttempt >= resolvedMaxAttempts &&
          !hasInProgressSubmission;

        if (
          requestedSubmissionMissing ||
          resolvedAttemptsNullified ||
          hasFinishedSubmission ||
          hasExhaustedAttempts
        ) {
          const blockReason = requestedSubmissionMissing
            ? 'missing_submission'
            : resolvedAttemptsNullified
              ? 'attempts_nullified'
              : hasFinishedSubmission
                ? 'already_submitted'
                : 'max_attempts_reached';

          trackAntiCheatAction(
            'blockHomeworkEntry',
            {
              context: 'homework',
              surface,
              studentId,
              homeworkId,
              submissionId,
            },
            {
              reason: blockReason,
              resolvedMaxAttempts,
              resolvedCurrentAttempt,
              resolvedAttemptsNullified,
              resolvedSubmissionStatus,
            },
          );

          if (requestedSubmissionMissing) {
            console.warn('[PRD-0036] Homework submission is missing. Redirecting to homework detail.');
          } else if (resolvedAttemptsNullified) {
            console.warn('[PRD-0036] Homework attempts were nullified. Redirecting to homework detail.');
          } else if (hasFinishedSubmission) {
            console.warn('[PRD-0036] Homework already submitted. Redirecting to homework detail.');
          } else {
            console.warn(
              `[PRD-0036] Homework max attempts reached (${resolvedCurrentAttempt}/${resolvedMaxAttempts}). Redirecting...`,
            );
          }

          hasCheckedRef.current = true;
          hasRedirectedRef.current = true;
          navigate(`/student/homework/${homeworkId}`, { replace: true });
        }
      } catch (error) {
        if (!cancelled) {
          console.error('[TestCompletionCheck] Error checking homework completion:', error);
        }
      }
    };

    runHomeworkCheck();

    return () => {
      cancelled = true;
    };
  }, [
    mode,
    enabled,
    homeworkId,
    maxAttempts,
    currentAttempt,
    studentId,
    submissionId,
    attemptsNullified,
    submissionStatus,
    navigate,
  ]);

  // Session-mode check (original behavior)
  useEffect(() => {
    if (mode !== 'session' || !enabled || !sessionCode) return;

    const playerId = sessionService.getPlayerId();
    if (!playerId) {
      console.log('[TestCompletionCheck] No player ID found');
      return;
    }

    const playerRef = ref(database, `game_sessions/${sessionCode}/players/${playerId}`);

    const redirectToCompletion = (playerData: any) => {
      if (hasRedirectedRef.current) return;
      hasRedirectedRef.current = true;

      console.log('⚠️ [PRD-0019] Student has already completed this test. Redirecting...');

      if (typeof window !== 'undefined' && (window as any).showNotification) {
        (window as any).showNotification({
          title: 'Test Already Completed',
          message: 'You have already completed this test.',
          color: 'yellow',
        });
      }

      if (testSkill === 'Writing') {
        navigate('/submission-complete', {
          replace: true,
          state: {
            sessionCode,
            testId: playerData.testId,
            studentName: playerData.name || sessionService.getPlayerName(),
          },
        });
      } else {
        navigate(`/student-wait/${sessionCode}`, {
          replace: true,
          state: { showResults: true, sessionCode, testId: playerData.testId },
        });
      }
    };

    const unsubscribe = onValue(
      playerRef,
      async (snapshot) => {
        if (!snapshot.exists()) return;

        const playerData = snapshot.val();
        if (playerData.hasCompletedTest !== true) {
          hasRedirectedRef.current = false;
          if (playerData.forceSubmittedBy !== 'teacher') {
            hasTriggeredForceSubmitRef.current = false;
          }
          return;
        }

        const needsLiveTeacherSubmit =
          playerData.forceSubmittedBy === 'teacher' &&
          !playerData.submittedAt &&
          playerData.isSubmitted !== true;

        if (
          needsLiveTeacherSubmit &&
          onForceSubmit &&
          !hasTriggeredForceSubmitRef.current
        ) {
          hasTriggeredForceSubmitRef.current = true;
          trackAntiCheatAction(
            'handleTeacherForceSubmit',
            {
              context: 'session',
              surface,
              sessionCode,
              studentId: playerId,
              testId: playerData.testId,
            },
            {
              submittedAt: playerData.submittedAt ?? null,
              hasCompletedTest: playerData.hasCompletedTest === true,
            },
          );
          try {
            await onForceSubmit('teacher');
          } catch (error) {
            hasTriggeredForceSubmitRef.current = false;
            console.error('[TestCompletionCheck] Teacher force-submit failed:', error);
          }
          return;
        }

        redirectToCompletion(playerData);
        hasCheckedRef.current = true;
      },
      (error) => {
        console.error('[TestCompletionCheck] Error checking completion:', error);
        hasCheckedRef.current = true;
      },
    );

    return () => unsubscribe();
  }, [sessionCode, testSkill, enabled, navigate, mode, onForceSubmit]);
};

export default useTestCompletionCheck;
