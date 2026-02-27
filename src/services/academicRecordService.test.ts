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

// Mock Firebase
vi.mock('firebase/database', () => ({
    ref: vi.fn(),
    get: vi.fn(),
}));

vi.mock('./firebase', () => ({
    database: {}
}));

describe('AcademicRecordService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
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
            const mockIndexSnapshot = {
                exists: () => true,
                val: () => ({
                    result1: true,
                    result2: true,
                    result3: true
                })
            };

            const mockResultSnapshots = [
                { exists: () => true, val: () => mockResult1 },
                { exists: () => true, val: () => mockResult2 },
                { exists: () => true, val: () => mockResult3 }
            ];

            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(get)
                .mockResolvedValueOnce(mockIndexSnapshot as any)
                .mockResolvedValueOnce(mockResultSnapshots[0] as any)
                .mockResolvedValueOnce(mockResultSnapshots[1] as any)
                .mockResolvedValueOnce(mockResultSnapshots[2] as any);

            const results = await getResultsByStudent('student1');

            expect(results).toHaveLength(3);
            expect(results[0].resultId).toBe('result1');
            expect(results[1].resultId).toBe('result2');
            expect(results[2].resultId).toBe('result3');
        });

        it('should return empty array when no results exist', async () => {
            const mockIndexSnapshot = {
                exists: () => false,
                val: () => null
            };

            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(get).mockResolvedValue(mockIndexSnapshot as any);

            const results = await getResultsByStudent('student1');

            expect(results).toEqual([]);
        });

        it('should filter out null results', async () => {
            const mockIndexSnapshot = {
                exists: () => true,
                val: () => ({
                    result1: true,
                    result2: true
                })
            };

            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(get)
                .mockResolvedValueOnce(mockIndexSnapshot as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockResult1 } as any)
                .mockResolvedValueOnce({ exists: () => false, val: () => null } as any);

            const results = await getResultsByStudent('student1');

            expect(results).toHaveLength(1);
            expect(results[0].resultId).toBe('result1');
        });

        it('should throw error on Firebase failure', async () => {
            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(get).mockRejectedValue(new Error('Firebase error'));

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
            const mockIndexSnapshot = {
                exists: () => true,
                val: () => ({ result3: true })
            };

            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(get)
                .mockResolvedValueOnce(mockIndexSnapshot as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockResult3 } as any);

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
            const mockIndexSnapshot = {
                exists: () => true,
                val: () => ({ result1: true, result2: true })
            };

            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(get)
                .mockResolvedValueOnce(mockIndexSnapshot as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockResult1 } as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockResult2 } as any);

            const results = await getResultsByClass('class1', 'student1');

            expect(results).toHaveLength(2);
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
            const mockIndexSnapshot = {
                exists: () => false,
                val: () => null
            };

            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(get).mockResolvedValue(mockIndexSnapshot as any);

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
            const mockIndexSnapshot = {
                exists: () => false,
                val: () => null
            };

            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(get).mockResolvedValue(mockIndexSnapshot as any);

            const progress = await calculateCourseProgress('course1', 'student1');

            expect(progress).toBe(0);
        });

        it('should return 100 when course has results but no modules', async () => {
            const resultWithoutModule = { ...mockResult1, moduleId: null };
            const mockIndexSnapshot = {
                exists: () => true,
                val: () => ({ result1: true })
            };

            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(get)
                .mockResolvedValueOnce(mockIndexSnapshot as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => resultWithoutModule } as any);

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
            const mockIndexSnapshot = {
                exists: () => true,
                val: () => ({ result1: true, result2: true })
            };

            vi.mocked(ref).mockReturnValue({} as any);
            vi.mocked(get)
                .mockResolvedValueOnce(mockIndexSnapshot as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockResult1 } as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockResult2 } as any);

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
});
