import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeworkAssignment } from '../types/homework.types';
import { useHomeworkSubmission, useStudentHomeworkList } from './useHomeworkSubmission';

const {
    createSubmissionMock,
    getHomeworkByIdMock,
    getStudentHomeworkListMock,
    getStudentSubmissionsForHomeworkMock,
} = vi.hoisted(() => ({
    createSubmissionMock: vi.fn(),
    getHomeworkByIdMock: vi.fn(),
    getStudentHomeworkListMock: vi.fn(),
    getStudentSubmissionsForHomeworkMock: vi.fn(),
}));

vi.mock('../services/homeworkManager', () => ({
    getHomeworkById: (...args: unknown[]) => getHomeworkByIdMock(...args),
}));

vi.mock('../services/homeworkSubmissionService', () => ({
    createSubmission: (...args: unknown[]) => createSubmissionMock(...args),
    getStudentSubmissionsForHomework: (...args: unknown[]) => getStudentSubmissionsForHomeworkMock(...args),
    HomeworkSubmissionError: class HomeworkSubmissionError extends Error {
        constructor(message: string, readonly code: string) {
            super(message);
        }
    },
}));

vi.mock('../services/book-homework/bookHomeworkStudentList.service', () => ({
    getBookCompatibleStudentHomeworkList: (...args: unknown[]) => getStudentHomeworkListMock(...args),
}));

const ordinaryHomework: HomeworkAssignment = {
    id: 'homework-1',
    createdBy: 'teacher-1',
    createdAt: 1,
    materialId: 'material-1',
    materialTitle: 'Reading Homework',
    materialType: 'test',
    materialSkill: 'reading',
    target: { type: 'students', studentIds: ['student-1'] },
    scheduling: { dueDate: Date.now() + 60_000 },
    config: {
        timerMinutes: 30,
        maxAttempts: 2,
        feedbackTiming: 'after_completion',
        lateSubmissionAllowed: false,
    },
    visibility: {
        showTimer: true,
        showAttempts: true,
        showDueDate: true,
        showQuestionCount: true,
        showDuration: true,
    },
    status: 'active',
    stats: {
        totalAssigned: 1,
        started: 0,
        submitted: 0,
        lateSubmissions: 0,
    },
    tags: [],
    archived: false,
    studentOverrides: {},
};

const bookHomework = {
    schemaVersion: 1,
    id: 'book-homework-1',
    assignmentKind: 'book_homework_compatibility',
    createdBy: 'teacher-1',
    createdAt: 1,
    updatedAt: 2,
    materialId: 'book-1',
    materialTitle: 'Vocabulary Book',
    materialType: 'book',
    materialSkill: 'mixed',
    title: 'Vocabulary Book Homework',
    target: { type: 'students', studentIds: ['student-1'] },
    scheduling: { dueDate: Date.now() + 60_000 },
    config: {
        timerMinutes: null,
        maxAttempts: null,
        feedbackTiming: 'never',
        lateSubmissionAllowed: false,
    },
    visibility: {
        showTimer: false,
        showAttempts: false,
        showDueDate: true,
        showQuestionCount: false,
        showDuration: false,
    },
    tags: [],
    archived: false,
    bookHomeworkCompatibility: {
        schemaVersion: 1,
        assignmentId: 'book-homework-1',
        sourceSagaRevision: 1,
        sourceFingerprint: 'fingerprint-1',
    },
};

const makeListItem = (homework: HomeworkAssignment = ordinaryHomework) => ({
    homework,
    submission: null,
    attemptsUsed: 0,
    attemptsRemaining: 2,
    attemptsNullified: false,
    isOverdue: false,
    canSubmit: true,
    canViewFeedback: false,
    effectiveDueDate: homework.scheduling.dueDate,
    reminderCount: 0,
    isExempted: false,
});

describe('Homework student loading hooks', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getStudentSubmissionsForHomeworkMock.mockResolvedValue([]);
    });

    it('uses one resolved Homework detail read and skips legacy submissions for Book Homework', async () => {
        getHomeworkByIdMock.mockResolvedValue(bookHomework);

        const { result } = renderHook(() => useHomeworkSubmission({
            homeworkId: 'book-homework-1',
            studentId: 'student-1',
        }));

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(getHomeworkByIdMock).toHaveBeenCalledTimes(1);
        expect(getStudentSubmissionsForHomeworkMock).not.toHaveBeenCalled();
        expect(result.current.homework).toEqual(bookHomework);
        expect(result.current.allSubmissions).toEqual([]);
        expect(result.current.canStartAttempt).toBe(false);
        await expect(result.current.startAttempt()).rejects.toThrow('Cannot start a new attempt');
        expect(createSubmissionMock).not.toHaveBeenCalled();
    });

    it('preserves ordinary Homework submission loading with the already resolved detail', async () => {
        getHomeworkByIdMock.mockResolvedValue(ordinaryHomework);

        const { result } = renderHook(() => useHomeworkSubmission({
            homeworkId: 'homework-1',
            studentId: 'student-1',
        }));

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(getHomeworkByIdMock).toHaveBeenCalledTimes(1);
        expect(getStudentSubmissionsForHomeworkMock).toHaveBeenCalledWith(
            'homework-1',
            'student-1',
        );
    });

    it('preserves the ordinary missing-Homework submission read', async () => {
        getHomeworkByIdMock.mockResolvedValue(null);

        const { result } = renderHook(() => useHomeworkSubmission({
            homeworkId: 'missing-homework',
            studentId: 'student-1',
        }));

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.error).toBe('Homework not found');
        expect(getStudentSubmissionsForHomeworkMock).toHaveBeenCalledWith(
            'missing-homework',
            'student-1',
        );
    });

    it('preserves last-good list content while refresh revalidates', async () => {
        let resolveRefresh: ((items: ReturnType<typeof makeListItem>[]) => void) | undefined;
        const studentClasses = [{ id: 'class-1' }];
        getStudentHomeworkListMock
            .mockResolvedValueOnce([makeListItem()])
            .mockImplementationOnce(() => new Promise((resolve) => {
                resolveRefresh = resolve;
            }));

        const { result } = renderHook(() => useStudentHomeworkList('student-1', {
            studentClasses,
        }));

        await waitFor(() => expect(result.current.homeworkItems).toHaveLength(1));
        expect(result.current.isLoading).toBe(false);

        let refreshPromise: Promise<void> | undefined;
        act(() => {
            refreshPromise = result.current.refreshData();
        });

        expect(result.current.isLoading).toBe(false);
        expect(result.current.homeworkItems).toHaveLength(1);

        await waitFor(() => expect(resolveRefresh).toBeTypeOf('function'));

        await act(async () => {
            resolveRefresh?.([]);
            await refreshPromise;
        });

        expect(result.current.homeworkItems).toEqual([]);
        expect(getStudentHomeworkListMock).toHaveBeenNthCalledWith(1, 'student-1', { studentClasses });
        expect(getStudentHomeworkListMock).toHaveBeenNthCalledWith(2, 'student-1', { studentClasses });
    });
});
