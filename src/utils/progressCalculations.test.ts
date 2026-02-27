
import { describe, it, expect } from 'vitest';
import {
    calculateStudyStreak,
    calculateSkillBreakdown,
    calculateBandProgression,
    calculateAverageScore,
    findBestScore,
    calculateTypeStats
} from './progressCalculations';
import { TestResultRecord } from '../services/testResults.service';

// Helper to create mock records
const createMockResult = (overrides: Partial<TestResultRecord>): TestResultRecord => ({
    resultId: 'test-id',
    sessionCode: 'SESSION-1',
    testId: 'test-1',
    studentId: 'student-1',
    studentName: 'Test Student',
    isGuest: false,
    teacherId: 'teacher-1',
    totalScore: 8,
    maxScore: 10,
    percentage: 80,
    bandScore: 7.0,
    testTitle: 'Mock Test',
    testType: 'test',
    testSkill: 'reading',
    testDuration: 60,
    questionResults: [],
    correct: 8,
    incorrect: 2,
    partialCredit: 0,
    totalQuestions: 10,
    submittedAt: Date.now(),
    timeElapsed: 3600,
    createdAt: Date.now(),
    ...overrides
});

describe('progressCalculations', () => {

    describe('calculateStudyStreak', () => {
        it('should return 0 for empty results', () => {
            expect(calculateStudyStreak([])).toBe(0);
        });

        it('should return 0 if the last test was more than 1 day ago', () => {
            const twoDaysAgo = Date.now() - (48 * 60 * 60 * 1000) - 1000; // > 48 hours
            const results = [createMockResult({ submittedAt: twoDaysAgo })];
            expect(calculateStudyStreak(results)).toBe(0);
        });

        it('should return 1 if the last test was today', () => {
            const results = [createMockResult({ submittedAt: Date.now() })];
            expect(calculateStudyStreak(results)).toBe(1);
        });

        it('should return 1 if the last test was yesterday (within 24-48h window relative to start of day logic)', () => {
            // NOTE: The implementation uses setHours(0,0,0,0) logic.
            // Today
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Yesterday
            const yesterday = new Date(today);
            yesterday.setDate(today.getDate() - 1);

            const results = [createMockResult({ submittedAt: yesterday.getTime() + 3600000 })]; // Yesterday + 1 hour
            expect(calculateStudyStreak(results)).toBe(1); // It is a streak of 1 day (yesterday)
        });

        it('should calculate a multi-day streak correctly', () => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const day0 = today.getTime() + 3600000; // Today
            const day1 = new Date(today).setDate(today.getDate() - 1); // Yesterday
            const day2 = new Date(today).setDate(today.getDate() - 2); // 2 days ago

            const results = [
                createMockResult({ submittedAt: day0 }),
                createMockResult({ submittedAt: day1 }),
                createMockResult({ submittedAt: day2 })
            ];

            expect(calculateStudyStreak(results)).toBe(3);
        });

        it('should break streak on missing day', () => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const day0 = today.getTime() + 3600000; // Today
            const day2 = new Date(today).setDate(today.getDate() - 2); // 2 days ago (Gap of 1 day)

            const results = [
                createMockResult({ submittedAt: day0 }),
                createMockResult({ submittedAt: day2 })
            ];

            expect(calculateStudyStreak(results)).toBe(1); // Only today counts
        });
    });

    describe('calculateSkillBreakdown', () => {
        it('should fallback to defaults for empty results', () => {
            expect(calculateSkillBreakdown([])).toEqual([]);
        });

        it('should aggregate scores by skill', () => {
            const results = [
                createMockResult({ testSkill: 'reading', percentage: 80, bandScore: 7.0 }),
                createMockResult({ testSkill: 'reading', percentage: 90, bandScore: 8.0 }),
                createMockResult({ testSkill: 'listening', percentage: 60, bandScore: 6.0 })
            ];

            const breakdown = calculateSkillBreakdown(results);

            const reading = breakdown.find(b => b.skill === 'reading');
            const listening = breakdown.find(b => b.skill === 'listening');

            expect(reading).toBeDefined();
            expect(reading?.score).toBe(85); // (80+90)/2
            expect(reading?.bandScore).toBe(7.5); // (7+8)/2
            expect(reading?.count).toBe(2);

            expect(listening).toBeDefined();
            expect(listening?.score).toBe(60);
            expect(listening?.bandScore).toBe(6.0);
            expect(listening?.count).toBe(1);
        });
    });

    describe('calculateAverageScore', () => {
        it('should return 0s for empty input', () => {
            expect(calculateAverageScore([])).toEqual({ percentage: 0, bandScore: 0 });
        });

        it('should calculate correct averages', () => {
            const results = [
                createMockResult({ percentage: 50, bandScore: 5.0 }),
                createMockResult({ percentage: 100, bandScore: 9.0 })
            ];

            const avg = calculateAverageScore(results);
            expect(avg.percentage).toBe(75);
            expect(avg.bandScore).toBe(7.0);
        });
    });

    describe('findBestScore', () => {
        it('should return null for empty input', () => {
            expect(findBestScore([])).toBeNull();
        });

        it('should find the highest percentage', () => {
            const r1 = createMockResult({ percentage: 70, submittedAt: 100 });
            const r2 = createMockResult({ percentage: 90, submittedAt: 200 });
            const r3 = createMockResult({ percentage: 80, submittedAt: 300 });

            expect(findBestScore([r1, r2, r3])).toEqual(r2);
        });

        it('should break ties with most recent date', () => {
            const r1 = createMockResult({ resultId: '1', percentage: 90, submittedAt: 100 });
            const r2 = createMockResult({ resultId: '2', percentage: 90, submittedAt: 300 }); // newer

            const best = findBestScore([r1, r2]);
            expect(best?.submittedAt).toBe(300);
            expect(best?.resultId).toBe('2');
        });
    });

    describe('calculateTypeStats', () => {
        it('should initialize zero stats', () => {
            const stats = calculateTypeStats([]);
            expect(stats.reading.count).toBe(0);
            expect(stats.listening.count).toBe(0);
        });

        it('should aggregate correctly by test skill', () => {
            const results = [
                createMockResult({ testSkill: 'reading', percentage: 80 }),
                createMockResult({ testSkill: 'listening', percentage: 90 })
            ];

            const stats = calculateTypeStats(results);
            expect(stats.reading.total).toBe(80);
            expect(stats.reading.count).toBe(1);
            expect(stats.listening.total).toBe(90);
            expect(stats.listening.count).toBe(1);
        });
    });
});
