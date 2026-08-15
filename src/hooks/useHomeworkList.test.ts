import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeworkAssignment } from '../types/homework.types';
import { useHomeworkList } from './useHomeworkList';

const { getHomeworkByTeacherMock } = vi.hoisted(() => ({
    getHomeworkByTeacherMock: vi.fn(),
}));

vi.mock('../services/homeworkManager', () => ({
    getHomeworkByTeacher: (...args: unknown[]) => getHomeworkByTeacherMock(...args),
    getHomeworkByClass: vi.fn(),
    getHomeworkForStudent: vi.fn(),
    permanentlyDeleteHomework: vi.fn(),
}));

const legacyHomework = {
    id: 'legacy-homework',
    createdBy: 'teacher-1',
    createdAt: 1,
    updatedAt: 2,
    materialId: 'material-1',
    materialTitle: 'Legacy homework',
    materialType: 'quiz',
    materialSkill: 'reading',
    title: 'Legacy homework',
    target: { type: 'students', studentIds: ['student-1'] },
    scheduling: { dueDate: 20 },
    config: {
        timerMinutes: 30,
        maxAttempts: 1,
        feedbackTiming: 'after_completion',
        lateSubmissionAllowed: false,
    },
    visibility: {
        showTimer: true,
        showAttempts: true,
        showDueDate: true,
        showDuration: true,
        showQuestionCount: true,
    },
    status: 'active',
    stats: {
        totalAssigned: 1,
        started: 0,
        submitted: 0,
        lateSubmissions: 0,
        completionRate: 0,
        averageScore: 0,
    },
} as unknown as HomeworkAssignment;

const bookHomework = {
    schemaVersion: 1,
    assignmentKind: 'book_homework_compatibility',
    id: 'book-homework',
    createdBy: 'teacher-1',
    createdAt: 1,
    updatedAt: 2,
    materialId: 'book-material-1',
    materialTitle: 'Book homework',
    materialType: 'book',
    materialSkill: 'mixed',
    title: 'Book homework',
    target: { type: 'students', studentIds: ['student-1'] },
    scheduling: { dueDate: 30 },
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
        showDuration: false,
        showQuestionCount: false,
    },
    archived: false,
    tags: [],
    bookHomeworkCompatibility: {
        schemaVersion: 1,
        assignmentId: 'book-homework',
        sourceSagaRevision: 1,
        sourceFingerprint: 'book-fingerprint',
    },
} as unknown as HomeworkAssignment;

describe('useHomeworkList Book compatibility filtering', () => {
    beforeEach(() => {
        getHomeworkByTeacherMock.mockReset();
        getHomeworkByTeacherMock.mockResolvedValue([legacyHomework, bookHomework]);
    });

    it('keeps Book shells in unfiltered discovery without status-count synthesis', async () => {
        const { result } = renderHook(() => useHomeworkList({
            teacherId: 'teacher-1',
            excludeClosed: false,
        }));

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.filteredHomework.map((homework) => homework.id)).toEqual([
            'legacy-homework',
            'book-homework',
        ]);
        expect(result.current.statusCounts).toEqual({
            draft: 0,
            scheduled: 0,
            active: 1,
            past_due: 0,
            closed: 0,
        });
    });

    it('excludes Book shells from a legacy status-filtered view without reading shell status', async () => {
        const { result } = renderHook(() => useHomeworkList({
            teacherId: 'teacher-1',
            statusFilter: ['active'],
            excludeClosed: false,
        }));

        await waitFor(() => expect(result.current.loading).toBe(false));

        expect(result.current.filteredHomework.map((homework) => homework.id)).toEqual(['legacy-homework']);
        expect(result.current.statusCounts.active).toBe(1);
    });
});
