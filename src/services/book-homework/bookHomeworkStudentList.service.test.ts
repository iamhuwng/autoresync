import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeworkAssignment } from '../../types/homework.types';

const {
    buildStudentHomeworkListRecordsMock,
    getHomeworkForStudentMock,
    getStudentSubmissionsMock,
} = vi.hoisted(() => ({
    buildStudentHomeworkListRecordsMock: vi.fn(),
    getHomeworkForStudentMock: vi.fn(),
    getStudentSubmissionsMock: vi.fn(),
}));

vi.mock('../homeworkManager', () => ({
    getHomeworkForStudent: (...args: unknown[]) => getHomeworkForStudentMock(...args),
}));

vi.mock('../homeworkSubmissionService', () => ({
    buildStudentHomeworkListRecords: (...args: unknown[]) => buildStudentHomeworkListRecordsMock(...args),
    getStudentSubmissions: (...args: unknown[]) => getStudentSubmissionsMock(...args),
}));

import { getBookCompatibleStudentHomeworkList } from './bookHomeworkStudentList.service';

const bookHomework = {
    updatedAt: 1786709204227,
    bookHomeworkCompatibility: {
        sourceFingerprint: 'fnv1a64:cc3d88a5107df2b5',
        assignmentId: 'assignment-vocab-u1-ac994b46-0f53-47f5-a697-659c54b54fb4',
        sourceSagaRevision: 7,
        schemaVersion: 1,
    },
    materialId: 'book-vocab-u1-d43935c735245dc8',
    config: {
        lateSubmissionAllowed: false,
        maxAttempts: null,
        feedbackTiming: 'never',
        timerMinutes: null,
    },
    createdBy: 'glMHCrzMnyS6AqFcb9I0nlOqQ6X2',
    id: 'assignment-vocab-u1-ac994b46-0f53-47f5-a697-659c54b54fb4',
    materialType: 'book',
    materialTitle: 'Vocabulary U1',
    tags: [],
    target: { type: 'students', studentIds: ['x3hDfjYVN7cJtSbwq0ChIjl1Bk62'] },
    schemaVersion: 1,
    archived: false,
    scheduling: { dueDate: 1787270400000 },
    title: 'Vocabulary U1',
    visibility: {
        showQuestionCount: false,
        showTimer: false,
        showDuration: false,
        showAttempts: false,
        showDueDate: true,
    },
    materialSkill: 'mixed',
    assignmentKind: 'book_homework_compatibility',
    createdAt: 1786709204227,
} as unknown as HomeworkAssignment;

const legacyHomework = {
    id: 'legacy-homework-1',
    config: { maxAttempts: 2 },
    scheduling: { dueDate: 1787270400000 },
} as HomeworkAssignment;

describe('getBookCompatibleStudentHomeworkList', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getStudentSubmissionsMock.mockResolvedValue([]);
    });

    it('keeps the exact production Book shell out of legacy submissions and projections', async () => {
        const studentClasses = [{ id: 'class-1' }];
        getHomeworkForStudentMock.mockResolvedValue([bookHomework]);

        const result = await getBookCompatibleStudentHomeworkList('student-1', { studentClasses });

        expect(getHomeworkForStudentMock).toHaveBeenCalledWith('student-1', { studentClasses });
        expect(getStudentSubmissionsMock).not.toHaveBeenCalled();
        expect(buildStudentHomeworkListRecordsMock).not.toHaveBeenCalled();
        expect(result).toEqual([expect.objectContaining({
            homework: bookHomework,
            submission: null,
            canSubmit: false,
        })]);
    });

    it('passes only ordinary Homework through the unchanged legacy projector', async () => {
        const legacyRecord = { homework: legacyHomework, submission: null };
        getHomeworkForStudentMock.mockResolvedValue([bookHomework, legacyHomework]);
        getStudentSubmissionsMock.mockResolvedValue([{ id: 'submission-1' }]);
        buildStudentHomeworkListRecordsMock.mockReturnValue([legacyRecord]);

        const result = await getBookCompatibleStudentHomeworkList('student-1');

        expect(getStudentSubmissionsMock).toHaveBeenCalledOnce();
        expect(buildStudentHomeworkListRecordsMock).toHaveBeenCalledWith(
            [legacyHomework],
            [{ id: 'submission-1' }],
            'student-1',
        );
        expect(result).toEqual([
            expect.objectContaining({ homework: bookHomework, canSubmit: false }),
            legacyRecord,
        ]);
    });
});
