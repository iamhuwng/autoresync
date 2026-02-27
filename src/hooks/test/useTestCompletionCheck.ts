/**
 * useTestCompletionCheck Hook
 * PRD-0019 Task 6.3: Re-entry prevention for completed tests
 * 
 * Checks if student has already completed the test and redirects accordingly.
 * Prevents students from re-entering a test they've already submitted.
 */

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, get } from 'firebase/database';
// @ts-ignore - firebase.js is a JS file
import { database } from '../../services/firebase';
import { sessionService } from '../../services/sessionService';

interface UseTestCompletionCheckOptions {
  sessionCode: string | undefined;
  testSkill?: 'Listening' | 'Reading' | 'Writing' | string;
  enabled?: boolean;
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
}: UseTestCompletionCheckOptions): void => {
  const navigate = useNavigate();
  const hasCheckedRef = useRef(false);

  useEffect(() => {
    // Skip if disabled or already checked
    if (!enabled || hasCheckedRef.current || !sessionCode) return;

    const checkCompletion = async () => {
      try {
        const playerId = sessionService.getPlayerId();
        if (!playerId) {
          console.log('[TestCompletionCheck] No player ID found');
          return;
        }

        const playerRef = ref(database, `game_sessions/${sessionCode}/players/${playerId}`);
        const snapshot = await get(playerRef);

        if (snapshot.exists()) {
          const playerData = snapshot.val();

          // Check if test has been completed (PRD-0019 flag)
          if (playerData.hasCompletedTest === true) {
            console.log('⚠️ [PRD-0019] Student has already completed this test. Redirecting...');

            // Show toast notification
            if (typeof window !== 'undefined' && (window as any).showNotification) {
              (window as any).showNotification({
                title: 'Test Already Completed',
                message: 'You have already completed this test.',
                color: 'yellow',
              });
            }

            // Skill-based redirect
            // PRD-TEST-END-FLOW: Redirect back to waiting room with results modal
            if (testSkill === 'Writing') {
              // Writing tests: redirect to submission confirmation
              navigate('/submission-complete', {
                replace: true,
                state: {
                  sessionCode,
                  testId: playerData.testId,
                  studentName: playerData.name || sessionService.getPlayerName(),
                },
              });
            } else {
              // All other skills: redirect to waiting room with results modal
              navigate(`/student-wait/${sessionCode}`, {
                replace: true,
                state: { showResults: true, sessionCode, testId: playerData.testId },
              });
            }
          }
        }

        hasCheckedRef.current = true;
      } catch (error) {
        console.error('[TestCompletionCheck] Error checking completion:', error);
        hasCheckedRef.current = true; // Mark as checked even on error to prevent loops
      }
    };

    checkCompletion();
  }, [sessionCode, testSkill, enabled, navigate]);
};

export default useTestCompletionCheck;
