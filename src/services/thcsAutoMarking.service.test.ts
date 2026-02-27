/**
 * Unit tests for THCS-THPT Auto-Marking Service
 * PRD-0027 Task 2.5
 */
import { describe, it, expect } from 'vitest';
import { markThcsTest, thcsResultToTestMarkingResult } from './thcsAutoMarking.service';
import type { THCSSection, THCSGradingResult } from '../types/thcs-test.types';

/**
 * Helper: creates a minimal THCSSection for testing
 */
function makeSection(overrides: Partial<THCSSection> & { id: string; name: string; questions: THCSSection['questions'] }): THCSSection {
    return {
        order: 0,
        totalPoints: 4,
        pointMode: 'auto',
        instructionText: 'Test instruction',
        isCustomInstruction: false,
        layout: 'single-column',
        ...overrides,
    };
}

function makeQuestion(questionNumber: number, correctAnswer: 'A' | 'B' | 'C' | 'D', intent: string = 'mcq-grammar') {
    return {
        id: `q-${questionNumber}`,
        questionNumber,
        type: 'mcq-grammar' as const,
        intent: intent as any,
        questionText: `Question ${questionNumber}`,
        options: ['Option A', 'Option B', 'Option C', 'Option D'] as [string, string, string, string],
        correctAnswer,
    };
}

describe('markThcsTest', () => {
    it('Test 1: All correct answers → 100%, scaledScore = 10.0', () => {
        const sections: THCSSection[] = [
            makeSection({
                id: 's1',
                name: 'PART A',
                totalPoints: 4,
                questions: [
                    makeQuestion(1, 'A'),
                    makeQuestion(2, 'B'),
                    makeQuestion(3, 'C'),
                    makeQuestion(4, 'D'),
                ],
            }),
        ];

        const answers: Record<string, string> = { '1': 'A', '2': 'B', '3': 'C', '4': 'D' };
        const result = markThcsTest('test-1', 'student-1', sections, answers);

        expect(result.scaledScore).toBe(10.0);
        expect(result.totalPoints).toBe(4);
        expect(result.maxPoints).toBe(4);
        expect(result.gradingStatus).toBe('fully-graded');
        expect(result.sectionResults[0].correctCount).toBe(4);
        expect(result.sectionResults[0].percentage).toBe(100);
    });

    it('Test 2: All wrong answers → 0%, scaledScore = 0.0', () => {
        const sections: THCSSection[] = [
            makeSection({
                id: 's1',
                name: 'PART A',
                totalPoints: 4,
                questions: [
                    makeQuestion(1, 'A'),
                    makeQuestion(2, 'B'),
                ],
            }),
        ];

        const answers: Record<string, string> = { '1': 'D', '2': 'D' };
        const result = markThcsTest('test-2', 'student-1', sections, answers);

        expect(result.scaledScore).toBe(0);
        expect(result.totalPoints).toBe(0);
        expect(result.sectionResults[0].correctCount).toBe(0);
    });

    it('Test 3: Mixed answers with 2 sections → correct section breakdowns', () => {
        const sections: THCSSection[] = [
            makeSection({
                id: 's1',
                name: 'PART A',
                totalPoints: 2,
                questions: [
                    makeQuestion(1, 'A', 'pronunciation'),
                    makeQuestion(2, 'B', 'pronunciation'),
                ],
            }),
            makeSection({
                id: 's2',
                name: 'PART B',
                totalPoints: 2,
                questions: [
                    makeQuestion(3, 'C', 'mcq-grammar'),
                    makeQuestion(4, 'D', 'mcq-grammar'),
                ],
            }),
        ];

        // Get Q1 right, Q2 wrong, Q3 right, Q4 wrong
        const answers: Record<string, string> = { '1': 'A', '2': 'D', '3': 'C', '4': 'A' };
        const result = markThcsTest('test-3', 'student-1', sections, answers);

        expect(result.sectionResults).toHaveLength(2);
        expect(result.sectionResults[0].correctCount).toBe(1);
        expect(result.sectionResults[0].totalCount).toBe(2);
        expect(result.sectionResults[0].pointsEarned).toBe(1);
        expect(result.sectionResults[0].pointsMax).toBe(2);
        expect(result.sectionResults[1].correctCount).toBe(1);
        expect(result.sectionResults[1].totalCount).toBe(2);
        expect(result.totalPoints).toBe(2);
        expect(result.maxPoints).toBe(4);
        expect(result.scaledScore).toBe(5.0);
    });

    it('Test 5: Empty test (0 questions) → handle gracefully, no division by zero', () => {
        const sections: THCSSection[] = [
            makeSection({
                id: 's1',
                name: 'EMPTY',
                totalPoints: 0,
                questions: [],
            }),
        ];

        const result = markThcsTest('test-empty', 'student-1', sections, {});

        expect(result.scaledScore).toBe(0);
        expect(result.totalPoints).toBe(0);
        expect(result.maxPoints).toBe(0);
        expect(result.sectionResults[0].percentage).toBe(0);
    });

    it('Test 6: Extra student answer keys not matching any question → ignored, no crash', () => {
        const sections: THCSSection[] = [
            makeSection({
                id: 's1',
                name: 'PART A',
                totalPoints: 2,
                questions: [
                    makeQuestion(1, 'A'),
                ],
            }),
        ];

        // Answer key '99' does not match any question
        const answers: Record<string, string> = { '1': 'A', '99': 'B', '100': 'C' };
        const result = markThcsTest('test-extra', 'student-1', sections, answers);

        expect(result.totalPoints).toBe(2);
        expect(Object.keys(result.questionResults)).toHaveLength(1);
    });

    it('Test 7: questionResults is Record<number, QuestionResult>, keyed by questionNumber', () => {
        const sections: THCSSection[] = [
            makeSection({
                id: 's1',
                name: 'PART A',
                totalPoints: 1,
                questions: [
                    makeQuestion(5, 'B'),
                ],
            }),
        ];

        const result = markThcsTest('test-keys', 'student-1', sections, { '5': 'B' });

        // Should be keyed by questionNumber (5), not by UUID
        expect(result.questionResults[5]).toBeDefined();
        expect(result.questionResults[5].questionNumber).toBe(5);
        expect(result.questionResults[5].isCorrect).toBe(true);
    });

    it('Test 8: sectionResults intentBreakdown aggregates correct/total by intent', () => {
        const sections: THCSSection[] = [
            makeSection({
                id: 's1',
                name: 'PART A',
                totalPoints: 3,
                questions: [
                    makeQuestion(1, 'A', 'pronunciation'),
                    makeQuestion(2, 'B', 'pronunciation'),
                    makeQuestion(3, 'C', 'word-stress'),
                ],
            }),
        ];

        const answers: Record<string, string> = { '1': 'A', '2': 'D', '3': 'C' };
        const result = markThcsTest('test-intent', 'student-1', sections, answers);

        const breakdown = result.sectionResults[0].intentBreakdown;
        expect(breakdown['pronunciation']).toEqual({ correct: 1, total: 2 });
        expect(breakdown['word-stress']).toEqual({ correct: 1, total: 1 });
    });

    it('Test 9: studentAnswers keys are questionNumber strings, NOT UUIDs', () => {
        const sections: THCSSection[] = [
            makeSection({
                id: 's1',
                name: 'PART A',
                totalPoints: 1,
                questions: [
                    makeQuestion(1, 'A'),
                ],
            }),
        ];

        // Key "1" matching questionNumber=1, should work
        const result = markThcsTest('test-keys', 'student-1', sections, { '1': 'A' });
        expect(result.questionResults[1].isCorrect).toBe(true);

        // UUID key should NOT match (graded as unanswered)
        const result2 = markThcsTest('test-keys', 'student-1', sections, { 'q-1': 'A' });
        expect(result2.questionResults[1].isCorrect).toBe(false);
        expect(result2.questionResults[1].studentAnswer).toBe('');
    });
});

describe('thcsResultToTestMarkingResult', () => {
    it('Test 4: adapter → verify all TestMarkingResult fields populated and thcsData correct', () => {
        const sections: THCSSection[] = [
            makeSection({
                id: 's1',
                name: 'PART A',
                totalPoints: 4,
                questions: [
                    makeQuestion(1, 'A', 'pronunciation'),
                    makeQuestion(2, 'B', 'mcq-grammar'),
                    makeQuestion(3, 'C', 'mcq-grammar'),
                    makeQuestion(4, 'D', 'pronunciation'),
                ],
            }),
        ];

        const gradingResult = markThcsTest('test-adapter', 'student-1', sections, {
            '1': 'A', '2': 'D', '3': 'C', '4': 'D',
        });

        const { markingResult, thcsData } = thcsResultToTestMarkingResult(
            gradingResult,
            { title: 'Test', duration: 45 }
        );

        // TestMarkingResult fields
        expect(markingResult.totalScore).toBe(gradingResult.totalPoints);
        expect(markingResult.maxScore).toBe(gradingResult.maxPoints);
        expect(markingResult.percentage).toBeGreaterThanOrEqual(0);
        expect(markingResult.percentage).toBeLessThanOrEqual(100);
        expect(markingResult.questionResults).toHaveLength(4);
        expect(markingResult.summary.correct).toBe(3); // Q1=A✓ Q2=D✗ Q3=C✓ Q4=D✓
        expect(markingResult.summary.incorrect).toBe(1);
        expect(markingResult.summary.partialCredit).toBe(0);
        expect(markingResult.summary.totalQuestions).toBe(4);
        expect(markingResult.completedAt).toBe(gradingResult.gradedAt);

        // thcsData
        expect(thcsData.scaledScore).toBe(gradingResult.scaledScore);
        expect(thcsData.sectionResults).toEqual(gradingResult.sectionResults);
        expect(thcsData.intentBreakdown).toBeDefined();
        expect(thcsData.intentBreakdown['pronunciation']).toBeDefined();
        expect(thcsData.intentBreakdown['mcq-grammar']).toBeDefined();
        // pronunciation: Q1 correct, Q4 correct = 2/2
        expect(thcsData.intentBreakdown['pronunciation']).toEqual({ correct: 2, total: 2 });
        // mcq-grammar: Q2 wrong, Q3 correct = 1/2
        expect(thcsData.intentBreakdown['mcq-grammar']).toEqual({ correct: 1, total: 2 });
    });
});
