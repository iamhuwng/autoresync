import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TeacherFeedbackManager } from './TeacherFeedbackManager';

const { mockCanTeacherEditFeedback, mockSaveQuestionFeedback, mockSaveOverallFeedback,
    mockGetAllQuestionFeedback, mockGetOverallFeedback, mockCreateTrustedNotification } = vi.hoisted(() => ({
    mockCanTeacherEditFeedback: vi.fn(),
    mockSaveQuestionFeedback: vi.fn(),
    mockSaveOverallFeedback: vi.fn(),
    mockGetAllQuestionFeedback: vi.fn(),
    mockGetOverallFeedback: vi.fn(),
    mockCreateTrustedNotification: vi.fn(),
}));

vi.mock('@/services/feedbackService', () => ({
    canTeacherEditFeedback: (...args: unknown[]) => mockCanTeacherEditFeedback(...args),
    saveQuestionFeedback: (...args: unknown[]) => mockSaveQuestionFeedback(...args),
    saveOverallFeedback: (...args: unknown[]) => mockSaveOverallFeedback(...args),
    getAllQuestionFeedback: (...args: unknown[]) => mockGetAllQuestionFeedback(...args),
    getOverallFeedback: (...args: unknown[]) => mockGetOverallFeedback(...args),
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

const renderManager = () => render(
    <BrowserRouter>
        <TeacherFeedbackManager
            resultId="result-1"
            studentId="caller-supplied-student"
            studentName="Student One"
            questions={[{ id: 'question-1', number: 1, text: 'Question one', type: 'writing' }]}
            teacherId="teacher-1"
            teacherName="Teacher One"
        />
    </BrowserRouter>,
);

describe('TeacherFeedbackManager feedback saving', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCanTeacherEditFeedback.mockResolvedValue(true);
        mockSaveQuestionFeedback.mockResolvedValue(undefined);
        mockSaveOverallFeedback.mockResolvedValue(undefined);
        mockGetAllQuestionFeedback.mockResolvedValue({});
        mockGetOverallFeedback.mockResolvedValue(null);
    });

    afterEach(() => cleanup());

    it('delegates both saves without creating a second notification path', async () => {
        renderManager();
        fireEvent.click(await screen.findByTestId('save-question-feedback-question-1'));
        fireEvent.click(await screen.findByTestId('save-overall-feedback'));

        await waitFor(() => expect(mockSaveQuestionFeedback).toHaveBeenCalledWith(
            'result-1', 'question-1', 'Question feedback', 'teacher-1', 'Teacher One',
        ));
        expect(mockSaveOverallFeedback).toHaveBeenCalledWith(
            'result-1', 'Overall feedback', 'teacher-1', 'Teacher One',
        );
        expect(mockCreateTrustedNotification).not.toHaveBeenCalled();
    });
});
