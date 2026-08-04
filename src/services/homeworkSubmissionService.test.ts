import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeworkAssignment, HomeworkSubmission } from '../types/homework.types';
import type { HomeworkIntegrity } from '../types/integrity.types';

const firestoreHarness = vi.hoisted(() => {
    const store = new Map<string, Record<string, unknown>>();

    return {
        store,
        reset: () => {
            store.clear();
        },
    };
});

const mockGetHomeworkById = vi.hoisted(() => vi.fn());
const mockUpdateHomework = vi.hoisted(() => vi.fn());
const mockGetEffectiveHomeworkDueDate = vi.hoisted(() => vi.fn());
const mockGetStudentOverride = vi.hoisted(() => vi.fn(() => ({})));
const mockIsStudentExemptedFromHomework = vi.hoisted(() => vi.fn(() => false));
const mockDeleteTestResult = vi.hoisted(() => vi.fn());
const mockCreateTrustedNotification = vi.hoisted(() => vi.fn());

vi.mock('firebase/firestore', () => {
    const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

    const getValueAtPath = (value: Record<string, unknown>, path: string): unknown =>
        path.split('.').reduce<unknown>((current, segment) => {
            if (!current || typeof current !== 'object') {
                return undefined;
            }

            return (current as Record<string, unknown>)[segment];
        }, value);

    const applyUpdates = (
        currentValue: Record<string, unknown>,
        updates: Record<string, unknown>,
    ) => ({
        ...clone(currentValue),
        ...clone(updates),
    });

    const listDocuments = (collectionName: string) =>
        [...firestoreHarness.store.entries()]
            .filter(([path]) => path.startsWith(`${collectionName}/`))
            .map(([path, value]) => {
                const id = path.slice(collectionName.length + 1);
                return {
                    id,
                    ref: { kind: 'doc', collection: collectionName, id, path },
                    data: () => clone(value),
                };
            });

    return {
        collection: vi.fn((_db: unknown, name: string) => ({ kind: 'collection', name })),
        doc: vi.fn((...args: unknown[]) => {
            if ((args[0] as { kind?: string })?.kind === 'collection') {
                const collectionRef = args[0] as { name: string };
                const id = args[1] as string;
                return { kind: 'doc', collection: collectionRef.name, id, path: `${collectionRef.name}/${id}` };
            }

            const collectionName = args[1] as string;
            const id = args[2] as string;
            return { kind: 'doc', collection: collectionName, id, path: `${collectionName}/${id}` };
        }),
        setDoc: vi.fn(async (ref: { path: string }, value: Record<string, unknown>) => {
            firestoreHarness.store.set(ref.path, clone(value));
        }),
        getDoc: vi.fn(async (ref: { path: string }) => {
            const value = firestoreHarness.store.get(ref.path);
            return {
                exists: () => value !== undefined,
                data: () => clone(value),
            };
        }),
        getDocs: vi.fn(async (target: { kind: string; collection: string; conditions?: Array<{ fieldPath: string; op: string; value: unknown }> }) => {
            const docs = listDocuments(target.collection).filter((docSnap) => (
                target.kind !== 'query'
                    ? true
                    : (target.conditions ?? []).every((condition) => {
                        const actualValue = getValueAtPath(docSnap.data(), condition.fieldPath);
                        if (condition.op === '==') {
                            return actualValue === condition.value;
                        }
                        return false;
                    })
            ));

            return {
                empty: docs.length === 0,
                docs,
            };
        }),
        updateDoc: vi.fn(async (ref: { path: string }, updates: Record<string, unknown>) => {
            const currentValue = firestoreHarness.store.get(ref.path) ?? {};
            firestoreHarness.store.set(ref.path, applyUpdates(currentValue, updates));
        }),
        deleteDoc: vi.fn(async (ref: { path: string }) => {
            firestoreHarness.store.delete(ref.path);
        }),
        query: vi.fn((collectionRef: { name: string }, ...constraints: Array<{ kind?: string; fieldPath?: string; op?: string; value?: unknown }>) => ({
            kind: 'query',
            collection: collectionRef.name,
            conditions: constraints.filter((constraint) => constraint.kind === 'where'),
        })),
        where: vi.fn((fieldPath: string, op: string, value: unknown) => ({
            kind: 'where',
            fieldPath,
            op,
            value,
        })),
        orderBy: vi.fn((fieldPath: string, direction: string) => ({
            kind: 'orderBy',
            fieldPath,
            direction,
        })),
    };
});

vi.mock('./firebase', () => ({
    firestore: { name: 'mock-firestore' },
}));

vi.mock('./homeworkManager', () => ({
    getHomeworkById: (...args: unknown[]) => mockGetHomeworkById(...args),
    updateHomework: (...args: unknown[]) => mockUpdateHomework(...args),
    getEffectiveHomeworkDueDate: (...args: unknown[]) => mockGetEffectiveHomeworkDueDate(...args),
    getStudentOverride: (...args: unknown[]) => mockGetStudentOverride(...args),
    isStudentExemptedFromHomework: (...args: unknown[]) => mockIsStudentExemptedFromHomework(...args),
}));

vi.mock('./testResults.service', () => ({
    deleteTestResult: (...args: unknown[]) => mockDeleteTestResult(...args),
}));

vi.mock('./notificationProducerClient', () => ({
    createTrustedNotification: (...args: unknown[]) => mockCreateTrustedNotification(...args),
}));

import {
    createSubmission,
    getBookHomeworkProgress,
    getTeacherBookHomeworkProgress,
    HomeworkSubmissionError,
    resetStudentHomework,
    submitImportedHomeworkSubmission,
    submitHomework,
} from './homeworkSubmissionService';

const mockHomeworkId = 'homework-1';
const mockStudentId = 'student-1';

const buildHomework = (overrides: Partial<HomeworkAssignment> = {}): HomeworkAssignment => ({
    id: overrides.id ?? mockHomeworkId,
    createdBy: overrides.createdBy ?? 'teacher-1',
    createdAt: overrides.createdAt ?? Date.now() - 10_000,
    updatedAt: overrides.updatedAt ?? Date.now() - 5_000,
    materialId: overrides.materialId ?? 'material-1',
    materialTitle: overrides.materialTitle ?? 'Homework Material',
    materialType: overrides.materialType ?? 'test',
    materialSkill: overrides.materialSkill ?? 'reading',
    target: overrides.target ?? { type: 'students', studentIds: [mockStudentId] },
    scheduling: overrides.scheduling ?? {
        availableFrom: Date.now() - 1_000,
        dueDate: Date.now() + 60_000,
    },
    config: overrides.config ?? {
        timerMinutes: 60,
        maxAttempts: 3,
        feedbackTiming: 'after_completion',
        lateSubmissionAllowed: true,
    },
    visibility: overrides.visibility ?? {
        showTimer: true,
        showAttempts: true,
        showDueDate: true,
        showQuestionCount: true,
        showDuration: true,
    },
    status: overrides.status ?? 'active',
    stats: overrides.stats ?? {
        totalAssigned: 1,
        started: 0,
        submitted: 0,
        lateSubmissions: 0,
    },
    tags: overrides.tags ?? [],
    archived: overrides.archived ?? false,
    studentOverrides: overrides.studentOverrides ?? {},
    description: overrides.description ?? '',
});

const buildSubmission = (overrides: Partial<HomeworkSubmission> = {}): HomeworkSubmission => ({
    id: overrides.id ?? 'submission-1',
    homeworkId: overrides.homeworkId ?? mockHomeworkId,
    studentId: overrides.studentId ?? mockStudentId,
    studentName: overrides.studentName ?? 'Student One',
    teacherId: overrides.teacherId,
    attemptNumber: overrides.attemptNumber ?? 1,
    startedAt: overrides.startedAt ?? Date.now() - 30_000,
    submittedAt: overrides.submittedAt,
    timeSpent: overrides.timeSpent,
    isLate: overrides.isLate ?? false,
    resultId: overrides.resultId,
    score: overrides.score,
    maxScore: overrides.maxScore,
    percentage: overrides.percentage,
    bandScore: overrides.bandScore,
    status: overrides.status ?? 'in_progress',
    thcsData: overrides.thcsData,
    latePenaltyApplied: overrides.latePenaltyApplied,
    studentAnswers: overrides.studentAnswers,
    attemptsNullified: overrides.attemptsNullified,
    integrity: overrides.integrity,
});

const seedSubmission = (submission: HomeworkSubmission) => {
    firestoreHarness.store.set(
        `homework_submissions/${submission.id}`,
        JSON.parse(JSON.stringify(submission)) as Record<string, unknown>,
    );
};

describe('homeworkSubmissionService', () => {
    beforeEach(() => {
        firestoreHarness.reset();
        vi.clearAllMocks();
        const homework = buildHomework();
        mockGetHomeworkById.mockResolvedValue(homework);
        mockGetEffectiveHomeworkDueDate.mockImplementation(
            async (currentHomework: HomeworkAssignment) => currentHomework.scheduling.dueDate,
        );
        mockGetStudentOverride.mockReturnValue({});
        mockIsStudentExemptedFromHomework.mockReturnValue(false);
        mockDeleteTestResult.mockResolvedValue(undefined);
        mockCreateTrustedNotification.mockResolvedValue({ success: true, notificationId: 'notification-1' });
        mockUpdateHomework.mockResolvedValue(undefined);
    });

    it('blocks new homework attempts after an anti-cheat nullification', async () => {
        seedSubmission(buildSubmission({
            id: 'submitted-nullified',
            status: 'submitted',
            attemptsNullified: true,
            submittedAt: Date.now() - 5_000,
        }));

        await expect(
            createSubmission(mockHomeworkId, mockStudentId, 'Student One'),
        ).rejects.toMatchObject<Partial<HomeworkSubmissionError>>({
            code: 'MAX_ATTEMPTS_REACHED',
        });

        expect(mockUpdateHomework).not.toHaveBeenCalled();
    });

    it('persists integrity data and nullifies attempts on homework auto-submit', async () => {
        seedSubmission(buildSubmission({ id: 'auto-submit-target' }));

        const integrity: HomeworkIntegrity = {
            violationCount: 3,
            totalEvents: 4,
            tabSwitchCount: 2,
            totalTimeAwayMs: 18000,
            copyAttempts: 1,
            pasteAttempts: 0,
            rightClickAttempts: 0,
            fullscreenExitCount: 1,
            keyboardShortcutAttempts: 0,
            forceSubmitted: true,
            forceSubmittedBy: 'system',
            riskLevel: 'high',
            eventCount: 4,
            eventSummary: '2 tab switches, 1 copy attempt, 1 fullscreen exit',
        };

        await submitHomework(
            'auto-submit-target',
            'result-1',
            7,
            10,
            70,
            undefined,
            1200,
            integrity,
            true,
        );

        const storedSubmission = firestoreHarness.store.get('homework_submissions/auto-submit-target');

        expect(storedSubmission).toMatchObject({
            resultId: 'result-1',
            score: 7,
            maxScore: 10,
            percentage: 70,
            timeSpent: 1200,
            status: 'submitted',
            attemptsNullified: true,
            integrity,
        });
        expect(mockUpdateHomework).toHaveBeenCalledWith(mockHomeworkId, {
            stats: {
                totalAssigned: 1,
                started: 0,
                submitted: 1,
                lateSubmissions: 0,
                completionRate: 100,
            },
        });
    });

    it('creates a submitted homework row for an external Writing import', async () => {
        mockGetEffectiveHomeworkDueDate.mockReturnValue(Date.now() + 60_000);

        const submission = await submitImportedHomeworkSubmission({
            submissionId: 'imported-submission',
            homeworkId: mockHomeworkId,
            studentId: mockStudentId,
            studentName: 'Student One',
            resultId: 'imported-submission',
            submittedAt: Date.now() - 5_000,
            timeSpent: 95.4,
            importedByTeacherId: 'teacher-1',
            importedAt: 12345,
            sourceNote: 'Paper script',
        });

        expect(submission).toMatchObject({
            id: 'imported-submission',
            homeworkId: mockHomeworkId,
            studentId: mockStudentId,
            studentName: 'Student One',
            teacherId: 'teacher-1',
            attemptNumber: 1,
            resultId: 'imported-submission',
            status: 'submitted',
            timeSpent: 95,
            isLate: false,
            administrativeImport: {
                source: 'external-admin-import',
                importedByTeacherId: 'teacher-1',
                importedAt: 12345,
                sourceNote: 'Paper script',
            },
        });
        expect(firestoreHarness.store.get('homework_submissions/imported-submission')).toMatchObject({
            id: 'imported-submission',
            status: 'submitted',
            resultId: 'imported-submission',
        });
        expect(mockUpdateHomework).toHaveBeenCalledTimes(2);
    });

    it('reuses an in-progress homework attempt for an external import', async () => {
        mockGetEffectiveHomeworkDueDate.mockReturnValue(Date.now() + 60_000);
        seedSubmission(buildSubmission({
            id: 'existing-attempt',
            status: 'in_progress',
            attemptNumber: 2,
            startedAt: Date.now() - 20_000,
        }));

        const submission = await submitImportedHomeworkSubmission({
            submissionId: 'new-generated-id',
            homeworkId: mockHomeworkId,
            studentId: mockStudentId,
            studentName: 'Student One',
            resultId: 'existing-attempt',
            submittedAt: Date.now() - 5_000,
            timeSpent: 15,
            importedByTeacherId: 'teacher-1',
            confirmInProgressOverwrite: true,
        });

        expect(submission).toMatchObject({
            id: 'existing-attempt',
            attemptNumber: 2,
            status: 'submitted',
            resultId: 'existing-attempt',
        });
        expect(firestoreHarness.store.get('homework_submissions/existing-attempt')).toMatchObject({
            id: 'existing-attempt',
            status: 'submitted',
            resultId: 'existing-attempt',
        });
        expect(firestoreHarness.store.get('homework_submissions/new-generated-id')).toBeUndefined();
        expect(mockUpdateHomework).toHaveBeenCalledTimes(1);
    });

    it('requires confirmation before replacing an in-progress attempt with an external import', async () => {
        seedSubmission(buildSubmission({
            id: 'existing-attempt',
            status: 'in_progress',
            attemptNumber: 2,
        }));

        await expect(submitImportedHomeworkSubmission({
            submissionId: 'new-generated-id',
            homeworkId: mockHomeworkId,
            studentId: mockStudentId,
            resultId: 'new-generated-id',
            submittedAt: Date.now() - 5_000,
            importedByTeacherId: 'teacher-1',
        })).rejects.toMatchObject({
            code: 'IN_PROGRESS_REQUIRES_CONFIRMATION',
        });

        expect(firestoreHarness.store.get('homework_submissions/existing-attempt')).toMatchObject({
            status: 'in_progress',
        });
        expect(firestoreHarness.store.get('homework_submissions/new-generated-id')).toBeUndefined();
    });

    it('resets homework attempts, linked results, and stats for a student', async () => {
        mockGetHomeworkById.mockResolvedValue(buildHomework({
            stats: {
                totalAssigned: 4,
                started: 3,
                submitted: 2,
                lateSubmissions: 1,
                completionRate: 50,
            },
        }));

        seedSubmission(buildSubmission({
            id: 'reset-old-submission',
            status: 'submitted',
            submittedAt: Date.now() - 10_000,
            resultId: 'result-1',
            isLate: true,
        }));
        seedSubmission(buildSubmission({
            id: 'reset-new-submission',
            teacherId: 'teacher-1',
            status: 'graded',
            submittedAt: Date.now() - 2_000,
            resultId: 'result-2',
            score: 9,
            maxScore: 10,
            percentage: 90,
        }));

        const summary = await resetStudentHomework(mockHomeworkId, mockStudentId, 'Protected Homework');

        expect(summary).toEqual({
            submissionsDeleted: 2,
            resultsDeleted: 2,
        });
        expect(firestoreHarness.store.size).toBe(0);
        expect(mockDeleteTestResult).toHaveBeenCalledTimes(2);
        expect(mockDeleteTestResult).toHaveBeenCalledWith('result-1');
        expect(mockDeleteTestResult).toHaveBeenCalledWith('result-2');
        expect(mockUpdateHomework).toHaveBeenCalledWith(mockHomeworkId, {
            stats: {
                totalAssigned: 4,
                started: 1,
                submitted: 0,
                lateSubmissions: 0,
                completionRate: 0,
            },
        });
        expect(mockCreateTrustedNotification).toHaveBeenCalledWith({
            producerFamily: 'homework',
            authorityRecordId: mockHomeworkId,
            recipientId: mockStudentId,
            operationKey: `homework-reset:${mockHomeworkId}`,
            type: 'warning',
            title: '\uD83D\uDD04 Homework Reset',
            message: 'Your homework "Protected Homework" has been reset by your teacher. You can now retake it.',
            link: `/student/homework/${mockHomeworkId}`,
        });
    });

    it('skips the reset notification when the homework authority is unavailable', async () => {
        seedSubmission(buildSubmission({
            id: 'missing-authority-submission',
            status: 'submitted',
            submittedAt: Date.now() - 5_000,
            resultId: 'result-missing-authority',
        }));
        mockGetHomeworkById.mockResolvedValue(undefined);

        await resetStudentHomework(mockHomeworkId, mockStudentId, 'Protected Homework');

        expect(mockCreateTrustedNotification).not.toHaveBeenCalled();
    });

    it('reads trusted Book progress without mapping completion into legacy score fields', async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
            assignmentId: mockHomeworkId,
            completion: {
                schemaVersion: 1,
                manifestVersionId: 'manifest-1',
                recipientId: mockStudentId,
                contextId: mockHomeworkId,
                deliveryBindingId: 'delivery-1',
                bindingRevision: 1,
                completion: {
                    submittedCount: 1,
                    requiredCount: 2,
                    status: 'in_progress',
                    isComplete: false,
                },
                grading: {
                    scoredCount: 0,
                    pendingReviewCount: 1,
                    ungradedSubmittedCount: 0,
                },
                activities: [{
                    bindingId: 'activity-binding-1',
                    placementId: 'placement-1',
                    activityId: 'activity-1',
                    activityVersion: 1,
                    activityVersionId: 'activity-version-1',
                    order: 1,
                    contextMode: 'optional',
                    submitted: true,
                    gradingState: 'review_required',
                    terminalId: 'completion-1',
                }, {
                    bindingId: 'activity-binding-2',
                    placementId: 'placement-2',
                    activityId: 'activity-2',
                    activityVersion: 1,
                    activityVersionId: 'activity-version-2',
                    order: 2,
                    contextMode: 'none',
                    submitted: false,
                    gradingState: 'ungraded',
                }],
                excludedHistoricalRows: [],
            },
        }), { status: 200 })) as typeof fetch;

        const projection = await getBookHomeworkProgress(mockHomeworkId, {
            workerOrigin: 'https://worker.example.test',
            studentId: mockStudentId,
            fetchImpl,
            getIdToken: async () => 'token-1',
        });

        expect(projection?.completion).toEqual({
            submittedCount: 1,
            requiredCount: 2,
            status: 'in_progress',
            isComplete: false,
        });
        expect(projection?.grading.pendingReviewCount).toBe(1);
        expect(JSON.stringify(projection)).not.toMatch(/"percentage"|"bandScore"|"maxScore"/u);
        expect(fetchImpl).toHaveBeenCalledWith(
            new URL(`https://worker.example.test/book-homework/assignments/${mockHomeworkId}/students/${mockStudentId}/projection`),
            expect.objectContaining({
                method: 'GET',
                headers: { Authorization: 'Bearer token-1' },
            }),
        );
    });

    it('fails closed when a Book projection tries to use a legacy aggregate percentage', async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
            completion: {
                schemaVersion: 1,
                manifestVersionId: 'manifest-1',
                recipientId: mockStudentId,
                contextId: mockHomeworkId,
                deliveryBindingId: 'delivery-1',
                bindingRevision: 1,
                completion: {
                    submittedCount: 1,
                    requiredCount: 1,
                    status: 'completed',
                    isComplete: true,
                },
                grading: {
                    scoredCount: 0,
                    pendingReviewCount: 1,
                    ungradedSubmittedCount: 0,
                },
                activities: [],
                excludedHistoricalRows: [],
                percentage: 100,
            },
        }), { status: 200 })) as typeof fetch;

        await expect(getBookHomeworkProgress(mockHomeworkId, {
            workerOrigin: 'https://worker.example.test',
            fetchImpl,
            getIdToken: async () => 'token-1',
        })).rejects.toMatchObject({
            status: 502,
            code: 'BOOK_HOMEWORK_PROGRESS_UNAVAILABLE',
        });
    });

    it('fails closed when a valid Book projection belongs to another exact context', async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
            completion: {
                schemaVersion: 1,
                manifestVersionId: 'manifest-1',
                recipientId: mockStudentId,
                contextId: 'other-homework',
                deliveryBindingId: 'delivery-1',
                bindingRevision: 1,
                completion: {
                    submittedCount: 1,
                    requiredCount: 1,
                    status: 'completed',
                    isComplete: true,
                },
                grading: {
                    scoredCount: 0,
                    pendingReviewCount: 0,
                    ungradedSubmittedCount: 1,
                },
                activities: [],
                excludedHistoricalRows: [],
            },
        }), { status: 200 })) as typeof fetch;

        await expect(getBookHomeworkProgress(mockHomeworkId, {
            workerOrigin: 'https://worker.example.test',
            studentId: mockStudentId,
            fetchImpl,
            getIdToken: async () => 'token-1',
        })).rejects.toMatchObject({
            status: 502,
            code: 'BOOK_HOMEWORK_PROGRESS_UNAVAILABLE',
        });
    });

    it('reads teacher Book progress for all students through one bounded request', async () => {
        const completion = (studentId: string) => ({
            schemaVersion: 1,
            manifestVersionId: 'manifest-1',
            recipientId: studentId,
            contextId: mockHomeworkId,
            deliveryBindingId: `delivery-${studentId}`,
            bindingRevision: 1,
            completion: {
                submittedCount: 1,
                requiredCount: 1,
                status: 'completed',
                isComplete: true,
            },
            grading: {
                scoredCount: 0,
                pendingReviewCount: 1,
                ungradedSubmittedCount: 0,
            },
            activities: [{
                bindingId: 'activity-binding-1',
                placementId: 'placement-1',
                activityId: 'activity-1',
                activityVersion: 1,
                activityVersionId: 'activity-version-1',
                order: 1,
                contextMode: 'none',
                submitted: true,
                gradingState: 'review_required',
                terminalId: `completion-${studentId}`,
            }],
            excludedHistoricalRows: [],
        });
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
            assignmentId: mockHomeworkId,
            students: [
                { studentId: 'student-1', completion: completion('student-1') },
                { studentId: 'student-2', completion: completion('student-2') },
            ],
        }), { status: 200 })) as typeof fetch;

        const rows = await getTeacherBookHomeworkProgress(mockHomeworkId, {
            workerOrigin: 'https://worker.example.test',
            fetchImpl,
            getIdToken: async () => 'teacher-token',
        });

        expect(rows?.map((row) => row.studentId)).toEqual(['student-1', 'student-2']);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(fetchImpl).toHaveBeenCalledWith(
            new URL(`https://worker.example.test/book-homework/assignments/${mockHomeworkId}/teacher-projection`),
            expect.objectContaining({
                method: 'GET',
                headers: { Authorization: 'Bearer teacher-token' },
            }),
        );
    });
});
