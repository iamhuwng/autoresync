import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, expect, it, vi } from 'vitest';
import { AcademicRecordResultRow } from './AcademicRecordResultRow';

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
        testTitle: 'Reading Test 1',
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
        ...overrides,
    } as any;
}

describe('AcademicRecordResultRow', () => {
    it('renders percentage scores for standard results', () => {
        render(<AcademicRecordResultRow result={createResult({ percentage: 78 })} onClick={vi.fn()} />);

        expect(screen.getByText('78%')).toBeInTheDocument();
        expect(screen.getByText('Reading Test 1')).toBeInTheDocument();
    });

    it('renders THCS scaled scores when thcsData is present', () => {
        render(
            <AcademicRecordResultRow
                result={createResult({
                    testTitle: 'THCS Exam',
                    thcsData: { scaledScore: 7.5, sectionResults: [], intentBreakdown: {} },
                })}
                onClick={vi.fn()}
            />,
        );

        expect(screen.getByText('7.5/10')).toBeInTheDocument();
        expect(screen.getByText('THCS Exam')).toBeInTheDocument();
    });

    it('shows pending review state and missing course context quietly', () => {
        render(
            <AcademicRecordResultRow
                result={createResult({
                    testTitle: 'Writing Mock',
                    testSkill: 'writing',
                    courseId: null,
                    courseName: null,
                    markingStatus: 'pending-review',
                })}
                onClick={vi.fn()}
            />,
        );

        expect(screen.getByText('Pending')).toBeInTheDocument();
        expect(screen.getByText(/Unassigned course/i)).toBeInTheDocument();
        expect(screen.getAllByText(/Awaiting review/i).length).toBeGreaterThan(0);
    });

    it('opens the result when clicked', () => {
        const handleClick = vi.fn();

        render(
            <AcademicRecordResultRow
                result={createResult({ resultId: 'result-click' })}
                onClick={handleClick}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /Open result for Reading Test 1/i }));

        expect(handleClick).toHaveBeenCalledWith('result-click');
    });
});
