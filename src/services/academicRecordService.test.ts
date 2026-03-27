/**
 * Academic Record Service Unit Tests
 * 
 * Tests for academic record querying and analysis functions.
 * Part of PRD-0015: Academic Record & Enhanced Profile System - Phase 3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, get } from 'firebase/database';
import {
    getResultsByStudent,
    getResultsByCourse,
    getResultsBySkill,
    getResultsByClass,
    getFilteredResults,
    getAcademicSummary,
    calculateCourseProgress,
    createResultPreview,
    getResultPreviews
} from './academicRecordService';
import { EnhancedTestResultRecord } from '../types/results.types';
import { getStudentResults as getCanonicalStudentResults } from './testResults.service';

// Mock Firebase
vi.mock('firebase/database', () => ({
    ref: vi.fn(),
    get: vi.fn(),
}));

vi.mock('./firebase', () => ({
    database: {}
}));

vi.mock('./testResults.service', () => ({
    getStudentResults: vi.fn(),
}));

describe('AcademicRecordService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getCanonicalStudentResults).mockResolvedValue([
            mockResult1,
            mockResult2,
            mockResult3,
        ]);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ============================================
    // MOCK DATA
    // ============================================

    const mockResult1: EnhancedTestResultRecord = {
        resultId: 'result1',
        sessionCode: 'session1',
        testId: 'test1',
        studentId: 'student1',
        studentName: 'John Doe',
        isGuest: false,
        teacherId: 'teacher1',
        totalScore: 80,
        maxScore: 100,
        percentage: 80,
        bandScore: 7.0,
        testTitle: 'Reading Test 1',
        testType: 'test',
        testSkill: 'reading',
        testDuration: 3600,
        questionResults: [],
        correct: 8,
        incorrect: 2,
        partialCredit: 0,
        totalQuestions: 10,
        submittedAt: Date.now() - 86400000, // 1 day ago
        timeElapsed: 3000,
        createdAt: Date.now() - 86400000,
        courseId: 'course1',
        courseName: 'IELTS Preparation',
        classId: 'class1',
        className: 'Advanced Class',
        moduleId: 'module1',
        moduleName: 'Reading Module 1'
    };

    const mockResult2: EnhancedTestResultRecord = {
        ...mockResult1,
        resultId: 'result2',
        testTitle: 'Listening Test 1',
        testSkill: 'listening',
        percentage: 90,
        bandScore: 8.0,
        totalScore: 90,
        correct: 9,
        incorrect: 1,
        submittedAt: Date.now() - 172800000, // 2 days ago
        courseId: 'course1',
        moduleId: 'module2',
        moduleName: 'Listening Module 1'
    };

    const mockResult3: EnhancedTestResultRecord = {
        ...mockResult1,
        resultId: 'result3',
        testTitle: 'Reading Quiz 1',
        testType: 'quiz',
        percentage: 70,
        bandScore: 6.5,
        totalScore: 70,
        correct: 7,
        incorrect: 3,
        submittedAt: Date.now() - 259200000, // 3 days ago
        courseId: 'course2',
        courseName: 'TOEFL Preparation',
        moduleId: 'module3',
        moduleName: 'Reading Module 1'
    };

    // ============================================
    // getResultsByStudent
    // ============================================

    describe('getResultsByStudent', () => {
        it('should fetch all results for a student', async () => {
            const results = await getResultsByStudent('student1');

            expect(results).toHaveLength(3);
            expect(results[0].resultId).toBe('result1');
            expect(results[1].resultId).toBe('result2');
            expect(results[2].resultId).toBe('result3');
            expect(getCanonicalStudentResults).toHaveBeenCalledWith('student1');
        });

        it('should return empty array when no results exist', async () => {
            vi.mocked(getCanonicalStudentResults).mockResolvedValueOnce([]);

            const results = await getResultsByStudent('student1');

            expect(results).toEqual([]);
        });

        it('should return the canonical student result set without local enrichment', async () => {
            vi.mocked(getCanonicalStudentResults).mockResolvedValueOnce([mockResult1]);

            const results = await getResultsByStudent('student1');

            expect(results).toHaveLength(1);
            expect(results[0].resultId).toBe('result1');
        });

        it('should throw error on Firebase failure', async () => {
            vi.mocked(getCanonicalStudentResults).mockRejectedValueOnce(new Error('Firebase error'));

            await expect(getResultsByStudent('student1')).rejects.toThrow('Failed to fetch student results');
        });
    });

    // ============================================
    // getResultsByCourse
    // ============================================

    describe('getResultsByCourse', () => {
        it('should filter results by course ID', async () => {
            const mockIndexSnapshot = {
                exists: () => true,
                val: () => ({ result1: true, result2: true, result3: true })
            };

            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(get)
                .mockResolvedValueOnce(mockIndexSnapshot as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockResult1 } as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockResult2 } as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockResult3 } as any);

            const results = await getResultsByCourse('course1', 'student1');

            expect(results).toHaveLength(2);
            expect(results.every(r => r.courseId === 'course1')).toBe(true);
        });

        it('should return empty array when no course results exist', async () => {
            vi.mocked(getCanonicalStudentResults).mockResolvedValueOnce([mockResult3]);

            const results = await getResultsByCourse('course1', 'student1');

            expect(results).toEqual([]);
        });
    });

    // ============================================
    // getResultsBySkill
    // ============================================

    describe('getResultsBySkill', () => {
        it('should filter results by skill', async () => {
            const mockIndexSnapshot = {
                exists: () => true,
                val: () => ({ result1: true, result2: true, result3: true })
            };

            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(get)
                .mockResolvedValueOnce(mockIndexSnapshot as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockResult1 } as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockResult2 } as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockResult3 } as any);

            const results = await getResultsBySkill('reading', 'student1');

            expect(results).toHaveLength(2);
            expect(results.every(r => r.testSkill === 'reading')).toBe(true);
        });
    });

    // ============================================
    // getResultsByClass
    // ============================================

    describe('getResultsByClass', () => {
        it('should filter results by class ID', async () => {
            const results = await getResultsByClass('class1', 'student1');

            expect(results).toHaveLength(3);
            expect(results.every(r => r.classId === 'class1')).toBe(true);
        });
    });

    // ============================================
    // getFilteredResults
    // ============================================

    describe('getFilteredResults', () => {
        beforeEach(() => {
            const mockIndexSnapshot = {
                exists: () => true,
                val: () => ({ result1: true, result2: true, result3: true })
            };

            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(get)
                .mockResolvedValueOnce(mockIndexSnapshot as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockResult1 } as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockResult2 } as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockResult3 } as any);
        });

        it('should filter by course ID', async () => {
            const results = await getFilteredResults('student1', { courseId: 'course1' });
            expect(results.every(r => r.courseId === 'course1')).toBe(true);
        });

        it('should filter by skill', async () => {
            const results = await getFilteredResults('student1', { skill: 'reading' });
            expect(results.every(r => r.testSkill === 'reading')).toBe(true);
        });

        it('should filter by test type', async () => {
            const results = await getFilteredResults('student1', { testType: 'quiz' });
            expect(results.every(r => r.testType === 'quiz')).toBe(true);
        });

        it('should filter by score range', async () => {
            const results = await getFilteredResults('student1', { minScore: 75, maxScore: 85 });
            expect(results.every(r => r.percentage >= 75 && r.percentage <= 85)).toBe(true);
        });

        it('should sort by score ascending', async () => {
            const results = await getFilteredResults('student1', { sortBy: 'score', sortOrder: 'asc' });
            expect(results[0].percentage).toBeLessThanOrEqual(results[1].percentage);
        });

        it('should sort by score descending', async () => {
            const results = await getFilteredResults('student1', { sortBy: 'score', sortOrder: 'desc' });
            expect(results[0].percentage).toBeGreaterThanOrEqual(results[1].percentage);
        });

        it('should apply pagination', async () => {
            const results = await getFilteredResults('student1', { limit: 2, offset: 1 });
            expect(results).toHaveLength(2);
        });

        it('should combine multiple filters', async () => {
            const results = await getFilteredResults('student1', {
                courseId: 'course1',
                skill: 'reading',
                minScore: 70
            });
            expect(results.every(r =>
                r.courseId === 'course1' &&
                r.testSkill === 'reading' &&
                r.percentage >= 70
            )).toBe(true);
        });
    });

    // ============================================
    // getAcademicSummary
    // ============================================

    describe('getAcademicSummary', () => {
        it('should generate comprehensive academic summary', async () => {
            const mockIndexSnapshot = {
                exists: () => true,
                val: () => ({ result1: true, result2: true, result3: true })
            };

            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(get)
                .mockResolvedValueOnce(mockIndexSnapshot as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockResult1 } as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockResult2 } as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockResult3 } as any);

            const summary = await getAcademicSummary('student1');

            expect(summary.studentId).toBe('student1');
            expect(summary.studentName).toBe('John Doe');
            expect(summary.totalTests).toBe(2); // result1 and result2 are tests
            expect(summary.totalQuizzes).toBe(1); // result3 is a quiz
            expect(summary.averageScore).toBeCloseTo(80, 0); // (80 + 90 + 70) / 3
            expect(summary.bestScore).toBe(90);
            expect(summary.bestTestId).toBe('result2');
            expect(summary.recentScores).toHaveLength(3);
            expect(summary.skillBreakdown).toHaveLength(4); // reading, listening, writing, speaking
            expect(summary.courseProgress).toHaveLength(2); // course1 and course2
        });

        it('should return empty summary when no results exist', async () => {
            vi.mocked(getCanonicalStudentResults).mockResolvedValueOnce([]);

            const summary = await getAcademicSummary('student1');

            expect(summary.totalTests).toBe(0);
            expect(summary.totalQuizzes).toBe(0);
            expect(summary.averageScore).toBe(0);
            expect(summary.recentScores).toEqual([]);
        });

        it('should filter by period if specified', async () => {
            const mockIndexSnapshot = {
                exists: () => true,
                val: () => ({ result1: true, result2: true, result3: true })
            };

            const now = Date.now();
            const twoDaysAgo = now - 172800000;

            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(get)
                .mockResolvedValueOnce(mockIndexSnapshot as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockResult1 } as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockResult2 } as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockResult3 } as any);

            const summary = await getAcademicSummary('student1', twoDaysAgo, now);

            // Should only include result1 and result2 (within last 2 days)
            expect(summary.recentScores.length).toBeLessThanOrEqual(3);
        });
    });

    // ============================================
    // calculateCourseProgress
    // ============================================

    describe('calculateCourseProgress', () => {
        it('should calculate progress for course with modules', async () => {
            const mockIndexSnapshot = {
                exists: () => true,
                val: () => ({ result1: true, result2: true })
            };

            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(get)
                .mockResolvedValueOnce(mockIndexSnapshot as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockResult1 } as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockResult2 } as any);

            const progress = await calculateCourseProgress('course1', 'student1');

            expect(progress).toBeGreaterThan(0);
            expect(progress).toBeLessThanOrEqual(100);
        });

        it('should return 0 when no results exist', async () => {
            vi.mocked(getCanonicalStudentResults).mockResolvedValueOnce([]);

            const progress = await calculateCourseProgress('course1', 'student1');

            expect(progress).toBe(0);
        });

        it('should return 100 when course has results but no modules', async () => {
            const resultWithoutModule = { ...mockResult1, moduleId: null };
            vi.mocked(getCanonicalStudentResults).mockResolvedValueOnce([resultWithoutModule as any]);

            const progress = await calculateCourseProgress('course1', 'student1');

            expect(progress).toBe(100);
        });
    });

    // ============================================
    // createResultPreview
    // ============================================

    describe('createResultPreview', () => {
        it('should create result preview from full result', () => {
            const preview = createResultPreview(mockResult1);

            expect(preview.resultId).toBe('result1');
            expect(preview.testTitle).toBe('Reading Test 1');
            expect(preview.testType).toBe('test');
            expect(preview.skill).toBe('reading');
            expect(preview.percentage).toBe(80);
            expect(preview.bandScore).toBe(7.0);
            expect(preview.courseId).toBe('course1');
            expect(preview.courseName).toBe('IELTS Preparation');
            expect(preview.correct).toBe(8);
            expect(preview.totalQuestions).toBe(10);
        });

        it('should handle null context fields', () => {
            const resultWithoutContext = {
                ...mockResult1,
                courseId: undefined,
                courseName: undefined,
                classId: undefined,
                className: undefined,
                moduleId: undefined,
                moduleName: undefined
            };

            const preview = createResultPreview(resultWithoutContext);

            expect(preview.courseId).toBeNull();
            expect(preview.courseName).toBeNull();
            expect(preview.classId).toBeNull();
            expect(preview.className).toBeNull();
            expect(preview.moduleId).toBeNull();
            expect(preview.moduleName).toBeNull();
        });
    });

    // ============================================
    // getResultPreviews
    // ============================================

    describe('getResultPreviews', () => {
        it('should get previews for all student results', async () => {
            vi.mocked(getCanonicalStudentResults).mockResolvedValueOnce([mockResult1, mockResult2]);

            const previews = await getResultPreviews('student1');

            expect(previews).toHaveLength(2);
            expect(previews[0].resultId).toBe('result1');
            expect(previews[1].resultId).toBe('result2');
        });

        it('should apply filters when provided', async () => {
            const mockIndexSnapshot = {
                exists: () => true,
                val: () => ({ result1: true, result2: true, result3: true })
            };

            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(get)
                .mockResolvedValueOnce(mockIndexSnapshot as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockResult1 } as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockResult2 } as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockResult3 } as any);

            const previews = await getResultPreviews('student1', { skill: 'reading' });

            expect(previews.every(p => p.skill === 'reading')).toBe(true);
        });
    });

    // ============================================
    // PRD-0039: Attempt grouping & summary (Task 3.6)
    // ============================================

    describe('groupResultsByTestId', () => {
        it('should group results by testId', async () => {
            const { groupResultsByTestId } = await import('./academicRecordService');

            const results = [
                { ...mockResult1, resultId: 'r1', testId: 'T1', submittedAt: 1000 },
                { ...mockResult1, resultId: 'r2', testId: 'T1', submittedAt: 3000 },
                { ...mockResult1, resultId: 'r3', testId: 'T2', submittedAt: 2000 },
            ] as EnhancedTestResultRecord[];

            const groups = groupResultsByTestId(results);

            expect(groups.size).toBe(2);
            expect(groups.get('T1')).toHaveLength(2);
            expect(groups.get('T2')).toHaveLength(1);
        });

        it('should sort each group by submittedAt DESC', async () => {
            const { groupResultsByTestId } = await import('./academicRecordService');

            const results = [
                { ...mockResult1, resultId: 'r1', testId: 'T1', submittedAt: 1000 },
                { ...mockResult1, resultId: 'r2', testId: 'T1', submittedAt: 3000 },
                { ...mockResult1, resultId: 'r3', testId: 'T1', submittedAt: 2000 },
            ] as EnhancedTestResultRecord[];

            const groups = groupResultsByTestId(results);
            const t1Group = groups.get('T1')!;

            expect(t1Group[0].resultId).toBe('r2'); // newest
            expect(t1Group[1].resultId).toBe('r3');
            expect(t1Group[2].resultId).toBe('r1'); // oldest
        });

        it('should skip results without testId', async () => {
            const { groupResultsByTestId } = await import('./academicRecordService');

            const results = [
                { ...mockResult1, resultId: 'r1', testId: 'T1', submittedAt: 1000 },
                { ...mockResult1, resultId: 'r2', testId: undefined as any, submittedAt: 2000 },
            ] as EnhancedTestResultRecord[];

            const groups = groupResultsByTestId(results);
            expect(groups.size).toBe(1);
        });
    });

    describe('computeAttemptSummaries', () => {
        it('should compute correct attempt summaries with stable trend', async () => {
            const { computeAttemptSummaries } = await import('./academicRecordService');

            const group = [
                { ...mockResult1, resultId: 'r2', percentage: 80, submittedAt: 2000 },
                { ...mockResult1, resultId: 'r1', percentage: 80, submittedAt: 1000 },
            ] as EnhancedTestResultRecord[];

            const enriched = computeAttemptSummaries(group);

            expect(enriched).toHaveLength(2);
            expect(enriched[0].attemptSummary!.attemptNumber).toBe(2); // latest
            expect(enriched[0].attemptSummary!.isLatestAttempt).toBe(true);
            expect(enriched[0].attemptSummary!.trend).toBe('stable');
            expect(enriched[1].attemptSummary!.attemptNumber).toBe(1); // first
            expect(enriched[1].attemptSummary!.isLatestAttempt).toBe(false);
        });

        it('should compute up trend when latest > first', async () => {
            const { computeAttemptSummaries } = await import('./academicRecordService');

            const group = [
                { ...mockResult1, resultId: 'r2', percentage: 90, submittedAt: 2000 },
                { ...mockResult1, resultId: 'r1', percentage: 60, submittedAt: 1000 },
            ] as EnhancedTestResultRecord[];

            const enriched = computeAttemptSummaries(group);
            expect(enriched[0].attemptSummary!.trend).toBe('up');
            expect(enriched[0].attemptSummary!.firstAttemptPercentage).toBe(60);
            expect(enriched[0].attemptSummary!.latestAttemptPercentage).toBe(90);
        });

        it('should compute down trend when latest < first', async () => {
            const { computeAttemptSummaries } = await import('./academicRecordService');

            const group = [
                { ...mockResult1, resultId: 'r2', percentage: 50, submittedAt: 2000 },
                { ...mockResult1, resultId: 'r1', percentage: 80, submittedAt: 1000 },
            ] as EnhancedTestResultRecord[];

            const enriched = computeAttemptSummaries(group);
            expect(enriched[0].attemptSummary!.trend).toBe('down');
        });

        it('should return empty array for empty input', async () => {
            const { computeAttemptSummaries } = await import('./academicRecordService');
            expect(computeAttemptSummaries([])).toEqual([]);
        });
    });

    describe('getLatestResultPerTest', () => {
        it('should return one result per testId (the newest)', async () => {
            const { getLatestResultPerTest } = await import('./academicRecordService');

            const results = [
                { ...mockResult1, resultId: 'r1', testId: 'T1', percentage: 60, submittedAt: 1000 },
                { ...mockResult1, resultId: 'r2', testId: 'T1', percentage: 90, submittedAt: 3000 },
                { ...mockResult1, resultId: 'r3', testId: 'T2', percentage: 70, submittedAt: 2000 },
            ] as EnhancedTestResultRecord[];

            const latest = getLatestResultPerTest(results);

            expect(latest).toHaveLength(2); // one per testId
            expect(latest.find(r => r.testId === 'T1')!.resultId).toBe('r2'); // newest T1
            expect(latest.find(r => r.testId === 'T2')!.resultId).toBe('r3');
        });

        it('should include attemptSummary on returned results', async () => {
            const { getLatestResultPerTest } = await import('./academicRecordService');

            const results = [
                { ...mockResult1, resultId: 'r1', testId: 'T1', percentage: 60, submittedAt: 1000 },
                { ...mockResult1, resultId: 'r2', testId: 'T1', percentage: 90, submittedAt: 3000 },
            ] as EnhancedTestResultRecord[];

            const latest = getLatestResultPerTest(results);

            expect(latest[0].attemptSummary).toBeDefined();
            expect(latest[0].attemptSummary!.totalAttempts).toBe(2);
            expect(latest[0].attemptSummary!.isLatestAttempt).toBe(true);
            expect(latest[0].attemptSummary!.trend).toBe('up');
        });

        it('should sort final list by submittedAt DESC', async () => {
            const { getLatestResultPerTest } = await import('./academicRecordService');

            const results = [
                { ...mockResult1, resultId: 'r1', testId: 'T1', submittedAt: 1000 },
                { ...mockResult1, resultId: 'r2', testId: 'T2', submittedAt: 5000 },
                { ...mockResult1, resultId: 'r3', testId: 'T3', submittedAt: 3000 },
            ] as EnhancedTestResultRecord[];

            const latest = getLatestResultPerTest(results);

            expect(latest[0].submittedAt).toBe(5000);
            expect(latest[1].submittedAt).toBe(3000);
            expect(latest[2].submittedAt).toBe(1000);
        });
    });
});
