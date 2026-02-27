/**
 * Unit tests for THCS Writing Grading Service (Phase 2 — Task 6.5)
 * Tests the two-tier grading pipeline: Tier 1 (string similarity) → Tier 2 (AI LLM)
 *
 * We test the EXPORTED utility functions and internal logic via the public API.
 * AI service is mocked to avoid real API calls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════
// We need to mock Firebase and AI service BEFORE importing the service
// ═══════════════════════════════════════════════════════════════

// Mock Firebase
vi.mock('firebase/database', () => ({
    ref: vi.fn(() => ({})),
    update: vi.fn(() => Promise.resolve()),
}));
vi.mock('./firebase', () => ({
    database: {},
}));

// Mock AI service — we control when AI "works" vs "fails"
const mockGradeWritingAnswer = vi.fn();
vi.mock('./ai/router.service', () => ({
    aiService: {
        gradeWritingAnswer: (...args: any[]) => mockGradeWritingAnswer(...args),
    },
}));

// Mock normalizeAnswer from auto-marking (it's a real dependency, but we re-export it)
vi.mock('./thcsAutoMarking.service', () => ({
    normalizeAnswer: (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' '),
}));

// ═══════════════════════════════════════════════════════════════
// Now import the module under test
// ═══════════════════════════════════════════════════════════════

// We need to test internal functions, so we import the module and
// use the __esModule trick to access non-exported functions.
// For the exported `gradeWritingQuestions`, we test end-to-end.
//
// Since `gradeOneWritingAnswer` and similarity functions are NOT exported,
// we test them indirectly through `gradeWritingQuestions`.
// However, `gradeWritingQuestions` needs full RTDB context. So we also
// create a parallel test by dynamically importing the file.

import { gradeWritingQuestions } from './thcsWritingGrading.service';
import type { THCSSection, THCSGradingResult, WritingGradingTier } from '../types/thcs-test.types';

// ═══════════════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════════════

function makeWritingSection(questions: Array<{
    questionNumber: number;
    type: 'sentence-rewrite' | 'sentence-rewrite-keyword';
    originalSentence: string;
    modelAnswers: string[];
    autoGradeWriting: boolean;
    sentenceStarter?: string;
    keyword?: string;
}>): THCSSection {
    return {
        id: 'section-writing',
        name: 'PART E: WRITING',
        order: 0,
        totalPoints: questions.length,
        pointMode: 'auto',
        instructionText: 'Rewrite each sentence.',
        isCustomInstruction: false,
        layout: 'single-column',
        questions: questions.map(q => ({
            id: `q-${q.questionNumber}`,
            questionNumber: q.questionNumber,
            type: q.type,
            questionText: q.originalSentence,
            options: ['', '', '', ''] as [string, string, string, string],
            correctAnswer: 'A' as const,
            originalSentence: q.originalSentence,
            modelAnswers: q.modelAnswers,
            autoGradeWriting: q.autoGradeWriting,
            sentenceStarter: q.sentenceStarter,
            keyword: q.keyword,
        })),
    };
}

function makeGradingResult(
    studentAnswers: Record<number, string>,
    pointsMax: number = 1,
): THCSGradingResult {
    const questionResults: Record<number, any> = {};
    for (const [qNumStr, answer] of Object.entries(studentAnswers)) {
        const qNum = parseInt(qNumStr);
        questionResults[qNum] = {
            questionNumber: qNum,
            isCorrect: false,
            studentAnswer: answer,
            correctAnswer: undefined,
            pointsEarned: 0,
            pointsMax,
            writingResult: {
                studentAnswer: answer,
                modelAnswers: [],
                gradingTier: 'pending' as WritingGradingTier,
            },
        };
    }
    return {
        testId: 'test-writing-1',
        studentId: 'student-1',
        totalPoints: 0,
        maxPoints: Object.keys(studentAnswers).length * pointsMax,
        scaledScore: 0,
        sectionResults: [],
        questionResults,
        gradedAt: Date.now(),
        gradingStatus: 'auto-graded',
    };
}

// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

describe('gradeWritingQuestions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should skip questions where autoGradeWriting is disabled', async () => {
        const sections = [makeWritingSection([{
            questionNumber: 1,
            type: 'sentence-rewrite',
            originalSentence: 'She is beautiful.',
            modelAnswers: ['She is pretty.'],
            autoGradeWriting: false, // disabled
            sentenceStarter: 'She',
        }])];

        const result = makeGradingResult({ 1: 'She is pretty.' });

        await gradeWritingQuestions(result, sections, 'session-1', 'student-1');

        // Should NOT call AI service since autoGradeWriting is false
        expect(mockGradeWritingAnswer).not.toHaveBeenCalled();
    });

    it('should skip when there are no pending writing questions', async () => {
        const sections = [makeWritingSection([{
            questionNumber: 1,
            type: 'sentence-rewrite',
            originalSentence: 'She is beautiful.',
            modelAnswers: ['She is pretty.'],
            autoGradeWriting: true,
        }])];

        // Already graded (not 'pending')
        const result = makeGradingResult({ 1: 'She is pretty.' });
        result.questionResults[1].writingResult.gradingTier = 'auto-correct';

        await gradeWritingQuestions(result, sections, 'session-1', 'student-1');

        // Should not attempt re-grading
        expect(mockGradeWritingAnswer).not.toHaveBeenCalled();
    });

    it('should auto-grade high-confidence matches via Tier 1 (≥80% similarity)', async () => {
        const { update } = await import('firebase/database');

        const sections = [makeWritingSection([{
            questionNumber: 1,
            type: 'sentence-rewrite',
            originalSentence: 'She is beautiful.',
            modelAnswers: ['She is very pretty.'],
            autoGradeWriting: true,
            // No sentenceStarter — avoids starter-stripping which changes comparison
        }])];

        // Student answer is identical to model answer → 100% similarity
        const result = makeGradingResult({ 1: 'She is very pretty.' });

        await gradeWritingQuestions(result, sections, 'session-1', 'student-1');

        // Tier 1 exact match should NOT escalate to AI
        expect(mockGradeWritingAnswer).not.toHaveBeenCalled();

        // Should update RTDB with auto-correct result
        expect(update).toHaveBeenCalled();
        const updateCall = (update as any).mock.calls[0];
        expect(updateCall[1].writingResult.gradingTier).toBe('auto-correct');
        expect(updateCall[1].pointsEarned).toBeGreaterThan(0);
        expect(updateCall[1].isCorrect).toBe(true);
    });

    it('should auto-grade low-confidence mismatches via Tier 1 (<30% similarity)', async () => {
        const { update } = await import('firebase/database');

        const sections = [makeWritingSection([{
            questionNumber: 1,
            type: 'sentence-rewrite',
            originalSentence: 'She is beautiful.',
            modelAnswers: ['She is very pretty and kind.'],
            autoGradeWriting: true,
        }])];

        // Completely different answer → very low similarity
        const result = makeGradingResult({ 1: 'xyz abc 123 totally different text nothing in common at all whatsoever' });

        await gradeWritingQuestions(result, sections, 'session-1', 'student-1');

        // Low confidence should NOT escalate to AI (auto-incorrect)
        expect(mockGradeWritingAnswer).not.toHaveBeenCalled();

        // Should update RTDB with auto-incorrect result
        expect(update).toHaveBeenCalled();
        const updateCall = (update as any).mock.calls[0];
        expect(updateCall[1].writingResult.gradingTier).toBe('auto-incorrect');
        expect(updateCall[1].pointsEarned).toBe(0);
        expect(updateCall[1].isCorrect).toBe(false);
    });

    it('should escalate to AI when Tier 1 confidence is 30-79%', async () => {
        const { update } = await import('firebase/database');

        // AI returns high score → ai-correct
        mockGradeWritingAnswer.mockResolvedValueOnce({
            success: true,
            data: { score: 85, feedback: 'Good answer!' },
        });

        const sections = [makeWritingSection([{
            questionNumber: 1,
            type: 'sentence-rewrite',
            originalSentence: 'She is beautiful.',
            modelAnswers: ['She is very pretty and quite kind.'],
            autoGradeWriting: true,
        }])];

        // Partial match — enough overlap for 30-79% tier
        const result = makeGradingResult({ 1: 'She is pretty and kind.' });

        await gradeWritingQuestions(result, sections, 'session-1', 'student-1');

        // Should have escalated to AI
        expect(mockGradeWritingAnswer).toHaveBeenCalledTimes(1);

        // Should update RTDB
        expect(update).toHaveBeenCalled();
        const updateCall = (update as any).mock.calls[0];
        expect(updateCall[1].writingResult.gradingTier).toBe('ai-correct');
        expect(updateCall[1].writingResult.aiScore).toBe(85);
        expect(updateCall[1].writingResult.aiFeedback).toBe('Good answer!');
    });

    it('should fall back to teacher-review when AI fails', async () => {
        const { update } = await import('firebase/database');

        // AI fails
        mockGradeWritingAnswer.mockResolvedValueOnce({
            success: false,
            error: 'API error',
        });

        const sections = [makeWritingSection([{
            questionNumber: 1,
            type: 'sentence-rewrite',
            originalSentence: 'She is beautiful.',
            modelAnswers: ['She is very pretty and quite kind.'],
            autoGradeWriting: true,
        }])];

        const result = makeGradingResult({ 1: 'She is pretty and kind.' });

        await gradeWritingQuestions(result, sections, 'session-1', 'student-1');

        expect(mockGradeWritingAnswer).toHaveBeenCalledTimes(1);

        // Should fall back to teacher-review
        expect(update).toHaveBeenCalled();
        const updateCall = (update as any).mock.calls[0];
        expect(updateCall[1].writingResult.gradingTier).toBe('teacher-review');
    });

    it('should handle AI returning score in teacher-review range (50-79%)', async () => {
        const { update } = await import('firebase/database');

        mockGradeWritingAnswer.mockResolvedValueOnce({
            success: true,
            data: { score: 65, feedback: 'Needs review.' },
        });

        const sections = [makeWritingSection([{
            questionNumber: 1,
            type: 'sentence-rewrite',
            originalSentence: 'She is beautiful.',
            modelAnswers: ['She is very pretty and quite kind.'],
            autoGradeWriting: true,
        }])];

        const result = makeGradingResult({ 1: 'She is pretty and kind.' });

        await gradeWritingQuestions(result, sections, 'session-1', 'student-1');

        expect(update).toHaveBeenCalled();
        const updateCall = (update as any).mock.calls[0];
        expect(updateCall[1].writingResult.gradingTier).toBe('teacher-review');
    });

    it('should handle AI returning low score (<50%) as ai-incorrect', async () => {
        const { update } = await import('firebase/database');

        mockGradeWritingAnswer.mockResolvedValueOnce({
            success: true,
            data: { score: 30, feedback: 'Incorrect rewrite.' },
        });

        const sections = [makeWritingSection([{
            questionNumber: 1,
            type: 'sentence-rewrite',
            originalSentence: 'She is beautiful.',
            modelAnswers: ['She is very pretty and quite kind.'],
            autoGradeWriting: true,
        }])];

        const result = makeGradingResult({ 1: 'She is pretty and kind.' });

        await gradeWritingQuestions(result, sections, 'session-1', 'student-1');

        expect(update).toHaveBeenCalled();
        const updateCall = (update as any).mock.calls[0];
        expect(updateCall[1].writingResult.gradingTier).toBe('ai-incorrect');
        expect(updateCall[1].pointsEarned).toBe(0);
    });

    it('should process multiple writing questions in sequence', async () => {
        const { update } = await import('firebase/database');

        const sections = [makeWritingSection([
            {
                questionNumber: 1,
                type: 'sentence-rewrite',
                originalSentence: 'She is beautiful.',
                modelAnswers: ['She is very pretty.'],
                autoGradeWriting: true,
                // No sentenceStarter — pure exact match
            },
            {
                questionNumber: 2,
                type: 'sentence-rewrite-keyword',
                originalSentence: 'He runs fast.',
                modelAnswers: ['He is a fast runner.'],
                autoGradeWriting: true,
                keyword: 'runner',
            },
        ])];

        // Q1: exact match → auto-correct, Q2: exact match → auto-correct
        const result = makeGradingResult({
            1: 'She is very pretty.',
            2: 'He is a fast runner.',
        });

        await gradeWritingQuestions(result, sections, 'session-1', 'student-1');

        // Both should be Tier 1 auto-correct, no AI calls
        expect(mockGradeWritingAnswer).not.toHaveBeenCalled();

        // Should have 2 RTDB updates
        expect(update).toHaveBeenCalledTimes(2);
    });

    it('should gracefully handle questions with missing model answers', async () => {
        const sections = [makeWritingSection([{
            questionNumber: 1,
            type: 'sentence-rewrite',
            originalSentence: 'She is beautiful.',
            modelAnswers: [], // No model answers!
            autoGradeWriting: true,
        }])];

        const result = makeGradingResult({ 1: 'She is pretty.' });

        // Should not crash
        await expect(
            gradeWritingQuestions(result, sections, 'session-1', 'student-1')
        ).resolves.not.toThrow();
    });

    it('should not crash when studentAnswer is empty string', async () => {
        const sections = [makeWritingSection([{
            questionNumber: 1,
            type: 'sentence-rewrite',
            originalSentence: 'She is beautiful.',
            modelAnswers: ['She is pretty.'],
            autoGradeWriting: true,
        }])];

        const result = makeGradingResult({ 1: '' });

        await expect(
            gradeWritingQuestions(result, sections, 'session-1', 'student-1')
        ).resolves.not.toThrow();
    });
});
