import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeworkAssignment } from '../../types/homework.types';

const {
    buildStudentHomeworkListRecordsMock,
    getHomeworkForStudentMock,
    getStudentSubmissionsMock,
    rtdbGetMock,
    rtdbRefMock,
} = vi.hoisted(() => ({
    buildStudentHomeworkListRecordsMock: vi.fn(),
    getHomeworkForStudentMock: vi.fn(),
    getStudentSubmissionsMock: vi.fn(),
    rtdbGetMock: vi.fn(),
    rtdbRefMock: vi.fn((_db: unknown, path: string) => ({ path })),
}));

vi.mock('firebase/database', () => ({
    get: (...args: unknown[]) => rtdbGetMock(...args),
    ref: (...args: unknown[]) => rtdbRefMock(...args),
}));

vi.mock('../firebase', () => ({
    database: { name: 'mock-rtdb' },
}));

vi.mock('../homeworkManager', () => ({
    getHomeworkForStudent: (...args: unknown[]) => getHomeworkForStudentMock(...args),
}));

vi.mock('../homeworkSubmissionService', () => ({
    buildStudentHomeworkListRecords: (...args: unknown[]) => buildStudentHomeworkListRecordsMock(...args),
    getStudentSubmissions: (...args: unknown[]) => getStudentSubmissionsMock(...args),
}));

import {
    buildBookHomeworkListRecord,
    getBookCompatibleStudentHomeworkList,
} from './bookHomeworkStudentList.service';
import { getStudentBookHomeworkSummaries } from './studentBookHomeworkSummary.service';
import {
    normalizeStudentBookHomeworkSummaryMap,
    normalizeStudentBookHomeworkSummaryRecord,
    type StudentBookHomeworkSummaryRecord,
} from './studentBookHomeworkSummary.types';

const makeBookHomework = (id: string, dueDate: number): HomeworkAssignment => ({
    updatedAt: 1786709204227,
    bookHomeworkCompatibility: {
        sourceFingerprint: `fnv1a64:${id}`,
        assignmentId: id,
        sourceSagaRevision: 7,
        schemaVersion: 1,
    },
    materialId: `book-${id}`,
    config: {
        lateSubmissionAllowed: false,
        maxAttempts: null,
        feedbackTiming: 'never',
        timerMinutes: null,
    },
    createdBy: 'glMHCrzMnyS6AqFcb9I0nlOqQ6X2',
    id,
    materialType: 'book',
    materialTitle: `Vocabulary ${id}`,
    tags: [],
    target: { type: 'students', studentIds: ['student-1'] },
    schemaVersion: 1,
    archived: false,
    scheduling: { dueDate },
    title: `Vocabulary ${id}`,
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
} as unknown as HomeworkAssignment);

const bookHomework = makeBookHomework(
    'assignment-vocab-u1-ac994b46-0f53-47f5-a697-659c54b54fb4',
    1787270400000,
);

const legacyHomework = {
    id: 'legacy-homework-1',
    config: { maxAttempts: 2 },
    scheduling: { dueDate: 1787270400000 },
} as HomeworkAssignment;

const makeSummary = (
    homeworkId: string,
    overrides: Partial<StudentBookHomeworkSummaryRecord> = {},
): StudentBookHomeworkSummaryRecord => ({
    schemaVersion: 1,
    studentId: 'student-1',
    homeworkId,
    bookId: `book-${homeworkId}`,
    status: 'not_started',
    isComplete: false,
    submittedCount: 0,
    requiredCount: 2,
    scoredCount: 0,
    pendingReviewCount: 0,
    latestSubmittedAt: 0,
    updatedAt: 1_700_000_000_000,
    activities: [],
    ...overrides,
});

describe('studentBookHomeworkSummary normalizer & RTDB reader', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('normalizes activities from undefined, Array, and RTDB numeric-keyed plain object, and coerces missing bookId to null', () => {
        const missingActivities = normalizeStudentBookHomeworkSummaryRecord({
            schemaVersion: 1,
            studentId: 'student-1',
            status: 'not_started',
            isComplete: false,
            submittedCount: 0,
            requiredCount: 2,
            scoredCount: 0,
            pendingReviewCount: 0,
            latestSubmittedAt: 0,
            updatedAt: 100,
        }, 'hw-fallback');

        expect(missingActivities).toEqual({
            schemaVersion: 1,
            studentId: 'student-1',
            homeworkId: 'hw-fallback',
            bookId: null,
            status: 'not_started',
            isComplete: false,
            submittedCount: 0,
            requiredCount: 2,
            scoredCount: 0,
            pendingReviewCount: 0,
            latestSubmittedAt: 0,
            updatedAt: 100,
            activities: [],
        });

        const mapFromRtdb = normalizeStudentBookHomeworkSummaryMap({
            'hw-array': {
                schemaVersion: 1,
                studentId: 'student-1',
                homeworkId: 'hw-array',
                bookId: 'book-1',
                status: 'completed',
                isComplete: true,
                submittedCount: 1,
                requiredCount: 1,
                scoredCount: 1,
                pendingReviewCount: 0,
                latestSubmittedAt: 5000,
                updatedAt: 5000,
                activities: [
                    undefined,
                    {
                        activityId: 'act-1',
                        order: 1,
                        submitted: true,
                        submittedAt: 5000,
                        gradingState: 'scored',
                        score: { earnedScore: 8, maximumScore: 10, displayScore: '8/10' },
                    },
                ],
            },
            'hw-object': {
                schemaVersion: 1,
                studentId: 'student-1',
                homeworkId: 'hw-object',
                status: 'in_progress',
                isComplete: false,
                submittedCount: 1,
                requiredCount: 2,
                scoredCount: 0,
                pendingReviewCount: 1,
                latestSubmittedAt: 6000,
                updatedAt: 6100,
                activities: {
                    '2': {
                        activityId: 'act-2',
                        order: 2,
                        submitted: false,
                        submittedAt: 0,
                        gradingState: 'ungraded',
                    },
                    '0': {
                        activityId: 'act-1',
                        order: 1,
                        submitted: true,
                        submittedAt: 6000,
                        gradingState: 'review_required',
                    },
                },
            },
        });

        expect(mapFromRtdb.get('hw-array')?.activities).toHaveLength(1);
        expect(mapFromRtdb.get('hw-object')).toMatchObject({
            bookId: null,
            activities: [
                { activityId: 'act-1', order: 1, submitted: true, submittedAt: 6000, gradingState: 'review_required' },
                { activityId: 'act-2', order: 2, submitted: false, submittedAt: 0, gradingState: 'ungraded' },
            ],
        });
    });

    it('reads student_book_homework_summaries/{studentId} in a single RTDB get and returns empty Map on missing/invalid/error', async () => {
        expect(await getStudentBookHomeworkSummaries('')).toEqual(new Map());
        expect(await getStudentBookHomeworkSummaries('bad/path')).toEqual(new Map());
        expect(rtdbGetMock).not.toHaveBeenCalled();

        rtdbGetMock.mockResolvedValueOnce({ exists: () => false, val: () => null });
        expect(await getStudentBookHomeworkSummaries('student-1')).toEqual(new Map());
        expect(rtdbRefMock).toHaveBeenCalledTimes(1);
        expect(rtdbRefMock).toHaveBeenCalledWith({ name: 'mock-rtdb' }, 'student_book_homework_summaries/student-1');

        rtdbGetMock.mockRejectedValueOnce(new Error('permission_denied'));
        expect(await getStudentBookHomeworkSummaries('student-1')).toEqual(new Map());
    });
});

describe('getBookCompatibleStudentHomeworkList', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getStudentSubmissionsMock.mockResolvedValue([]);
        rtdbGetMock.mockResolvedValue({ exists: () => false, val: () => null });
    });

    it('keeps the exact production Book shell out of legacy submissions and projections', async () => {
        const studentClasses = [{ id: 'class-1' }];
        getHomeworkForStudentMock.mockResolvedValue([bookHomework]);

        const result = await getBookCompatibleStudentHomeworkList('student-1', { studentClasses });

        expect(getHomeworkForStudentMock).toHaveBeenCalledWith('student-1', { studentClasses });
        expect(getStudentSubmissionsMock).not.toHaveBeenCalled();
        expect(buildStudentHomeworkListRecordsMock).not.toHaveBeenCalled();
        expect(rtdbGetMock).toHaveBeenCalledOnce();
        expect(result).toEqual([expect.objectContaining({
            homework: bookHomework,
            submission: null,
            canSubmit: false,
            bookProgressSummary: null,
        })]);
    });

    it('performs 0 Book summary reads when there are 0 Book homeworks', async () => {
        const fetchBookSummaries = vi.fn();
        const legacyRecord = { homework: legacyHomework, submission: null };
        getHomeworkForStudentMock.mockResolvedValue([legacyHomework]);
        getStudentSubmissionsMock.mockResolvedValue([{ id: 'submission-1' }]);
        buildStudentHomeworkListRecordsMock.mockReturnValue([legacyRecord]);

        const result = await getBookCompatibleStudentHomeworkList('student-1', {
            fetchBookSummaries,
        });

        expect(fetchBookSummaries).not.toHaveBeenCalled();
        expect(rtdbGetMock).not.toHaveBeenCalled();
        expect(getStudentSubmissionsMock).toHaveBeenCalledOnce();
        expect(result).toEqual([legacyRecord]);
    });

    it('fetches Book summaries ONCE in parallel with getStudentSubmissions across N Book homeworks', async () => {
        const book1 = makeBookHomework('book-hw-1', Date.now() + 60_000);
        const book2 = makeBookHomework('book-hw-2', Date.now() + 120_000);
        const book3 = makeBookHomework('book-hw-3', Date.now() + 180_000);
        const legacyRecord = { homework: legacyHomework, submission: null };

        let submissionsStarted = false;
        let summariesStarted = false;
        let resolveSubmissions!: (value: unknown[]) => void;
        let resolveSummaries!: (value: ReadonlyMap<string, StudentBookHomeworkSummaryRecord>) => void;

        getHomeworkForStudentMock.mockResolvedValue([book1, legacyHomework, book2, book3]);
        getStudentSubmissionsMock.mockImplementation(() => {
            submissionsStarted = true;
            return new Promise((resolve) => {
                resolveSubmissions = resolve;
            });
        });
        const fetchBookSummaries = vi.fn(() => {
            summariesStarted = true;
            return new Promise<ReadonlyMap<string, StudentBookHomeworkSummaryRecord>>((resolve) => {
                resolveSummaries = resolve;
            });
        });
        buildStudentHomeworkListRecordsMock.mockReturnValue([legacyRecord]);

        const pending = getBookCompatibleStudentHomeworkList('student-1', {
            fetchBookSummaries,
        });

        await vi.waitFor(() => {
            expect(submissionsStarted).toBe(true);
            expect(summariesStarted).toBe(true);
        });

        expect(getStudentSubmissionsMock).toHaveBeenCalledOnce();
        expect(fetchBookSummaries).toHaveBeenCalledOnce();
        expect(fetchBookSummaries).toHaveBeenCalledWith('student-1');

        const summary2 = makeSummary('book-hw-2', {
            status: 'completed',
            isComplete: true,
            submittedCount: 2,
            requiredCount: 2,
            scoredCount: 2,
        });
        resolveSubmissions([{ id: 'submission-1' }]);
        resolveSummaries(new Map([['book-hw-2', summary2]]));

        const result = await pending;
        expect(buildStudentHomeworkListRecordsMock).toHaveBeenCalledWith(
            [legacyHomework],
            [{ id: 'submission-1' }],
            'student-1',
        );
        expect(result).toHaveLength(4);
        expect(result[0]).toMatchObject({ homework: book1, bookProgressSummary: null, attemptsUsed: 0 });
        expect(result[1]).toBe(legacyRecord);
        expect(result[2]).toMatchObject({
            homework: book2,
            bookProgressSummary: summary2,
            attemptsUsed: 2,
            canViewFeedback: true,
        });
        expect(result[3]).toMatchObject({ homework: book3, bookProgressSummary: null, attemptsUsed: 0 });
    });

    it('accurately derives overdue, attemptsUsed, and canViewFeedback for completed, in-progress, and unstarted Book homeworks', async () => {
        const now = 1_750_000_000_000;
        const pastDueCompleted = makeBookHomework('book-completed-past', now - 60_000);
        const pastDueInProgress = makeBookHomework('book-inprogress-past', now - 60_000);
        const upcomingInProgress = makeBookHomework('book-inprogress-upcoming', now + 60_000);
        const pastDueUnstarted = makeBookHomework('book-unstarted-past', now - 60_000);
        const upcomingUnstarted = makeBookHomework('book-unstarted-upcoming', now + 60_000);

        const completedRecord = buildBookHomeworkListRecord(
            pastDueCompleted,
            now,
            makeSummary('book-completed-past', {
                status: 'completed',
                isComplete: true,
                submittedCount: 3,
                requiredCount: 3,
                scoredCount: 3,
            }),
        );
        expect(completedRecord).toMatchObject({
            homework: pastDueCompleted,
            isOverdue: false,
            attemptsUsed: 3,
            canViewFeedback: true,
            canSubmit: false,
        });

        const overdueInProgressRecord = buildBookHomeworkListRecord(
            pastDueInProgress,
            now,
            makeSummary('book-inprogress-past', {
                status: 'in_progress',
                isComplete: false,
                submittedCount: 1,
                requiredCount: 3,
            }),
        );
        expect(overdueInProgressRecord).toMatchObject({
            homework: pastDueInProgress,
            isOverdue: true,
            attemptsUsed: 1,
            canViewFeedback: true,
            canSubmit: false,
        });

        const activeInProgressRecord = buildBookHomeworkListRecord(
            upcomingInProgress,
            now,
            makeSummary('book-inprogress-upcoming', {
                status: 'in_progress',
                isComplete: false,
                submittedCount: 2,
                requiredCount: 3,
            }),
        );
        expect(activeInProgressRecord).toMatchObject({
            homework: upcomingInProgress,
            isOverdue: false,
            attemptsUsed: 2,
            canViewFeedback: true,
        });

        const overdueUnstartedRecord = buildBookHomeworkListRecord(pastDueUnstarted, now, null);
        expect(overdueUnstartedRecord).toMatchObject({
            homework: pastDueUnstarted,
            isOverdue: true,
            attemptsUsed: 0,
            canViewFeedback: false,
            bookProgressSummary: null,
        });

        const upcomingUnstartedRecord = buildBookHomeworkListRecord(upcomingUnstarted, now, null);
        expect(upcomingUnstartedRecord).toMatchObject({
            homework: upcomingUnstarted,
            isOverdue: false,
            attemptsUsed: 0,
            canViewFeedback: false,
            bookProgressSummary: null,
        });
    });
});
