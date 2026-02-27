/**
 * Unit tests for IELTS Writing Band Score Calculator
 * PRD-0030 §4.1.3
 */

import {
    roundDownToHalf,
    roundOverallBand,
    calculateTaskBand,
    calculateOverallBand,
} from './ieltsWritingBandCalculator';
import type { WritingTaskGradingResult } from '../types/ielts-writing.types';

// ═══════════════════════════════════════════════════════════════
// roundDownToHalf
// ═══════════════════════════════════════════════════════════════

describe('roundDownToHalf', () => {
    it('rounds 6.25 down to 6.0', () => {
        expect(roundDownToHalf(6.25)).toBe(6.0);
    });

    it('keeps 6.5 as 6.5', () => {
        expect(roundDownToHalf(6.5)).toBe(6.5);
    });

    it('rounds 6.75 down to 6.5', () => {
        expect(roundDownToHalf(6.75)).toBe(6.5);
    });

    it('keeps 7.0 as 7.0', () => {
        expect(roundDownToHalf(7.0)).toBe(7.0);
    });

    it('handles 0', () => {
        expect(roundDownToHalf(0)).toBe(0);
    });

    it('rounds 8.1 down to 8.0', () => {
        expect(roundDownToHalf(8.1)).toBe(8.0);
    });

    it('rounds 8.99 down to 8.5', () => {
        expect(roundDownToHalf(8.99)).toBe(8.5);
    });
});

// ═══════════════════════════════════════════════════════════════
// roundOverallBand
// ═══════════════════════════════════════════════════════════════

describe('roundOverallBand', () => {
    it('rounds 6.25 up to 6.5 (remainder >= 0.25)', () => {
        expect(roundOverallBand(6.25)).toBe(6.5);
    });

    it('rounds 6.24 down to 6.0 (remainder < 0.25)', () => {
        expect(roundOverallBand(6.24)).toBe(6.0);
    });

    it('rounds 6.75 up to 7.0 (remainder >= 0.25)', () => {
        expect(roundOverallBand(6.75)).toBe(7.0);
    });

    it('keeps 6.0 as 6.0', () => {
        expect(roundOverallBand(6.0)).toBe(6.0);
    });

    it('keeps 6.5 as 6.5', () => {
        expect(roundOverallBand(6.5)).toBe(6.5);
    });

    it('rounds 7.74 down to 7.5', () => {
        expect(roundOverallBand(7.74)).toBe(7.5);
    });
});

// ═══════════════════════════════════════════════════════════════
// calculateTaskBand
// ═══════════════════════════════════════════════════════════════

describe('calculateTaskBand', () => {
    it('calculates {TA:7, CC:6, LR:7, GRA:5} → avg 6.25 → 6.0', () => {
        expect(calculateTaskBand({ TA: 7, CC: 6, LR: 7, GRA: 5 })).toBe(6.0);
    });

    it('calculates {TR:8, CC:8, LR:8, GRA:8} → avg 8.0 → 8.0', () => {
        expect(calculateTaskBand({ TR: 8, CC: 8, LR: 8, GRA: 8 })).toBe(8.0);
    });

    it('calculates {TA:9, CC:9, LR:9, GRA:9} → 9.0', () => {
        expect(calculateTaskBand({ TA: 9, CC: 9, LR: 9, GRA: 9 })).toBe(9.0);
    });

    it('calculates {TA:0, CC:0, LR:0, GRA:0} → 0', () => {
        expect(calculateTaskBand({ TA: 0, CC: 0, LR: 0, GRA: 0 })).toBe(0);
    });

    it('handles Task 2 with TR instead of TA', () => {
        expect(calculateTaskBand({ TR: 6, CC: 7, LR: 6, GRA: 7 })).toBe(6.5);
    });

    it('falls back to 0 if neither TA nor TR provided', () => {
        expect(calculateTaskBand({ CC: 7, LR: 7, GRA: 7 })).toBe(5.0);
        // (0 + 7 + 7 + 7) / 4 = 5.25 → roundDown → 5.0
    });
});

// ═══════════════════════════════════════════════════════════════
// calculateOverallBand
// ═══════════════════════════════════════════════════════════════

describe('calculateOverallBand', () => {
    const makeTask = (
        taskNumber: 1 | 2,
        taskBand: number,
        isVoided = false,
        voidReason?: string
    ): WritingTaskGradingResult => ({
        taskNumber,
        isVoided,
        voidReason,
        criteriaScores: { CC: 0, LR: 0, GRA: 0 },
        taskBand,
    });

    it('full-test: Task1=6.0 × 1/3 + Task2=7.0 × 2/3 = 6.67 → 6.5', () => {
        const tasks = [makeTask(1, 6.0), makeTask(2, 7.0)];
        expect(calculateOverallBand(tasks, 'full-test')).toBe(6.5);
    });

    it('full-test: Task1=7.0 × 1/3 + Task2=7.0 × 2/3 = 7.0 → 7.0', () => {
        const tasks = [makeTask(1, 7.0), makeTask(2, 7.0)];
        expect(calculateOverallBand(tasks, 'full-test')).toBe(7.0);
    });

    it('full-test: Task1=5.0 × 1/3 + Task2=8.0 × 2/3 = 7.0 → 7.0', () => {
        const tasks = [makeTask(1, 5.0), makeTask(2, 8.0)];
        expect(calculateOverallBand(tasks, 'full-test')).toBe(7.0);
    });

    it('single-task format: overall = that task band', () => {
        const tasks = [makeTask(1, 6.5)];
        expect(calculateOverallBand(tasks, 'task1-only')).toBe(6.5);
    });

    it('single-task format (Task 2 only): overall = that task band', () => {
        const tasks = [makeTask(2, 7.5)];
        expect(calculateOverallBand(tasks, 'task2-only')).toBe(7.5);
    });

    it('voided task exclusion: Task1 voided, overall = Task2 band', () => {
        const tasks = [makeTask(1, 6.0, true, 'Wrong prompt'), makeTask(2, 7.0)];
        expect(calculateOverallBand(tasks, 'full-test')).toBe(7.0);
    });

    it('voided task exclusion: Task2 voided, overall = Task1 band', () => {
        const tasks = [makeTask(1, 6.0), makeTask(2, 7.0, true, 'Wrong prompt')];
        expect(calculateOverallBand(tasks, 'full-test')).toBe(6.0);
    });

    it('all tasks voided → 0', () => {
        const tasks = [
            makeTask(1, 6.0, true, 'Wrong prompt'),
            makeTask(2, 7.0, true, 'Wrong prompt'),
        ];
        expect(calculateOverallBand(tasks, 'full-test')).toBe(0);
    });

    it('partial grading (1 of 2 tasks graded in full test): uses available task', () => {
        // Simulates partial grading where only Task 2 is graded
        // Task 1 exists but is voided (not graded yet → treated as voided for calc)
        const tasks = [makeTask(1, 0, true), makeTask(2, 7.5)];
        expect(calculateOverallBand(tasks, 'full-test')).toBe(7.5);
    });

    it('empty tasks returns 0', () => {
        expect(calculateOverallBand([], 'full-test')).toBe(0);
    });
});
