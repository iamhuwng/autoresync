import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeworkAssignment, HomeworkSubmission } from '../types/homework.types';
import type { IELTSWritingTest } from '../types/ielts-writing.types';

const {
    mockGetRtdb,
    mockPush,
    mockGetClass,
    mockGetEnrollmentsByCourse,
    mockGetUserById,
    mockGetEffectiveHomeworkDueDate,
    mockGetHomeworkById,
    mockGetHomeworkByTeacher,
    mockGetHomeworkSubmissions,
    mockGetStudentSubmissionsForHomework,
    mockSubmitImportedHomeworkSubmission,
    mockCreateSubmission,
    mockGetSubmission,
    mockMaterializeSubmissionResult,
} = vi.hoisted(() => ({
    mockGetRtdb: vi.fn(),
    mockPush: vi.fn(),
    mockGetClass: vi.fn(),
    mockGetEnrollmentsByCourse: vi.fn(),
    mockGetUserById: vi.fn(),
    mockGetEffectiveHomeworkDueDate: vi.fn(),
    mockGetHomeworkById: vi.fn(),
    mockGetHomeworkByTeacher: vi.fn(),
    mockGetHomeworkSubmissions: vi.fn(),
    mockGetStudentSubmissionsForHomework: vi.fn(),
    mockSubmitImportedHomeworkSubmission: vi.fn(),
    mockCreateSubmission: vi.fn(),
    mockGetSubmission: vi.fn(),
    mockMaterializeSubmissionResult: vi.fn(),
}));

vi.mock('./firebase', () => ({
    database: {},
}));

vi.mock('firebase/database', () => ({
    ref: vi.fn((_db?: unknown, path?: string) => path ?? '__root__'),
    get: (...args: unknown[]) => mockGetRtdb(...args),
    push: (...args: unknown[]) => mockPush(...args),
}));

vi.mock('./classManager', () => ({
    getClass: (...args: unknown[]) => mockGetClass(...args),
}));

vi.mock('./enrollmentManager', () => ({
    getEnrollmentsByCourse: (...args: unknown[]) => mockGetEnrollmentsByCourse(...args),
}));

vi.mock('./userService', () => ({
    getUserById: (...args: unknown[]) => mockGetUserById(...args),
}));

vi.mock('./homeworkManager', () => ({
    getEffectiveHomeworkDueDate: (...args: unknown[]) => mockGetEffectiveHomeworkDueDate(...args),
    getHomeworkById: (...args: unknown[]) => mockGetHomeworkById(...args),
    getHomeworkByTeacher: (...args: unknown[]) => mockGetHomeworkByTeacher(...args),
}));

vi.mock('./homeworkSubmissionService', () => ({
    getHomeworkSubmissions: (...args: unknown[]) => mockGetHomeworkSubmissions(...args),
    getStudentSubmissionsForHomework: (...args: unknown[]) => mockGetStudentSubmissionsForHomework(...args),
    submitImportedHomeworkSubmission: (...args: unknown[]) => mockSubmitImportedHomeworkSubmission(...args),
}));

vi.mock('./writingSubmissionService', () => ({
    createSubmission: (...args: unknown[]) => mockCreateSubmission(...args),
    getSubmission: (...args: unknown[]) => mockGetSubmission(...args),
    materializeSubmissionResult: (...args: unknown[]) => mockMaterializeSubmissionResult(...args),
}));

vi.mock('./restoreGuard', () => ({
    withRestoreGuard:
        (_serviceName: string, _safeReturn: unknown) =>
            (fn: (...args: any[]) => Promise<any>) =>
                fn,
}));

import {
    importExternalWritingSubmission,
    listWritingImportHomeworkOptions,
} from './writingExternalSubmissionImport.service';

const NOW = 1_700_000_000_000;
const teacherId = 'teacher-1';
const homeworkId = 'homework-1';
const studentId = 'student-1';
const submittedAt = NOW - 3_600_000;

function buildHomework(overrides: Partial<HomeworkAssignment> = {}): HomeworkAssignment {
    return {
        id: homeworkId,
        createdBy: teacherId,
        createdAt: NOW - 10_000,
        updatedAt: NOW - 5_000,
        materialId: 'writing-test-1',
        materialTitle: 'Imported Writing Test',
        materialType: 'test',
        materialSkill: 'writing',
        target: {
            type: 'students',
            studentIds: [studentId],
            studentNames: ['Student One'],
        },
        scheduling: {
            availableFrom: NOW - 86_400_000,
            dueDate: NOW + 86_400_000,
        },
        config: {
            timerMinutes: 60,
            maxAttempts: 2,
            feedbackTiming: 'after_completion',
            lateSubmissionAllowed: true,
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
        ...overrides,
    };
}

function buildMaterial(format: IELTSWritingTest['metadata']['format'] = 'task2-only'): IELTSWritingTest {
    return {
        id: 'writing-test-1',
        testType: 'IELTS',
        skill: 'Writing',
        metadata: {
            title: 'Imported Writing Test',
            duration: 60,
            format,
        },
        tasks: [
            {
                taskNumber: 1,
                taskType: 'bar-chart',
                promptText: 'Describe the chart.',
                wordMinimum: 150,
                recommendedTimeMinutes: 20,
                showModelAnswerToStudent: false,
            },
            {
                taskNumber: 2,
                taskType: 'opinion',
                promptText: 'Discuss the opinion.',
                wordMinimum: 250,
                recommendedTimeMinutes: 40,
                showModelAnswerToStudent: false,
            },
        ],
        createdBy: teacherId,
        ownerId: teacherId,
        isPublic: false,
        createdAt: NOW - 20_000,
        updatedAt: NOW - 10_000,
    };
}

function buildPreviousSubmission(overrides: Partial<HomeworkSubmission> = {}): HomeworkSubmission {
    return {
        id: 'previous-submission',
        homeworkId,
        studentId,
        studentName: 'Student One',
        teacherId,
        attemptNumber: 1,
        startedAt: NOW - 7_200_000,
        isLate: false,
        status: 'submitted',
        submittedAt: NOW - 7_000_000,
        resultId: 'previous-submission',
        ...overrides,
    };
}

function mockMaterial(material = buildMaterial()) {
    mockGetRtdb.mockResolvedValue({
        exists: () => true,
        val: () => material,
    });
}

function defaultImportInput(overrides: Partial<Parameters<typeof importExternalWritingSubmission>[0]> = {}) {
    return {
        homeworkId,
        studentId,
        studentName: 'Student One',
        taskResponses: [
            {
                taskNumber: 2 as const,
                essayText: 'This imported essay has five words.',
                activeTimeSeconds: 120,
            },
        ],
        submittedAt,
        sourceNote: 'Paper copy from class',
        importerTeacherId: teacherId,
        ...overrides,
    };
}

describe('writingExternalSubmissionImport.service', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
        vi.clearAllMocks();

        mockGetHomeworkById.mockResolvedValue(buildHomework());
        mockGetHomeworkByTeacher.mockResolvedValue([buildHomework()]);
        mockGetEffectiveHomeworkDueDate.mockReturnValue(NOW + 86_400_000);
        mockGetHomeworkSubmissions.mockResolvedValue([]);
        mockGetStudentSubmissionsForHomework.mockResolvedValue([]);
        mockGetClass.mockResolvedValue(null);
        mockGetEnrollmentsByCourse.mockResolvedValue([]);
        mockGetUserById.mockResolvedValue(null);
        mockPush.mockReturnValue({ key: 'shared-submission-id' });
        mockGetSubmission.mockResolvedValue({ success: false, error: 'Submission not found' });
        mockCreateSubmission.mockResolvedValue({ success: true });
        mockSubmitImportedHomeworkSubmission.mockResolvedValue({
            id: 'shared-submission-id',
            attemptNumber: 1,
        });
        mockMaterializeSubmissionResult.mockResolvedValue({ success: true });
        mockMaterial();
    });

    it('lists only teacher-owned Writing homework options', async () => {
        mockGetHomeworkByTeacher.mockResolvedValue([
            buildHomework({ id: 'writing-homework', title: 'Writing task' }),
            buildHomework({ id: 'reading-homework', materialSkill: 'reading' }),
            buildHomework({ id: 'archived-writing', archived: true }),
        ]);

        const result = await listWritingImportHomeworkOptions(teacherId);

        expect(result.success).toBe(true);
        expect(result.data).toEqual([
            expect.objectContaining({
                homeworkId: 'writing-homework',
                title: 'Writing task',
                materialId: 'writing-test-1',
            }),
        ]);
    });

    it('imports Task 2-only homework as pending-review external work', async () => {
        const result = await importExternalWritingSubmission(defaultImportInput());

        expect(result).toEqual({
            success: true,
            data: {
                submissionId: 'shared-submission-id',
                homeworkSubmissionId: 'shared-submission-id',
                resultId: 'shared-submission-id',
                isLate: false,
                attemptNumber: 1,
            },
        });

        expect(mockCreateSubmission).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'shared-submission-id',
                studentId,
                studentName: 'Student One',
                markingStatus: 'pending-review',
                pasteAttemptCount: 0,
                submittedAt,
                context: expect.objectContaining({
                    type: 'homework',
                    homeworkId,
                    homeworkSubmissionId: 'shared-submission-id',
                    assigningTeacherId: teacherId,
                    isLate: false,
                    attemptNumber: 1,
                    externalImport: expect.objectContaining({
                        source: 'external-admin-import',
                        importedByTeacherId: teacherId,
                        importedAt: NOW,
                        sourceNote: 'Paper copy from class',
                    }),
                }),
                tasks: [
                    expect.objectContaining({
                        taskNumber: 2,
                        promptText: 'Discuss the opinion.',
                        essayText: 'This imported essay has five words.',
                        wordCount: 6,
                    }),
                ],
            })
        );
    });

    it('imports full-test responses with separate word counts and elapsed time', async () => {
        mockMaterial(buildMaterial('full-test'));

        await importExternalWritingSubmission(defaultImportInput({
            taskResponses: [
                {
                    taskNumber: 1,
                    essayText: 'one two three',
                    activeTimeSeconds: 20,
                },
                {
                    taskNumber: 2,
                    essayText: 'four five six seven',
                    activeTimeSeconds: 40,
                },
            ],
        }));

        const created = mockCreateSubmission.mock.calls[0][0];
        expect(created.totalElapsedTimeSeconds).toBe(60);
        expect(created.tasks).toEqual([
            expect.objectContaining({ taskNumber: 1, wordCount: 3 }),
            expect.objectContaining({ taskNumber: 2, wordCount: 4 }),
        ]);
        expect(mockMaterializeSubmissionResult).toHaveBeenCalledWith(created);
    });

    it('rejects homework owned by another teacher', async () => {
        mockGetHomeworkById.mockResolvedValue(buildHomework({ createdBy: 'teacher-2' }));

        const result = await importExternalWritingSubmission(defaultImportInput());

        expect(result).toEqual({
            success: false,
            code: 'ownership',
            error: 'Homework does not belong to this teacher',
        });
        expect(mockCreateSubmission).not.toHaveBeenCalled();
    });

    it('rejects non-writing homework before materialization', async () => {
        mockGetHomeworkById.mockResolvedValue(buildHomework({ materialSkill: 'reading' }));

        const result = await importExternalWritingSubmission(defaultImportInput());

        expect(result).toEqual({
            success: false,
            code: 'not-writing',
            error: 'Only Writing homework can be imported here',
        });
        expect(mockCreateSubmission).not.toHaveBeenCalled();
    });

    it('rejects students outside the homework target roster', async () => {
        const result = await importExternalWritingSubmission(defaultImportInput({
            studentId: 'student-2',
            studentName: 'Student Two',
        }));

        expect(result).toEqual({
            success: false,
            code: 'unassigned-student',
            error: 'Student is not assigned to this homework',
        });
        expect(mockCreateSubmission).not.toHaveBeenCalled();
    });

    it('blocks duplicate submitted or graded homework attempts', async () => {
        mockGetStudentSubmissionsForHomework.mockResolvedValue([
            buildPreviousSubmission({ status: 'graded' }),
        ]);

        const result = await importExternalWritingSubmission(defaultImportInput());

        expect(result).toEqual({
            success: false,
            code: 'duplicate',
            error: 'This student already has submitted or graded work for this homework',
        });
        expect(mockCreateSubmission).not.toHaveBeenCalled();
    });

    it('requires confirmation before replacing an in-progress homework attempt', async () => {
        mockGetStudentSubmissionsForHomework.mockResolvedValue([
            buildPreviousSubmission({
                id: 'existing-attempt',
                status: 'in_progress',
                attemptNumber: 2,
                resultId: undefined,
            }),
        ]);

        const blocked = await importExternalWritingSubmission(defaultImportInput());

        expect(blocked).toEqual({
            success: false,
            code: 'in-progress',
            error: 'This student has an in-progress attempt. Confirm before replacing it with imported work',
        });
        expect(mockCreateSubmission).not.toHaveBeenCalled();

        mockSubmitImportedHomeworkSubmission.mockResolvedValue({
            id: 'existing-attempt',
            attemptNumber: 2,
        });

        const confirmed = await importExternalWritingSubmission(defaultImportInput({
            confirmInProgressOverwrite: true,
        }));

        expect(confirmed.success).toBe(true);
        expect(mockCreateSubmission).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'existing-attempt',
                context: expect.objectContaining({
                    homeworkSubmissionId: 'existing-attempt',
                    attemptNumber: 2,
                }),
            })
        );
        expect(mockSubmitImportedHomeworkSubmission).toHaveBeenCalledWith(
            expect.objectContaining({
                submissionId: 'existing-attempt',
                confirmInProgressOverwrite: true,
            })
        );
    });

    it('uses one shared ID for writing submission, homework submission, and result projection', async () => {
        await importExternalWritingSubmission(defaultImportInput());

        const created = mockCreateSubmission.mock.calls[0][0];
        expect(created.id).toBe('shared-submission-id');
        expect(mockSubmitImportedHomeworkSubmission).toHaveBeenCalledWith(
            expect.objectContaining({
                submissionId: 'shared-submission-id',
                resultId: 'shared-submission-id',
            })
        );
        expect(mockMaterializeSubmissionResult).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'shared-submission-id',
            })
        );
    });

    it('creates data matching getPendingSubmissions teacher visibility contract', async () => {
        await importExternalWritingSubmission(defaultImportInput());

        const created = mockCreateSubmission.mock.calls[0][0];
        expect(created.markingStatus).toBe('pending-review');
        expect(created.context.assigningTeacherId).toBe(teacherId);
        expect(created.context.selectedTeacherId).toBeUndefined();
    });
});
