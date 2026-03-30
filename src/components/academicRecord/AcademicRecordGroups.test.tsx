import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, it, vi } from 'vitest';
import { ResultsByCourse } from './ResultsByCourse';
import { ResultsBySkill } from './ResultsBySkill';

function createResult(overrides: Record<string, unknown> = {}) {
    return {
        resultId: 'result-1',
        sessionCode: 'session-1',
        testId: 'test-1',
        studentId: 'student-1',
        studentName: 'Student',
        isGuest: false,
        teacherId: 'teacher-1',
        totalScore: 15,
        maxScore: 20,
        percentage: 75,
        bandScore: 6.5,
        testTitle: 'Course Test 1',
        testType: 'reading',
        testSkill: 'reading',
        testDuration: 1800,
        questionResults: [],
        correct: 15,
        incorrect: 5,
        partialCredit: 0,
        totalQuestions: 20,
        submittedAt: 1700000000000,
        timeElapsed: 1200,
        createdAt: 1700000000000,
        markingStatus: 'auto-marked',
        courseId: 'course-1',
        courseName: 'Course Alpha',
        ...overrides,
    } as any;
}

describe('Academic Record grouped views', () => {
    it('renders and toggles course groups while keeping result rows clickable', async () => {
        const handleClick = vi.fn();
        render(
            <ResultsByCourse
                results={[
                    createResult(),
                    createResult({
                        resultId: 'result-2',
                        testId: 'test-2',
                        testTitle: 'Course Test 2',
                        submittedAt: 1700001000000,
                    }),
                ]}
                onResultClick={handleClick}
            />,
        );

        await waitFor(() => {
            expect(screen.getByText('Course Test 1')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: /Open result for Course Test 1/i }));
        expect(handleClick).toHaveBeenCalledWith('result-1');

        fireEvent.click(screen.getByRole('button', { name: /Course Alpha/i }));
        expect(screen.queryByText('Course Test 1')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Course Alpha/i }));
        expect(screen.getByText('Course Test 1')).toBeInTheDocument();
    });

    it('renders and toggles skill groups with the shared row primitive', async () => {
        render(
            <ResultsBySkill
                results={[
                    createResult({ testSkill: 'reading', testTitle: 'Reading Task' }),
                    createResult({
                        resultId: 'result-2',
                        testId: 'test-2',
                        testSkill: 'writing',
                        testTitle: 'Writing Task',
                        submittedAt: 1700001000000,
                    }),
                ]}
            />,
        );

        await waitFor(() => {
            expect(screen.getByText('Reading Task')).toBeInTheDocument();
            expect(screen.getByText('Writing Task')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: /Reading/i }));
        expect(screen.queryByText('Reading Task')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Reading/i }));
        expect(screen.getByText('Reading Task')).toBeInTheDocument();
    });
});
