import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InlineWritingGrader } from './InlineWritingGrader';

const {
    mockSubmitManualThcsGrade,
    mockToastSuccess,
    mockToastError,
} = vi.hoisted(() => ({
    mockSubmitManualThcsGrade: vi.fn(),
    mockToastSuccess: vi.fn(),
    mockToastError: vi.fn(),
}));

vi.mock('../../services/manualThcsGradeClient', () => ({
    submitManualThcsGrade: (...args: unknown[]) => mockSubmitManualThcsGrade(...args),
}));

vi.mock('../modern', () => ({
    Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    Button: ({ children, variant: _variant, ...props }: any) => <button {...props}>{children}</button>,
    toast: { success: (...args: unknown[]) => mockToastSuccess(...args), error: (...args: unknown[]) => mockToastError(...args) },
}));

const writingAnswer = {
    studentId: 'canonical-student',
    studentName: 'Student One',
    questionNumber: 2,
    originalSentence: 'Original sentence',
    modelAnswers: ['Model answer'],
    studentAnswer: 'Student answer',
    pointsMax: 2,
};

const renderGrader = () => render(
    <InlineWritingGrader
        sessionCode="SESSION-1"
        testName="THCS Test"
        studentId="caller-supplied-student"
        studentName="Student One"
        writingAnswers={[writingAnswer]}
        onClose={vi.fn()}
        onGradeComplete={vi.fn()}
    />,
);

describe('InlineWritingGrader trusted notification producer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSubmitManualThcsGrade.mockResolvedValue({ eventId: 'grade-event', notificationStatus: 'delivered' });
    });

    afterEach(() => {
        cleanup();
    });

    it('commits the grade through the Worker using the canonical answer student', async () => {
        renderGrader();

        fireEvent.click(screen.getByRole('button', { name: /submit grade/i }));

        await waitFor(() => expect(mockSubmitManualThcsGrade).toHaveBeenCalledWith({
            sessionCode: 'SESSION-1', studentId: 'canonical-student', questionNumber: 2,
            pointsEarned: 0, feedback: '',
        }));
        expect(mockToastSuccess).toHaveBeenCalledWith('Grade saved.');
    });

    it('announces a failed grade commit', async () => {
        mockSubmitManualThcsGrade.mockRejectedValueOnce(new Error('worker unavailable'));
        renderGrader();

        fireEvent.click(screen.getByRole('button', { name: /submit grade/i }));

        await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Could not save this grade. Please try again.'));
        expect(mockSubmitManualThcsGrade).toHaveBeenCalledTimes(1);
    });
});
