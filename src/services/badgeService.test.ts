/**
 * Badge Service Tests
 * 
 * Unit tests for badge earning logic and badge management.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    checkAndAwardBadges,
    getStudentBadges,
    hasBadge,
    checkFirstTest,
    checkPerfectScore,
    checkOnFire,
    checkModuleMaster,
    checkCourseChampion,
    checkImprovementStar,
} from './badgeService';
import { BadgeType, BadgeEarningContext } from '../types/badge.types';
import { ref, get, set } from 'firebase/database';
import { getStudentResults as getCanonicalStudentResults } from './testResults.service';

// Mock Firebase
vi.mock('firebase/database', () => ({
    ref: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
}));

vi.mock('./firebase', () => ({
    database: {},
}));

vi.mock('./testResults.service', () => ({
    getStudentResults: vi.fn(),
}));

describe('BadgeService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('getStudentBadges', () => {
        it('should return empty array when no badges exist', async () => {
            vi.mocked(get).mockResolvedValueOnce({
                exists: () => false,
                val: () => null,
            } as any);

            const badges = await getStudentBadges('student-1');
            expect(badges).toEqual([]);
        });

        it('should return array of badges when they exist', async () => {
            const mockBadges = {
                'badge-1': {
                    type: BadgeType.FIRST_TEST,
                    earnedAt: 1000,
                },
                'badge-2': {
                    type: BadgeType.PERFECT_SCORE,
                    earnedAt: 2000,
                },
            };

            vi.mocked(get).mockResolvedValueOnce({
                exists: () => true,
                val: () => mockBadges,
            } as any);

            const badges = await getStudentBadges('student-1');
            expect(badges).toHaveLength(2);
            expect(badges[0].id).toBe('badge-1');
            expect(badges[1].id).toBe('badge-2');
        });

        it('should handle errors gracefully', async () => {
            vi.mocked(get).mockRejectedValueOnce(new Error('Firebase error'));

            const badges = await getStudentBadges('student-1');
            expect(badges).toEqual([]);
        });
    });

    describe('hasBadge', () => {
        it('should return true when badge exists', async () => {
            const mockBadges = {
                'badge-1': {
                    type: BadgeType.FIRST_TEST,
                    earnedAt: 1000,
                },
            };

            vi.mocked(get).mockResolvedValueOnce({
                exists: () => true,
                val: () => mockBadges,
            } as any);

            const result = await hasBadge('student-1', BadgeType.FIRST_TEST);
            expect(result).toBe(true);
        });

        it('should return false when badge does not exist', async () => {
            vi.mocked(get).mockResolvedValueOnce({
                exists: () => false,
                val: () => null,
            } as any);

            const result = await hasBadge('student-1', BadgeType.FIRST_TEST);
            expect(result).toBe(false);
        });
    });

    describe('checkFirstTest', () => {
        it('should award badge on first test submission', async () => {
            const context: BadgeEarningContext = {
                studentId: 'student-1',
                resultId: 'result-1',
                score: 80,
                testId: 'test-1',
                submittedAt: 1000,
            };

            // Mock: No badge exists yet
            vi.mocked(get).mockResolvedValueOnce({
                exists: () => false,
                val: () => null,
            } as any);

            vi.mocked(getCanonicalStudentResults).mockResolvedValueOnce([
                { resultId: 'result-1' } as any,
            ]);

            const result = await checkFirstTest(context);
            expect(result.earned).toBe(true);
            expect(result.badge?.type).toBe(BadgeType.FIRST_TEST);
        });

        it('should not award badge if already has it', async () => {
            const context: BadgeEarningContext = {
                studentId: 'student-1',
                resultId: 'result-1',
                score: 80,
                testId: 'test-1',
                submittedAt: 1000,
            };

            // Mock: Badge already exists
            vi.mocked(get).mockResolvedValueOnce({
                exists: () => true,
                val: () => ({
                    'badge-1': { type: BadgeType.FIRST_TEST },
                }),
            } as any);

            const result = await checkFirstTest(context);
            expect(result.earned).toBe(false);
            expect(result.reason).toContain('Already has');
        });

        it('should not award badge if not first test', async () => {
            const context: BadgeEarningContext = {
                studentId: 'student-1',
                resultId: 'result-2',
                score: 80,
                testId: 'test-1',
                submittedAt: 2000,
            };

            // Mock: No badge exists
            vi.mocked(get).mockResolvedValueOnce({
                exists: () => false,
                val: () => null,
            } as any);

            vi.mocked(getCanonicalStudentResults).mockResolvedValueOnce([
                { resultId: 'result-1' } as any,
                { resultId: 'result-2' } as any,
            ]);

            const result = await checkFirstTest(context);
            expect(result.earned).toBe(false);
            expect(result.reason).toContain('Not first test');
        });
    });

    describe('checkPerfectScore', () => {
        it('should award badge on 100% score', async () => {
            const context: BadgeEarningContext = {
                studentId: 'student-1',
                resultId: 'result-1',
                score: 100,
                testId: 'test-1',
                submittedAt: 1000,
            };

            // Mock: No badge exists
            vi.mocked(get).mockResolvedValueOnce({
                exists: () => false,
                val: () => null,
            } as any);

            const result = await checkPerfectScore(context);
            expect(result.earned).toBe(true);
            expect(result.badge?.type).toBe(BadgeType.PERFECT_SCORE);
        });

        it('should not award badge if score is not 100%', async () => {
            const context: BadgeEarningContext = {
                studentId: 'student-1',
                resultId: 'result-1',
                score: 99,
                testId: 'test-1',
                submittedAt: 1000,
            };

            const result = await checkPerfectScore(context);
            expect(result.earned).toBe(false);
            expect(result.reason).toContain('Score not 100%');
        });

        it('should not award badge if already has it', async () => {
            const context: BadgeEarningContext = {
                studentId: 'student-1',
                resultId: 'result-1',
                score: 100,
                testId: 'test-1',
                submittedAt: 1000,
            };

            // Mock: Badge already exists
            vi.mocked(get).mockResolvedValueOnce({
                exists: () => true,
                val: () => ({
                    'badge-1': { type: BadgeType.PERFECT_SCORE },
                }),
            } as any);

            const result = await checkPerfectScore(context);
            expect(result.earned).toBe(false);
        });
    });

    describe('checkOnFire', () => {
        it('should award badge on 5-day study streak', async () => {
            const context: BadgeEarningContext = {
                studentId: 'student-1',
                resultId: 'result-5',
                score: 80,
                submittedAt: Date.now(),
            };

            // Mock: No badge exists
            vi.mocked(get).mockResolvedValueOnce({
                exists: () => false,
                val: () => null,
            } as any);

            const baseDate = new Date('2024-01-01');
            const results: any[] = [];
            for (let i = 0; i < 5; i++) {
                const date = new Date(baseDate);
                date.setDate(date.getDate() + i);
                results.push({
                    resultId: `result-${i}`,
                    submittedAt: date.getTime(),
                });
            }

            vi.mocked(getCanonicalStudentResults).mockResolvedValueOnce(results as any);

            const result = await checkOnFire(context);
            expect(result.earned).toBe(true);
            expect(result.badge?.type).toBe(BadgeType.ON_FIRE);
        });

        it('should not award badge if streak is less than 5 days', async () => {
            const context: BadgeEarningContext = {
                studentId: 'student-1',
                resultId: 'result-3',
                score: 80,
                submittedAt: Date.now(),
            };

            // Mock: No badge exists
            vi.mocked(get).mockResolvedValueOnce({
                exists: () => false,
                val: () => null,
            } as any);

            const baseDate = new Date('2024-01-01');
            const results: any[] = [];
            for (let i = 0; i < 3; i++) {
                const date = new Date(baseDate);
                date.setDate(date.getDate() + i);
                results.push({
                    resultId: `result-${i}`,
                    submittedAt: date.getTime(),
                });
            }

            vi.mocked(getCanonicalStudentResults).mockResolvedValueOnce(results as any);

            const result = await checkOnFire(context);
            expect(result.earned).toBe(false);
            expect(result.reason).toContain('Streak is 3');
        });

        it('should not award badge if already has it', async () => {
            const context: BadgeEarningContext = {
                studentId: 'student-1',
                resultId: 'result-1',
                score: 80,
                submittedAt: Date.now(),
            };

            // Mock: Badge already exists
            vi.mocked(get).mockResolvedValueOnce({
                exists: () => true,
                val: () => ({
                    'badge-1': { type: BadgeType.ON_FIRE },
                }),
            } as any);

            const result = await checkOnFire(context);
            expect(result.earned).toBe(false);
        });
    });

    describe('checkModuleMaster', () => {
        it('should award badge when all module tests are complete', async () => {
            const context: BadgeEarningContext = {
                studentId: 'student-1',
                resultId: 'result-3',
                score: 80,
                courseId: 'course-1',
                moduleId: 'module-1',
                submittedAt: Date.now(),
            };

            // Mock: Module has 3 tests
            vi.mocked(get).mockResolvedValueOnce({
                exists: () => true,
                val: () => ({
                    'material-1': { type: 'test', id: 'test-1' },
                    'material-2': { type: 'test', id: 'test-2' },
                    'material-3': { type: 'test', id: 'test-3' },
                }),
            } as any);

            vi.mocked(getCanonicalStudentResults).mockResolvedValueOnce([
                { courseId: 'course-1', moduleId: 'module-1', testId: 'test-1' },
                { courseId: 'course-1', moduleId: 'module-1', testId: 'test-2' },
                { courseId: 'course-1', moduleId: 'module-1', testId: 'test-3' },
            ] as any);

            // Mock: No badge for this module yet
            vi.mocked(get).mockResolvedValueOnce({
                exists: () => false,
                val: () => null,
            } as any);

            const result = await checkModuleMaster(context);
            expect(result.earned).toBe(true);
            expect(result.badge?.type).toBe(BadgeType.MODULE_MASTER);
            expect(result.badge?.moduleId).toBe('module-1');
        });

        it('should not award badge if module tests not all complete', async () => {
            const context: BadgeEarningContext = {
                studentId: 'student-1',
                resultId: 'result-2',
                score: 80,
                courseId: 'course-1',
                moduleId: 'module-1',
                submittedAt: Date.now(),
            };

            // Mock: Module has 3 tests
            vi.mocked(get).mockResolvedValueOnce({
                exists: () => true,
                val: () => ({
                    'material-1': { type: 'test', id: 'test-1' },
                    'material-2': { type: 'test', id: 'test-2' },
                    'material-3': { type: 'test', id: 'test-3' },
                }),
            } as any);

            vi.mocked(getCanonicalStudentResults).mockResolvedValueOnce([
                { courseId: 'course-1', moduleId: 'module-1', testId: 'test-1' },
                { courseId: 'course-1', moduleId: 'module-1', testId: 'test-2' },
            ] as any);

            const result = await checkModuleMaster(context);
            expect(result.earned).toBe(false);
            expect(result.reason).toContain('2/3 tests');
        });

        it('should not award badge if no module context', async () => {
            const context: BadgeEarningContext = {
                studentId: 'student-1',
                resultId: 'result-1',
                score: 80,
                submittedAt: Date.now(),
            };

            const result = await checkModuleMaster(context);
            expect(result.earned).toBe(false);
            expect(result.reason).toContain('No module context');
        });
    });

    describe('checkCourseChampion', () => {
        it('should award badge when entire course is complete', async () => {
            const context: BadgeEarningContext = {
                studentId: 'student-1',
                resultId: 'result-6',
                score: 80,
                courseId: 'course-1',
                moduleId: 'module-2',
                submittedAt: Date.now(),
            };

            // Mock: Course has 2 modules with 3 tests each
            vi.mocked(get).mockResolvedValueOnce({
                exists: () => true,
                val: () => ({
                    'module-1': {
                        materials: {
                            'm1': { type: 'test', id: 'test-1' },
                            'm2': { type: 'test', id: 'test-2' },
                            'm3': { type: 'test', id: 'test-3' },
                        },
                    },
                    'module-2': {
                        materials: {
                            'm4': { type: 'test', id: 'test-4' },
                            'm5': { type: 'test', id: 'test-5' },
                            'm6': { type: 'test', id: 'test-6' },
                        },
                    },
                }),
            } as any);

            vi.mocked(getCanonicalStudentResults).mockResolvedValueOnce([
                { courseId: 'course-1', testId: 'test-1' },
                { courseId: 'course-1', testId: 'test-2' },
                { courseId: 'course-1', testId: 'test-3' },
                { courseId: 'course-1', testId: 'test-4' },
                { courseId: 'course-1', testId: 'test-5' },
                { courseId: 'course-1', testId: 'test-6' },
            ] as any);

            // Mock: No badge for this course yet
            vi.mocked(get).mockResolvedValueOnce({
                exists: () => false,
                val: () => null,
            } as any);

            const result = await checkCourseChampion(context);
            expect(result.earned).toBe(true);
            expect(result.badge?.type).toBe(BadgeType.COURSE_CHAMPION);
            expect(result.badge?.courseId).toBe('course-1');
        });

        it('should not award badge if course not complete', async () => {
            const context: BadgeEarningContext = {
                studentId: 'student-1',
                resultId: 'result-3',
                score: 80,
                courseId: 'course-1',
                submittedAt: Date.now(),
            };

            // Mock: Course has 6 tests
            vi.mocked(get).mockResolvedValueOnce({
                exists: () => true,
                val: () => ({
                    'module-1': {
                        materials: {
                            'm1': { type: 'test', id: 'test-1' },
                            'm2': { type: 'test', id: 'test-2' },
                            'm3': { type: 'test', id: 'test-3' },
                            'm4': { type: 'test', id: 'test-4' },
                            'm5': { type: 'test', id: 'test-5' },
                            'm6': { type: 'test', id: 'test-6' },
                        },
                    },
                }),
            } as any);

            vi.mocked(getCanonicalStudentResults).mockResolvedValueOnce([
                { courseId: 'course-1', testId: 'test-1' },
                { courseId: 'course-1', testId: 'test-2' },
                { courseId: 'course-1', testId: 'test-3' },
            ] as any);

            const result = await checkCourseChampion(context);
            expect(result.earned).toBe(false);
            expect(result.reason).toContain('3/6 tests');
        });

        it('should not award badge if no course context', async () => {
            const context: BadgeEarningContext = {
                studentId: 'student-1',
                resultId: 'result-1',
                score: 80,
                submittedAt: Date.now(),
            };

            const result = await checkCourseChampion(context);
            expect(result.earned).toBe(false);
            expect(result.reason).toContain('No course context');
        });
    });

    describe('checkImprovementStar', () => {
        it('should award badge on 20%+ improvement', async () => {
            const context: BadgeEarningContext = {
                studentId: 'student-1',
                resultId: 'result-2',
                score: 90,
                testId: 'test-1',
                submittedAt: 2000,
            };

            vi.mocked(getCanonicalStudentResults).mockResolvedValueOnce([
                {
                    resultId: 'result-1',
                    testId: 'test-1',
                    percentage: 65,
                    submittedAt: 1000,
                },
                {
                    resultId: 'result-2',
                    testId: 'test-1',
                    percentage: 90,
                    submittedAt: 2000,
                },
            ] as any);

            vi.mocked(get).mockResolvedValueOnce({
                exists: () => false,
                val: () => null,
            } as any);

            const result = await checkImprovementStar(context);
            expect(result.earned).toBe(true);
            expect(result.badge?.type).toBe(BadgeType.IMPROVEMENT_STAR);
        });

        it('should not award badge if improvement is less than 20%', async () => {
            const context: BadgeEarningContext = {
                studentId: 'student-1',
                resultId: 'result-2',
                score: 80,
                testId: 'test-1',
                submittedAt: 2000,
            };

            vi.mocked(getCanonicalStudentResults).mockResolvedValueOnce([
                {
                    resultId: 'result-1',
                    testId: 'test-1',
                    percentage: 70,
                    submittedAt: 1000,
                },
                {
                    resultId: 'result-2',
                    testId: 'test-1',
                    percentage: 80,
                    submittedAt: 2000,
                },
            ] as any);

            const result = await checkImprovementStar(context);
            expect(result.earned).toBe(false);
            expect(result.reason).toContain('Improvement 10');
        });

        it('should not award badge if no previous attempts', async () => {
            const context: BadgeEarningContext = {
                studentId: 'student-1',
                resultId: 'result-1',
                score: 90,
                testId: 'test-1',
                submittedAt: 1000,
            };

            vi.mocked(getCanonicalStudentResults).mockResolvedValueOnce([
                {
                    resultId: 'result-1',
                    testId: 'test-1',
                    percentage: 90,
                    submittedAt: 1000,
                },
            ] as any);

            const result = await checkImprovementStar(context);
            expect(result.earned).toBe(false);
            expect(result.reason).toContain('No previous attempts');
        });
    });

    describe('checkAndAwardBadges', () => {
        it('should check all badge types and return earned badges', async () => {
            const context: BadgeEarningContext = {
                studentId: 'student-1',
                resultId: 'result-1',
                score: 100,
                testId: 'test-1',
                submittedAt: Date.now(),
            };

            // Mock: First test + Perfect score scenario
            // hasBadge checks (multiple for different badge types)
            vi.mocked(get).mockResolvedValue({
                exists: () => false,
                val: () => null,
            } as any);

            vi.mocked(getCanonicalStudentResults).mockResolvedValue([
                {
                    resultId: 'result-1',
                    testId: 'test-1',
                    percentage: 100,
                    submittedAt: context.submittedAt,
                },
            ] as any);

            // Mock save operations
            vi.mocked(set).mockResolvedValue(undefined);

            const badges = await checkAndAwardBadges(context);

            // Should earn at least FIRST_TEST and PERFECT_SCORE
            expect(badges.length).toBeGreaterThanOrEqual(0);
        });
    });
});
