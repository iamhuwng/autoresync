/**
 * Tests for THCSRawTextFallback component (FR-12)
 * PRD-0031 Task 7.6
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import THCSRawTextFallback from './THCSRawTextFallback';
import type { THCSSection, QuestionResult } from '../../types/thcs-test.types';

/** Helper: minimal THCSSection with raw-text-fallback questions */
function makeRawSection(overrides: Partial<THCSSection> = {}): THCSSection {
    return {
        id: 'sec-raw',
        name: 'Part X',
        order: 0,
        totalPoints: 2,
        pointMode: 'auto',
        instructionText: 'Read and answer',
        isCustomInstruction: false,
        layout: 'single-column',
        isRawTextFallback: true,
        rawText: 'The cat sat on the mat.\n1. What sat on the mat?\n2. Where did the cat sit?',
        questions: [
            {
                id: 'q-1',
                questionNumber: 1,
                type: 'raw-text-fallback' as any,
                questionText: 'What sat on the mat?',
                options: ['', '', '', ''] as [string, string, string, string],
                correctAnswer: 'The cat' as any,
            },
            {
                id: 'q-2',
                questionNumber: 2,
                type: 'raw-text-fallback' as any,
                questionText: 'Where did the cat sit?',
                options: ['', '', '', ''] as [string, string, string, string],
                correctAnswer: '?' as any, // teacher grades manually
            },
        ],
        ...overrides,
    };
}

describe('THCSRawTextFallback', () => {
    it('renders raw text content inside a container', () => {
        const section = makeRawSection();
        render(
            <THCSRawTextFallback
                section={section}
                answers={{}}
                onAnswerChange={() => { }}
            />
        );

        // The raw text should be visible
        expect(screen.getByText(/The cat sat on the mat/)).toBeTruthy();
    });

    it('renders one text input per question', () => {
        const section = makeRawSection();
        render(
            <THCSRawTextFallback
                section={section}
                answers={{}}
                onAnswerChange={() => { }}
            />
        );

        // Should have 2 text inputs (one per question)
        const inputs = screen.getAllByPlaceholderText('Type your answer here...');
        expect(inputs).toHaveLength(2);
    });

    it('calls onAnswerChange when student types', () => {
        const section = makeRawSection();
        const onAnswerChange = vi.fn();

        render(
            <THCSRawTextFallback
                section={section}
                answers={{}}
                onAnswerChange={onAnswerChange}
            />
        );

        const inputs = screen.getAllByPlaceholderText('Type your answer here...');
        fireEvent.change(inputs[0]!, { target: { value: 'The cat' } });

        expect(onAnswerChange).toHaveBeenCalledWith('1', 'The cat');
    });

    it('shows correct/incorrect indicators in review mode', () => {
        const section = makeRawSection();
        const questionResults: Record<number, QuestionResult> = {
            1: {
                questionNumber: 1,
                isCorrect: true,
                studentAnswer: 'The cat',
                correctAnswer: 'The cat',
                pointsEarned: 1,
                pointsMax: 1,
            },
            2: {
                questionNumber: 2,
                isCorrect: false,
                studentAnswer: 'On the mat',
                correctAnswer: '?',
                pointsEarned: 0,
                pointsMax: 1,
            },
        };

        render(
            <THCSRawTextFallback
                section={section}
                answers={{ '1': 'The cat', '2': 'On the mat' }}
                onAnswerChange={() => { }}
                isReviewMode={true}
                questionResults={questionResults}
            />
        );

        // Inputs should be disabled in review mode
        const inputs = screen.getAllByPlaceholderText('Type your answer here...');
        expect((inputs[0] as HTMLInputElement).disabled).toBe(true);
        expect((inputs[1] as HTMLInputElement).disabled).toBe(true);
    });

    it('shows "teacher will grade" message for empty correctAnswer', () => {
        const section = makeRawSection();

        render(
            <THCSRawTextFallback
                section={section}
                answers={{}}
                onAnswerChange={() => { }}
                isReviewMode={true}
            />
        );

        // Question 2 has correctAnswer '?' → teacher grades manually
        expect(screen.getByText(/Teacher will grade this question manually/)).toBeTruthy();
    });

    it('displays warning banner', () => {
        const section = makeRawSection();

        render(
            <THCSRawTextFallback
                section={section}
                answers={{}}
                onAnswerChange={() => { }}
            />
        );

        expect(
            screen.getByText(/This section could not be auto-converted/)
        ).toBeTruthy();
    });

    it('displays question numbers as labels', () => {
        const section = makeRawSection();

        render(
            <THCSRawTextFallback
                section={section}
                answers={{}}
                onAnswerChange={() => { }}
            />
        );

        // Should show question numbers
        expect(screen.getByText('1')).toBeTruthy();
        expect(screen.getByText('2')).toBeTruthy();
    });

    it('shows correct answer hint in review mode when answer is wrong and has known answer', () => {
        const section = makeRawSection();
        const questionResults: Record<number, QuestionResult> = {
            1: {
                questionNumber: 1,
                isCorrect: false,
                studentAnswer: 'A dog',
                correctAnswer: 'The cat',
                pointsEarned: 0,
                pointsMax: 1,
            },
        };

        render(
            <THCSRawTextFallback
                section={section}
                answers={{ '1': 'A dog' }}
                onAnswerChange={() => { }}
                isReviewMode={true}
                questionResults={questionResults}
            />
        );

        // Should show correct answer hint
        expect(screen.getByText(/Correct answer:/)).toBeTruthy();
    });
});
