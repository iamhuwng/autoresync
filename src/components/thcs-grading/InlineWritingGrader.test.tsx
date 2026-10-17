import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InlineWritingGrader } from './InlineWritingGrader';

const {
    mockRef,
    mockUpdate,
    mockCreateTrustedNotification,
} = vi.hoisted(() => ({
    mockRef: vi.fn((_database: unknown, path?: string) => path ?? '__root__'),
    mockUpdate: vi.fn(),
    mockCreateTrustedNotification: vi.fn(),
}));

vi.mock('../../services/firebase', () => ({ database: {} }));

vi.mock('firebase/database', () => ({
    ref: (...args: unknown[]) => mockRef(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
}));

vi.mock('../../services/notificationProducerClient', () => ({
    createTrustedNotification: (...args: unknown[]) => mockCreateTrustedNotification(...args),
}));

vi.mock('../modern', () => ({
    Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    Button: ({ children, variant: _variant, ...props }: any) => <button {...props}>{children}</button>,
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
        mockUpdate.mockResolvedValue(undefined);
        mockCreateTrustedNotification.mockResolvedValue({ success: true, notificationId: 'notification-1' });
    });

    afterEach(() => {
        cleanup();
    });

    it('preserves the grading write and emits a result command for the canonical answer student', async () => {
        renderGrader();

        fireEvent.click(screen.getByRole('button', { name: /submit grade/i }));

        await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith(
            'game_sessions/SESSION-1/results/caller-supplied-student/questionResults/2',
            expect.objectContaining({
                pointsEarned: 0,
                'writingResult/gradingTier': 'teacher-graded',
            }),
        ));
        await waitFor(() => expect(mockCreateTrustedNotification).toHaveBeenCalledWith(expect.objectContaining({
            producerFamily: 'result',
            authorityRecordId: 'SESSION-1',
            recipientId: 'canonical-student',
            operationKey: 'grade-updated:SESSION-1:canonical-student:2',
            type: 'success',
            title: 'Grade Updated',
            message: 'Your answer for Q2 in "THCS Test" has been graded: 0 points.',
        })));
    });

    it('does not block grading when command delivery fails', async () => {
        mockCreateTrustedNotification.mockRejectedValueOnce(new Error('command unavailable'));
        renderGrader();

        fireEvent.click(screen.getByRole('button', { name: /submit grade/i }));

        await waitFor(() => expect(mockUpdate).toHaveBeenCalled());
        await waitFor(() => expect(mockCreateTrustedNotification).toHaveBeenCalledTimes(1));
    });
});
