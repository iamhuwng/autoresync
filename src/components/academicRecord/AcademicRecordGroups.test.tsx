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
    it('keeps course groups collapsed by default and toggles them while keeping rows clickable', async () => {
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

        expect(screen.getByText('Courses')).toBeInTheDocument();
        expect(screen.getByText('Strongest Course')).toBeInTheDocument();
        expect(screen.queryByText('Course Test 1')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Course Alpha/i }));

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

    it('keeps skill groups collapsed by default and renders writing rows inside IELTS skill groups', async () => {
        render(
            <ResultsBySkill
                results={[
                    createResult({ testSkill: 'reading', testTitle: 'Reading Task', bandScore: 7 }),
                    createResult({
                        resultId: 'result-2',
                        testId: 'test-2',
                        testSkill: 'writing',
                        testTitle: 'Writing Task',
                        submittedAt: 1700001000000,
                        markingStatus: 'pending-review',
                        writingData: {
                            submissionId: 'writing-1',
                            overallBand: null,
                            markingStatus: 'pending-review',
                            tasks: [{ taskNumber: 1, wordCount: 260, activeTimeSeconds: 900 }],
                        },
                        context: { type: 'solo_practice' },
                    }),
                ]}
            />,
        );

        const pendingReviewCard = screen.getByText('Pending Review');
        const readingBandCard = screen.getByText('Reading Band');
        expect(
            pendingReviewCard.compareDocumentPosition(readingBandCard) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();

        expect(screen.queryByText('Reading Task')).not.toBeInTheDocument();
        expect(screen.queryByText('Writing Task')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Reading/i }));

        await waitFor(() => {
            expect(screen.getByText('Reading Task')).toBeInTheDocument();
            expect(screen.getAllByText('7.0').length).toBeGreaterThan(0);
        });

        fireEvent.click(screen.getByRole('button', { name: /Reading/i }));
        expect(screen.queryByText('Reading Task')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Writing/i }));

        await waitFor(() => {
            expect(screen.getByText('Writing Task')).toBeInTheDocument();
            expect(screen.getByText('Pending')).toBeInTheDocument();
            expect(screen.getByText('Awaiting Review')).toBeInTheDocument();
        });
    });
});
