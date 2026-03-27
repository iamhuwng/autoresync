/**
 * useTeacherEndRedirect Hook
 * 
 * PRD-TEST-END-FLOW: When teacher ends test early, students should return
 * to the waiting lobby with a results modal — NOT a standalone results page.
 * 
 * The teacher's endFullSession() auto-submits all unsubmitted students and saves 
 * their results to Firebase BEFORE clearing testId. When testId becomes null,
 * the student's useTestData fires and testData becomes null. At that moment,
 * the player's hasCompletedTest flag is still true (cleanup hasn't run yet).
 * 
 * This hook checks that flag and redirects to the waiting room with showResults state.
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, get } from 'firebase/database';
// @ts-ignore - firebase.js is a JS file
import { database } from '../../services/firebase';
import { sessionService } from '../../services/sessionService';
import { deriveSessionReleaseState } from '../../types/releaseState.types';

interface UseTeacherEndRedirectOptions {
    sessionCode: string | undefined;
}

/**
 * Returns a function that checks if the student was auto-submitted by the teacher
 * and redirects to the waiting room with showResults flag.
 * 
 * @returns checkAndRedirect - async function that returns true if redirected,
 *          false if the caller should handle navigation
 */
export const useTeacherEndRedirect = ({ sessionCode }: UseTeacherEndRedirectOptions) => {
    const navigate = useNavigate();

    const checkAndRedirect = useCallback(async (): Promise<boolean> => {
        if (!sessionCode) return false;

        try {
            const playerId = sessionService.getPlayerId();
            if (!playerId) return false;

            const playerRef = ref(database, `game_sessions/${sessionCode}/players/${playerId}`);
            const snapshot = await get(playerRef);

            if (snapshot.exists()) {
                const playerData = snapshot.val();

                // Check if the player was auto-submitted by the teacher ending the test
                // or if they submitted themselves (hasCompletedTest is set by both paths)
                const wasCompleted = playerData.hasCompletedTest === true;
                const wasSubmitted = playerData.isSubmitted === true ||
                    (playerData.submittedAt && typeof playerData.submittedAt === 'number');
                const wasTeacherEnded = playerData.submittedBy === 'teacher-end' ||
                    playerData.submittedBy === 'system-timeout';
                const hasPersistentLastTest = Boolean(
                    playerData.lastTestId &&
                    (!playerData.lastTestSessionCode || playerData.lastTestSessionCode === sessionCode)
                );

                // CRITICAL FIX: Also check persistent lastTestEndedAt field.
                // The player flags (hasCompletedTest, isSubmitted) may have been
                // cleared by the delayed cleanup in endFullSession, but lastTestEndedAt
                // is NEVER cleared, so it's always available.
                const lastTestEndedAt = playerData.lastTestEndedAt;
                const recentlyEnded = lastTestEndedAt &&
                    (Date.now() - lastTestEndedAt) < 30000; // Within 30 seconds

                if (wasCompleted || wasSubmitted || wasTeacherEnded || recentlyEnded || hasPersistentLastTest) {
                    console.log('🔄 [TeacherEndRedirect] Student was auto-submitted, redirecting to waiting room with results modal');
                    console.log('  → hasCompletedTest:', wasCompleted, '| isSubmitted:', wasSubmitted, '| submittedBy:', playerData.submittedBy, '| recentlyEnded:', recentlyEnded);

                    // PRD-0040 Phase 2: Read session-level release state for the waiting room
                    let releaseState = 'locked-review';
                    try {
                        const sessionRef = ref(database, `game_sessions/${sessionCode}`);
                        const sessionSnap = await get(sessionRef);
                        if (sessionSnap.exists()) {
                            releaseState = deriveSessionReleaseState(sessionSnap.val());
                        }
                    } catch (releaseErr) {
                        console.warn('[TeacherEndRedirect] Could not read release state, defaulting to locked-review:', releaseErr);
                    }

                    // PRD-TEST-END-FLOW: Navigate to waiting room with showResults flag
                    // PRD-0040: Also pass releaseState so the modal knows what to show
                    navigate(`/student-wait/${sessionCode}`, {
                        replace: true,
                        state: {
                            showResults: true,
                            sessionCode,
                            reviewReleaseState: releaseState,
                            testId: playerData.lastTestId || undefined,
                        },
                    });
                    return true;
                }
            }

            return false;
        } catch (error) {
            console.error('[TeacherEndRedirect] Error checking player status:', error);
            return false;
        }
    }, [sessionCode, navigate]);

    return { checkAndRedirect };
};
