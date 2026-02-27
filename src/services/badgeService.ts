/**
 * Badge Service
 * 
 * Handles badge earning logic, badge queries, and badge management.
 */

import { ref, get, set, query, orderByChild } from 'firebase/database';
// @ts-ignore
import { database } from './firebase';
import { Badge, BadgeType, BadgeEarningContext, BadgeCheckResult } from '../types/badge.types';
import { withRestoreGuard } from './restoreGuard';

export const checkAndAwardBadges = withRestoreGuard(
    'Badge',
    [] as Badge[]
)(async function _checkAndAwardBadges(
    context: BadgeEarningContext
): Promise<Badge[]> {
    const { studentId } = context;
    const earnedBadges: Badge[] = [];

    // Run all badge checks in parallel
    const checks = await Promise.all([
        checkFirstTest(context),
        checkPerfectScore(context),
        checkOnFire(context),
        checkModuleMaster(context),
        checkCourseChampion(context),
        checkImprovementStar(context),
    ]);

    // Award earned badges
    for (const checkResult of checks) {
        if (checkResult.earned && checkResult.badge) {
            const saved = await saveBadge(studentId, checkResult.badge);
            if (saved) {
                earnedBadges.push(checkResult.badge);
            }
        }
    }

    return earnedBadges;
});

/**
 * Get Student Badges
 * 
 * Retrieves all badges earned by a student.
 * 
 * @param studentId - Student user ID
 * @returns Array of earned badges
 */
export async function getStudentBadges(studentId: string): Promise<Badge[]> {
    try {
        const badgesRef = ref(database, `users/${studentId}/badges`);
        const snapshot = await get(badgesRef);

        if (!snapshot.exists()) {
            return [];
        }

        const badgesData = snapshot.val();
        return Object.entries(badgesData).map(([id, data]: [string, any]) => ({
            id,
            ...data,
        }));
    } catch (error) {
        console.error('Error fetching student badges:', error);
        return [];
    }
}

/**
 * Has Badge
 * 
 * Checks if a student has earned a specific badge type.
 * 
 * @param studentId - Student user ID
 * @param type - Badge type to check
 * @returns True if badge is earned
 */
export async function hasBadge(
    studentId: string,
    type: BadgeType
): Promise<boolean> {
    try {
        const badges = await getStudentBadges(studentId);
        return badges.some((badge) => badge.type === type);
    } catch (error) {
        console.error('Error checking badge:', error);
        return false;
    }
}

/**
 * Save Badge
 * 
 * Saves a badge to Firebase (only if not already earned).
 * 
 * @param studentId - Student user ID
 * @param badge - Badge to save
 * @returns True if saved successfully
 */
async function saveBadge(studentId: string, badge: Badge): Promise<boolean> {
    try {
        // Check if badge already exists
        const alreadyHas = await hasBadge(studentId, badge.type);
        if (alreadyHas) {
            return false; // Don't award duplicate badges
        }

        // Generate badge ID
        const badgeId = `${badge.type}_${Date.now()}`;
        const badgeRef = ref(database, `users/${studentId}/badges/${badgeId}`);

        await set(badgeRef, {
            ...badge,
            id: badgeId,
        });

        return true;
    } catch (error) {
        console.error('Error saving badge:', error);
        return false;
    }
}

/**
 * Check First Test Badge
 * 
 * Awards badge on first test submission.
 * 
 * @param context - Badge earning context
 * @returns Badge check result
 */
export async function checkFirstTest(
    context: BadgeEarningContext
): Promise<BadgeCheckResult> {
    const { studentId } = context;

    try {
        // Check if already has this badge
        const alreadyHas = await hasBadge(studentId, BadgeType.FIRST_TEST);
        if (alreadyHas) {
            return { earned: false, reason: 'Already has FIRST_TEST badge' };
        }

        // Check if this is their first result
        const resultsRef = ref(database, `test_results_by_student/${studentId}`);
        const snapshot = await get(resultsRef);

        if (!snapshot.exists()) {
            return { earned: false, reason: 'No results found' };
        }

        const results = Object.keys(snapshot.val());

        // Award badge if this is the first result
        if (results.length === 1) {
            return {
                earned: true,
                badge: {
                    type: BadgeType.FIRST_TEST,
                    earnedAt: context.submittedAt,
                    testId: context.testId,
                },
            };
        }

        return { earned: false, reason: 'Not first test' };
    } catch (error) {
        console.error('Error checking first test badge:', error);
        return { earned: false, reason: 'Error occurred' };
    }
}

/**
 * Check Perfect Score Badge
 * 
 * Awards badge on achieving 100% score.
 * 
 * @param context - Badge earning context
 * @returns Badge check result
 */
export async function checkPerfectScore(
    context: BadgeEarningContext
): Promise<BadgeCheckResult> {
    const { studentId, score } = context;

    try {
        // Check score
        if (score < 100) {
            return { earned: false, reason: 'Score not 100%' };
        }

        // Check if already has this badge
        const alreadyHas = await hasBadge(studentId, BadgeType.PERFECT_SCORE);
        if (alreadyHas) {
            return { earned: false, reason: 'Already has PERFECT_SCORE badge' };
        }

        return {
            earned: true,
            badge: {
                type: BadgeType.PERFECT_SCORE,
                earnedAt: context.submittedAt,
                testId: context.testId,
            },
        };
    } catch (error) {
        console.error('Error checking perfect score badge:', error);
        return { earned: false, reason: 'Error occurred' };
    }
}

/**
 * Check On Fire Badge
 * 
 * Awards badge on 5-day study streak.
 * 
 * @param context - Badge earning context
 * @returns Badge check result
 */
export async function checkOnFire(
    context: BadgeEarningContext
): Promise<BadgeCheckResult> {
    const { studentId } = context;

    try {
        // Check if already has this badge
        const alreadyHas = await hasBadge(studentId, BadgeType.ON_FIRE);
        if (alreadyHas) {
            return { earned: false, reason: 'Already has ON_FIRE badge' };
        }

        // Get all results
        const resultsRef = ref(database, `test_results_by_student/${studentId}`);
        const snapshot = await get(resultsRef);

        if (!snapshot.exists()) {
            return { earned: false, reason: 'No results found' };
        }

        // Get submission dates (as YYYY-MM-DD strings)
        const results = Object.values(snapshot.val()) as any[];
        const dates = results.map((r) => {
            const date = new Date(r.submittedAt);
            return date.toISOString().split('T')[0]; // YYYY-MM-DD
        });

        // Get unique dates and sort
        const uniqueDates = Array.from(new Set(dates)).sort();

        // Check for 5 consecutive days
        let streak = 1;
        let maxStreak = 1;

        for (let i = 1; i < uniqueDates.length; i++) {
            const prevDate = new Date(uniqueDates[i - 1]);
            const currDate = new Date(uniqueDates[i]);
            const dayDiff = Math.floor(
                (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
            );

            if (dayDiff === 1) {
                streak++;
                maxStreak = Math.max(maxStreak, streak);
            } else {
                streak = 1;
            }
        }

        if (maxStreak >= 5) {
            return {
                earned: true,
                badge: {
                    type: BadgeType.ON_FIRE,
                    earnedAt: context.submittedAt,
                },
            };
        }

        return { earned: false, reason: `Streak is ${maxStreak}, need 5` };
    } catch (error) {
        console.error('Error checking on fire badge:', error);
        return { earned: false, reason: 'Error occurred' };
    }
}

/**
 * Check Module Master Badge
 * 
 * Awards badge on completing all tests in a module.
 * 
 * @param context - Badge earning context
 * @returns Badge check result
 */
export async function checkModuleMaster(
    context: BadgeEarningContext
): Promise<BadgeCheckResult> {
    const { studentId, courseId, moduleId } = context;

    try {
        // Need module context
        if (!courseId || !moduleId) {
            return { earned: false, reason: 'No module context' };
        }

        // Get all tests in this module
        const moduleRef = ref(database, `courses/${courseId}/modules/${moduleId}/materials`);
        const moduleSnapshot = await get(moduleRef);

        if (!moduleSnapshot.exists()) {
            return { earned: false, reason: 'Module not found' };
        }

        const materials = Object.values(moduleSnapshot.val()) as any[];
        const testMaterials = materials.filter((m) => m.type === 'test');

        if (testMaterials.length === 0) {
            return { earned: false, reason: 'No tests in module' };
        }

        // Get student's results for this module
        const resultsRef = ref(database, `test_results_by_student/${studentId}`);
        const resultsSnapshot = await get(resultsRef);

        if (!resultsSnapshot.exists()) {
            return { earned: false, reason: 'No results found' };
        }

        const results = Object.values(resultsSnapshot.val()) as any[];
        const moduleResults = results.filter(
            (r) => r.courseId === courseId && r.moduleId === moduleId
        );

        // Check if all tests are completed
        const completedTestIds = new Set(moduleResults.map((r) => r.testId));
        const allTestsCompleted = testMaterials.every((t) =>
            completedTestIds.has(t.id)
        );

        if (allTestsCompleted) {
            // Check if already has this badge for this module
            const badges = await getStudentBadges(studentId);
            const hasModuleBadge = badges.some(
                (b) =>
                    b.type === BadgeType.MODULE_MASTER &&
                    b.moduleId === moduleId &&
                    b.courseId === courseId
            );

            if (hasModuleBadge) {
                return { earned: false, reason: 'Already has MODULE_MASTER for this module' };
            }

            return {
                earned: true,
                badge: {
                    type: BadgeType.MODULE_MASTER,
                    earnedAt: context.submittedAt,
                    courseId,
                    moduleId,
                },
            };
        }

        return {
            earned: false,
            reason: `Completed ${completedTestIds.size}/${testMaterials.length} tests`,
        };
    } catch (error) {
        console.error('Error checking module master badge:', error);
        return { earned: false, reason: 'Error occurred' };
    }
}

/**
 * Check Course Champion Badge
 * 
 * Awards badge on completing entire course.
 * 
 * @param context - Badge earning context
 * @returns Badge check result
 */
export async function checkCourseChampion(
    context: BadgeEarningContext
): Promise<BadgeCheckResult> {
    const { studentId, courseId } = context;

    try {
        // Need course context
        if (!courseId) {
            return { earned: false, reason: 'No course context' };
        }

        // Get all modules in course
        const modulesRef = ref(database, `courses/${courseId}/modules`);
        const modulesSnapshot = await get(modulesRef);

        if (!modulesSnapshot.exists()) {
            return { earned: false, reason: 'Course not found' };
        }

        const modules = Object.entries(modulesSnapshot.val()) as [string, any][];

        // Get all tests in all modules
        let totalTests = 0;
        const allTestIds = new Set<string>();

        for (const [moduleId, moduleData] of modules) {
            if (moduleData.materials) {
                const materials = Object.values(moduleData.materials) as any[];
                const tests = materials.filter((m) => m.type === 'test');
                tests.forEach((t) => allTestIds.add(t.id));
                totalTests += tests.length;
            }
        }

        if (totalTests === 0) {
            return { earned: false, reason: 'No tests in course' };
        }

        // Get student's results for this course
        const resultsRef = ref(database, `test_results_by_student/${studentId}`);
        const resultsSnapshot = await get(resultsRef);

        if (!resultsSnapshot.exists()) {
            return { earned: false, reason: 'No results found' };
        }

        const results = Object.values(resultsSnapshot.val()) as any[];
        const courseResults = results.filter((r) => r.courseId === courseId);

        // Check if all tests are completed
        const completedTestIds = new Set(courseResults.map((r) => r.testId));
        const allTestsCompleted = Array.from(allTestIds).every((id) =>
            completedTestIds.has(id)
        );

        if (allTestsCompleted) {
            // Check if already has this badge for this course
            const badges = await getStudentBadges(studentId);
            const hasCourseBadge = badges.some(
                (b) =>
                    b.type === BadgeType.COURSE_CHAMPION && b.courseId === courseId
            );

            if (hasCourseBadge) {
                return { earned: false, reason: 'Already has COURSE_CHAMPION for this course' };
            }

            return {
                earned: true,
                badge: {
                    type: BadgeType.COURSE_CHAMPION,
                    earnedAt: context.submittedAt,
                    courseId,
                },
            };
        }

        return {
            earned: false,
            reason: `Completed ${completedTestIds.size}/${totalTests} tests in course`,
        };
    } catch (error) {
        console.error('Error checking course champion badge:', error);
        return { earned: false, reason: 'Error occurred' };
    }
}

/**
 * Check Improvement Star Badge
 * 
 * Awards badge on 20%+ improvement on same test.
 * 
 * @param context - Badge earning context
 * @returns Badge check result
 */
export async function checkImprovementStar(
    context: BadgeEarningContext
): Promise<BadgeCheckResult> {
    const { studentId, testId, score } = context;

    try {
        if (!testId) {
            return { earned: false, reason: 'No test ID' };
        }

        // Get all results for this student
        const resultsRef = ref(database, `test_results_by_student/${studentId}`);
        const snapshot = await get(resultsRef);

        if (!snapshot.exists()) {
            return { earned: false, reason: 'No results found' };
        }

        // Find previous attempts on same test
        const results = Object.values(snapshot.val()) as any[];
        const sameTestResults = results
            .filter((r) => r.testId === testId)
            .sort((a, b) => a.submittedAt - b.submittedAt);

        if (sameTestResults.length < 2) {
            return { earned: false, reason: 'No previous attempts' };
        }

        // Get second-to-last result (previous attempt)
        const previousAttempt = sameTestResults[sameTestResults.length - 2];
        const improvement = score - previousAttempt.score;

        if (improvement >= 20) {
            // Check if already has this badge
            const alreadyHas = await hasBadge(studentId, BadgeType.IMPROVEMENT_STAR);
            if (alreadyHas) {
                return { earned: false, reason: 'Already has IMPROVEMENT_STAR badge' };
            }

            return {
                earned: true,
                badge: {
                    type: BadgeType.IMPROVEMENT_STAR,
                    earnedAt: context.submittedAt,
                    testId,
                },
            };
        }

        return {
            earned: false,
            reason: `Improvement ${improvement.toFixed(1)}%, need 20%`,
        };
    } catch (error) {
        console.error('Error checking improvement star badge:', error);
        return { earned: false, reason: 'Error occurred' };
    }
}
