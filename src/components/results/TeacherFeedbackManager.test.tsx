import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TeacherFeedbackManager } from './TeacherFeedbackManager';

const {
    mockCanTeacherEditFeedback,
    mockSaveQuestionFeedback,
    mockSaveOverallFeedback,
    mockGetAllQuestionFeedback,
    mockGetOverallFeedback,
    mockGetTestResult,
    mockCreateTrustedNotification,
} = vi.hoisted(() => ({
    mockCanTeacherEditFeedback: vi.fn(),
    mockSaveQuestionFeedback: vi.fn(),
    mockSaveOverallFeedback: vi.fn(),
    mockGetAllQuestionFeedback: vi.fn(),
    mockGetOverallFeedback: vi.fn(),
    mockGetTestResult: vi.fn(),
    mockCreateTrustedNotification: vi.fn(),
}));

vi.mock('@/services/feedbackService', () => ({
    canTeacherEditFeedback: (...args: unknown[]) => mockCanTeacherEditFeedback(...args),
    saveQuestionFeedback: (...args: unknown[]) => mockSaveQuestionFeedback(...args),
    saveOverallFeedback: (...args: unknown[]) => mockSaveOverallFeedback(...args),
    getAllQuestionFeedback: (...args: unknown[]) => mockGetAllQuestionFeedback(...args),
    getOverallFeedback: (...args: unknown[]) => mockGetOverallFeedback(...args),
}));

vi.mock('@/services/testResults.service', () => ({
    getTestResult: (...args: unknown[]) => mockGetTestResult(...args),
}));

vi.mock('@/services/notificationProducerClient', () => ({
    createTrustedNotification: (...args: unknown[]) => mockCreateTrustedNotification(...args),
}));

vi.mock('../feedback/FeedbackEditor', () => ({
    FeedbackEditor: ({ isOverall, onSave, questionId }: any) => (
        <button
            type="button"
            data-testid={isOverall ? 'save-overall-feedback' : `save-question-feedback-${questionId}`}
            onClick={() => void onSave(isOverall ? 'Overall feedback' : 'Question feedback')}
        >
            {isOverall ? 'Save overall' : 'Save question'}
        </button>
    ),
}));

const renderWithProviders = (ui: React.ReactNode) => render(
    <BrowserRouter>{ui}</BrowserRouter>,
);

const renderManager = () => renderWithProviders(
    <TeacherFeedbackManager
        resultId="result-1"
        studentId="caller-supplied-student"
        studentName="Student One"
        testName="Trusted Test"
        questions={[{ id: 'question-1', number: 1, text: 'Question one', type: 'writing' }]}
        teacherId="teacher-1"
        teacherName="Teacher One"
        notifyStudentOnSave
    />,
);

describe('TeacherFeedbackManager trusted notification producer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCanTeacherEditFeedback.mockResolvedValue(true);
        mockSaveQuestionFeedback.mockResolvedValue(undefined);
        mockSaveOverallFeedback.mockResolvedValue(undefined);
        mockGetAllQuestionFeedback.mockResolvedValue({});
        mockGetOverallFeedback.mockResolvedValue(null);
        mockGetTestResult.mockResolvedValue({
            resultId: 'result-1',
            studentId: 'canonical-student',
            testTitle: 'Trusted Test',
        });
        mockCreateTrustedNotification.mockResolvedValue({ success: true, notificationId: 'notification-1' });
    });

    afterEach(() => {
        cleanup();
    });

    it('uses the canonical result recipient and stable feedback authority', async () => {
        renderManager();

        fireEvent.click(await screen.findByTestId('save-question-feedback-question-1'));

        await waitFor(() => expect(mockCreateTrustedNotification).toHaveBeenCalledWith(expect.objectContaining({
            producerFamily: 'feedback',
            authorityRecordId: 'result-1',
            recipientId: 'canonical-student',
            operationKey: 'feedback-question:result-1:question-1',
            type: 'feedback',
            title: 'New Feedback Available',
            message: 'Teacher One has provided feedback on "Trusted Test"',
            link: '/result/result-1',
        })));
        expect(mockCreateTrustedNotification).not.toHaveBeenCalledWith(expect.objectContaining({
            recipientId: 'caller-supplied-student',
        }));
    });

    it('keeps feedback saves successful when the trusted producer fails', async () => {
        mockCreateTrustedNotification.mockRejectedValueOnce(new Error('command unavailable'));
        renderManager();

        fireEvent.click(await screen.findByTestId('save-overall-feedback'));

        await waitFor(() => expect(mockSaveOverallFeedback).toHaveBeenCalledWith(
            'result-1',
            'Overall feedback',
            'teacher-1',
            'Teacher One',
        ));
        await waitFor(() => expect(mockCreateTrustedNotification).toHaveBeenCalledTimes(1));
    });

    it('does not emit when the canonical result has no recipient authority', async () => {
        mockGetTestResult.mockResolvedValueOnce({ resultId: 'result-1', studentId: '' });
        renderManager();

        fireEvent.click(await screen.findByTestId('save-question-feedback-question-1'));

        await waitFor(() => expect(mockSaveQuestionFeedback).toHaveBeenCalled());
        expect(mockCreateTrustedNotification).not.toHaveBeenCalled();
    });
});
