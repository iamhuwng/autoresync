import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get, push, set, update } from 'firebase/database';
import { getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import {
    autoSubmitFromRTDB,
    materializeSubmissionResult,
    updateGrading,
} from './writingSubmissionService';

const {
    mockResolveResultOwnership,
    mockClearUnresolvedResultVisibilityReport,
    mockUpsertUnresolvedResultVisibilityReport,
    mockMarkHomeworkSubmissionGraded,
    mockNotifyWritingSubmitted,
} = vi.hoisted(() => ({
    mockResolveResultOwnership: vi.fn(),
    mockClearUnresolvedResultVisibilityReport: vi.fn(),
    mockUpsertUnresolvedResultVisibilityReport: vi.fn(),
    mockMarkHomeworkSubmissionGraded: vi.fn(),
    mockNotifyWritingSubmitted: vi.fn(),
}));

vi.mock('./firebase', () => ({
    database: {},
    firestore: {},
}));

vi.mock('firebase/database', () => ({
    ref: vi.fn((_: unknown, path?: string) => path ?? '__root__'),
    get: vi.fn(),
    push: vi.fn(),
    set: vi.fn(),
    update: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
    getFirestore: vi.fn(() => ({})),
    doc: vi.fn((_: unknown, ...segments: string[]) => segments.join('/')),
    setDoc: vi.fn(),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    updateDoc: vi.fn(),
    collection: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
}));

vi.mock('./restoreGuard', () => ({
    withRestoreGuard:
        (_serviceName: string, _safeReturn: unknown) =>
            (fn: (...args: any[]) => Promise<any>) =>
                fn,
}));

vi.mock('./notificationService', () => ({
    notifyWritingSubmitted: mockNotifyWritingSubmitted,
}));

vi.mock('./homeworkSubmissionService', () => ({
    markHomeworkSubmissionGraded: mockMarkHomeworkSubmissionGraded,
}));

vi.mock('./resultOwnershipResolver', () => ({
    resolveResultOwnership: mockResolveResultOwnership,
}));

vi.mock('./resultVisibilityReporting.service', () => ({
    clearUnresolvedResultVisibilityReport: mockClearUnresolvedResultVisibilityReport,
    upsertUnresolvedResultVisibilityReport: mockUpsertUnresolvedResultVisibilityReport,
    buildUnresolvedResultVisibilityReportEntry: vi.fn((input: any) => ({
        resultId: input.resultId,
        studentId: input.studentId,
        contextType: input.visibility.contextType,
        unresolvedReason: input.visibility.unresolvedReason,
        sourceLookupAttempted: input.sourceLookupAttempted,
        strongestKnownSourceClue: input.strongestKnownSourceClue,
        ownershipResolved: false,
        createdAt: input.existingCreatedAt ?? 1000,
        updatedAt: input.now ?? 1000,
    })),
}));

describe('writingSubmissionService', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mockResolveResultOwnership.mockResolvedValue({
            visibility: {
                contextType: 'class_session',
                sourceType: 'session',
                sourceId: 'SESSION-1',
                sourceNameSnapshot: 'Writing Test',
                visibilityOwnerTeacherId: 'teacher-1',
                ownerResolutionSource: 'session.createdByUserId',
                ownershipResolved: true,
                unresolvedReason: null,
                homeworkId: null,
                sessionCode: 'SESSION-1',
                courseId: null,
                classId: null,
                assignmentId: null,
            },
            sourceLookupAttempted: true,
            strongestKnownSourceClue: 'session:SESSION-1',
        });
        mockClearUnresolvedResultVisibilityReport.mockResolvedValue(undefined);
        mockUpsertUnresolvedResultVisibilityReport.mockResolvedValue(undefined);
        mockMarkHomeworkSubmissionGraded.mockResolvedValue(undefined);
        mockNotifyWritingSubmitted.mockResolvedValue(undefined);
        (setDoc as any).mockResolvedValue(undefined);
        (set as any).mockResolvedValue(undefined);
        (updateDoc as any).mockResolvedValue(undefined);
        (update as any).mockResolvedValue(undefined);
    });

    function getUpdatePayload(callIndex: number) {
        return ((update as any).mock.calls[callIndex] ?? [null, {}])[1];
    }

    function getSetCall(callIndex: number) {
        return (set as any).mock.calls[callIndex] ?? [null, undefined];
    }

    it('materializes a writing result with normalized visibility ownership only', async () => {
        await materializeSubmissionResult({
            id: 'result-1',
            studentId: 'student-1',
            studentName: 'Student One',
            context: {
                type: 'live-session',
                sessionCode: 'SESSION-1',
            },
            testMeta: {
                testId: 'test-1',
                testTitle: 'Writing Test',
                format: 'full-test',
                duration: 60,
            },
            tasks: [
                {
                    taskNumber: 1,
                    taskType: 'bar-chart',
                    promptText: 'Prompt',
                    wordMinimum: 150,
                    essayText: 'Essay',
                    wordCount: 1,
                    activeTimeSeconds: 10,
                },
            ],
            submittedAt: 1000,
            totalElapsedTimeSeconds: 90,
            pasteAttemptCount: 0,
            markingStatus: 'pending-review',
            annotations: [],
            auditTrail: [],
        } as any);

        expect(mockResolveResultOwnership).toHaveBeenCalledWith(
            expect.objectContaining({
                writingSubmissionId: 'result-1',
                sessionCode: 'SESSION-1',
                homeworkId: null,
                courseId: null,
                classId: null,
            })
        );

        const canonicalWrite = getSetCall(0)[1];
        const indexUpdates = getUpdatePayload(0);
        expect(canonicalWrite).toEqual(
            expect.objectContaining({
                resultId: 'result-1',
                writingSubmission: expect.objectContaining({
                    text: expect.stringContaining('Task 1'),
                    wordCount: 1,
                }),
                visibility: expect.objectContaining({
                    visibilityOwnerTeacherId: 'teacher-1',
                    ownershipResolved: true,
                }),
            })
        );
        expect(indexUpdates['test_results_by_teacher/teacher-1/result-1']).toEqual(
            expect.objectContaining({
                resultId: 'result-1',
                studentId: 'student-1',
            })
        );
        expect(indexUpdates['test_results_by_teacher/teacher-legacy/result-1']).toBeUndefined();
        expect(mockClearUnresolvedResultVisibilityReport).toHaveBeenCalledWith('result-1');
        expect(mockUpsertUnresolvedResultVisibilityReport).not.toHaveBeenCalled();
    });

    it('materializes solo-practice writing into the dedicated student index without creating a teacher index', async () => {
        mockResolveResultOwnership.mockResolvedValueOnce({
            visibility: {
                contextType: 'solo_practice',
                sourceType: 'solo_practice',
                sourceId: 'test-solo',
                sourceNameSnapshot: 'Solo Writing Test',
                visibilityOwnerTeacherId: null,
                ownerResolutionSource: 'solo_practice',
                ownershipResolved: true,
                unresolvedReason: null,
                homeworkId: null,
                sessionCode: null,
                courseId: null,
                classId: null,
                assignmentId: null,
            },
            sourceLookupAttempted: false,
            strongestKnownSourceClue: 'solo_practice:test-solo',
        });

        await materializeSubmissionResult({
            id: 'result-solo',
            studentId: 'student-solo',
            studentName: 'Student Solo',
            context: {
                type: 'solo-practice',
            },
            testMeta: {
                testId: 'test-solo',
                testTitle: 'Solo Writing Test',
                format: 'task1-only',
                duration: 30,
            },
            tasks: [],
            submittedAt: 5000,
            totalElapsedTimeSeconds: 45,
            pasteAttemptCount: 0,
            markingStatus: 'pending-review',
            annotations: [],
            auditTrail: [],
        } as any);

        const canonicalWrite = getSetCall(0)[1];
        const indexUpdates = getUpdatePayload(0);
        expect(canonicalWrite).toEqual(
            expect.objectContaining({
                resultId: 'result-solo',
                visibility: expect.objectContaining({
                    contextType: 'solo_practice',
                    ownershipResolved: true,
                }),
            })
        );
        expect(indexUpdates['test_results_solo_practice_by_student/student-solo/result-solo']).toEqual(
            expect.objectContaining({
                resultId: 'result-solo',
                testId: 'test-solo',
                submittedAt: 5000,
            })
        );
        expect(Object.keys(indexUpdates).filter((key) => key.startsWith('test_results_by_teacher/'))).toEqual([]);
        expect(mockClearUnresolvedResultVisibilityReport).toHaveBeenCalledWith('result-solo');
    });

    it('upserts unresolved reports and skips teacher indexes when ownership cannot be proven', async () => {
        mockResolveResultOwnership.mockResolvedValueOnce({
            visibility: {
                contextType: 'homework',
                sourceType: 'homework',
                sourceId: 'hw-1',
                sourceNameSnapshot: 'Homework 1',
                visibilityOwnerTeacherId: null,
                ownerResolutionSource: 'unresolved',
                ownershipResolved: false,
                unresolvedReason: 'owner_not_resolved',
                homeworkId: 'hw-1',
                sessionCode: null,
                courseId: null,
                classId: null,
                assignmentId: null,
            },
            sourceLookupAttempted: true,
            strongestKnownSourceClue: 'homework:hw-1',
        });

        await materializeSubmissionResult({
            id: 'result-2',
            studentId: 'student-2',
            studentName: 'Student Two',
            context: {
                type: 'homework',
                homeworkId: 'hw-1',
            },
            testMeta: {
                testId: 'test-2',
                testTitle: 'Homework Writing',
                format: 'task1-only',
                duration: 40,
            },
            tasks: [],
            submittedAt: 2000,
            totalElapsedTimeSeconds: 30,
            pasteAttemptCount: 1,
            markingStatus: 'pending-review',
            annotations: [],
            auditTrail: [],
        } as any);

        const indexUpdates = getUpdatePayload(0);
        expect(indexUpdates['test_results_by_teacher/teacher-1/result-2']).toBeUndefined();
        expect(mockUpsertUnresolvedResultVisibilityReport).toHaveBeenCalledWith(
            expect.objectContaining({
                resultId: 'result-2',
                studentId: 'student-2',
                visibility: expect.objectContaining({
                    ownershipResolved: false,
                    unresolvedReason: 'owner_not_resolved',
                }),
            })
        );
        expect(mockClearUnresolvedResultVisibilityReport).not.toHaveBeenCalled();
    });

    it('skips course and class indexes when writing ownership is unresolved', async () => {
        mockResolveResultOwnership.mockResolvedValueOnce({
            visibility: {
                contextType: 'course_material',
                sourceType: 'course',
                sourceId: 'course-9',
                sourceNameSnapshot: 'Course 9',
                visibilityOwnerTeacherId: null,
                ownerResolutionSource: 'unresolved',
                ownershipResolved: false,
                unresolvedReason: 'owner_not_resolved',
                homeworkId: null,
                sessionCode: 'SESSION-9',
                courseId: 'course-9',
                classId: 'class-9',
                assignmentId: null,
            },
            sourceLookupAttempted: true,
            strongestKnownSourceClue: 'course:course-9',
        });

        await materializeSubmissionResult({
            id: 'result-9',
            studentId: 'student-9',
            studentName: 'Student Nine',
            context: {
                type: 'live-session',
                sessionCode: 'SESSION-9',
                academicContext: {
                    courseId: 'course-9',
                    classId: 'class-9',
                    moduleId: 'module-9',
                },
            },
            testMeta: {
                testId: 'test-9',
                testTitle: 'Writing Course Result',
                format: 'task1-only',
                duration: 45,
            },
            tasks: [],
            submittedAt: 9000,
            totalElapsedTimeSeconds: 30,
            pasteAttemptCount: 0,
            markingStatus: 'pending-review',
            annotations: [],
            auditTrail: [],
        } as any);

        const indexUpdates = getUpdatePayload(0);
        expect(indexUpdates['test_results_by_course/course-9/student-9/result-9']).toBeUndefined();
        expect(indexUpdates['test_results_by_class/class-9/student-9/result-9']).toBeUndefined();
    });

    it('writes scoped indexes without crashing when canonical ownership resolves course metadata but submission academicContext is missing', async () => {
        mockResolveResultOwnership.mockResolvedValueOnce({
            visibility: {
                contextType: 'course_material',
                sourceType: 'course',
                sourceId: 'course-10',
                sourceNameSnapshot: 'Course 10',
                visibilityOwnerTeacherId: 'teacher-10',
                ownerResolutionSource: 'course',
                ownershipResolved: true,
                unresolvedReason: null,
                homeworkId: null,
                sessionCode: 'SESSION-10',
                courseId: 'course-10',
                classId: 'class-10',
                assignmentId: null,
            },
            sourceLookupAttempted: true,
            strongestKnownSourceClue: 'course:course-10',
        });

        const result = await materializeSubmissionResult({
            id: 'result-10',
            studentId: 'student-10',
            studentName: 'Student Ten',
            context: {
                type: 'live-session',
                sessionCode: 'SESSION-10',
            },
            testMeta: {
                testId: 'test-10',
                testTitle: 'Writing Session 10',
                format: 'task1-only',
                duration: 45,
            },
            tasks: [],
            submittedAt: 10_000,
            totalElapsedTimeSeconds: 30,
            pasteAttemptCount: 0,
            markingStatus: 'pending-review',
            annotations: [],
            auditTrail: [],
        } as any);

        expect(result).toEqual({ success: true });

        const indexUpdates = getUpdatePayload(0);
        expect(indexUpdates['test_results_by_course/course-10/student-10/result-10']).toEqual(
            expect.objectContaining({
                resultId: 'result-10',
                studentId: 'student-10',
                moduleId: null,
            })
        );
        expect(indexUpdates['test_results_by_class/class-10/student-10/result-10']).toEqual(
            expect.objectContaining({
                resultId: 'result-10',
                studentId: 'student-10',
                courseId: 'course-10',
            })
        );
    });

    it('does not create teacher indexes from selectedTeacherId or assigningTeacherId shortcuts when ownership is unresolved', async () => {
        mockResolveResultOwnership.mockResolvedValueOnce({
            visibility: {
                contextType: 'homework',
                sourceType: 'homework',
                sourceId: 'hw-2',
                sourceNameSnapshot: 'Homework 2',
                visibilityOwnerTeacherId: null,
                ownerResolutionSource: 'unresolved',
                ownershipResolved: false,
                unresolvedReason: 'owner_not_resolved',
                homeworkId: 'hw-2',
                sessionCode: null,
                courseId: null,
                classId: null,
                assignmentId: null,
            },
            sourceLookupAttempted: true,
            strongestKnownSourceClue: 'homework:hw-2',
        });

        await materializeSubmissionResult({
            id: 'result-4',
            studentId: 'student-4',
            studentName: 'Student Four',
            context: {
                type: 'homework',
                homeworkId: 'hw-2',
                selectedTeacherId: 'teacher-selected',
                assigningTeacherId: 'teacher-assigned',
            },
            testMeta: {
                testId: 'test-4',
                testTitle: 'Homework Writing 2',
                format: 'task1-only',
                duration: 40,
            },
            tasks: [],
            submittedAt: 4000,
            totalElapsedTimeSeconds: 60,
            pasteAttemptCount: 0,
            markingStatus: 'pending-review',
            annotations: [],
            auditTrail: [],
        } as any);

        const updates = (update as any).mock.calls.at(-1)?.[1] ?? {};
        expect(Object.keys(updates).filter((key) => key.startsWith('test_results_by_teacher/'))).toEqual([]);
        expect(updates['test_results_by_teacher/teacher-selected/result-4']).toBeUndefined();
        expect(updates['test_results_by_teacher/teacher-assigned/result-4']).toBeUndefined();
        expect(mockUpsertUnresolvedResultVisibilityReport).toHaveBeenCalledWith(
            expect.objectContaining({
                resultId: 'result-4',
                studentId: 'student-4',
                visibility: expect.objectContaining({
                    ownershipResolved: false,
                    unresolvedReason: 'owner_not_resolved',
                }),
            })
        );
        expect(mockClearUnresolvedResultVisibilityReport).not.toHaveBeenCalled();
    });

    it('syncs grading through the normalized owner instead of raw teacher fallbacks', async () => {
        mockResolveResultOwnership.mockResolvedValueOnce({
            visibility: {
                contextType: 'class_session',
                sourceType: 'session',
                sourceId: 'SESSION-3',
                sourceNameSnapshot: 'Graded Writing',
                visibilityOwnerTeacherId: 'teacher-2',
                ownerResolutionSource: 'session.createdByUserId',
                ownershipResolved: true,
                unresolvedReason: null,
                homeworkId: null,
                sessionCode: 'SESSION-3',
                courseId: null,
                classId: null,
                assignmentId: null,
            },
            sourceLookupAttempted: true,
            strongestKnownSourceClue: 'session:SESSION-3',
        });

        (getDoc as any).mockResolvedValue({
            exists: () => true,
            data: () => ({
                id: 'result-3',
                studentId: 'student-3',
                studentName: 'Student Three',
                context: {
                    type: 'live-session',
                    sessionCode: 'SESSION-3',
                },
                testMeta: {
                    testId: 'test-3',
                    testTitle: 'Graded Writing',
                    format: 'full-test',
                    duration: 60,
                },
                tasks: [],
                submittedAt: 3000,
                totalElapsedTimeSeconds: 120,
                pasteAttemptCount: 0,
                markingStatus: 'pending-review',
                annotations: [],
                auditTrail: [],
            }),
        });
        (get as any).mockImplementation((path: string) => {
            if (path === 'test_results/result-3') {
                return Promise.resolve({
                    exists: () => true,
                    val: () => ({
                        resultId: 'result-3',
                        studentId: 'student-3',
                        teacherId: 'legacy-teacher',
                        sessionCode: 'SESSION-3',
                        testTitle: 'Graded Writing',
                        testType: 'test',
                        testSkill: 'writing',
                        submittedAt: 3000,
                        timeElapsed: 120,
                        createdAt: 3000,
                    }),
                });
            }

            if (path === 'game_sessions/SESSION-3') {
                return Promise.resolve({
                    exists: () => true,
                    val: () => ({
                        createdByUserId: 'teacher-2',
                        title: 'Writing Session',
                    }),
                });
            }

            return Promise.resolve({ exists: () => false, val: () => null });
        });

        await updateGrading(
            'result-3',
            {
                teacherId: 'grader-1',
                teacherName: 'Grader One',
                gradedAt: 4000,
                overallBand: 7,
                perTask: [],
                feedback: {
                    overall: 'Good',
                    perCriteria: {
                        CC: 'cc',
                        LR: 'lr',
                        GRA: 'gra',
                    },
                },
            } as any,
            []
        );

        const canonicalWrite = getSetCall(0)[1];
        const indexUpdates = getUpdatePayload(0);
        expect(indexUpdates['test_results_by_teacher/teacher-2/result-3']).toEqual(
            expect.objectContaining({
                resultId: 'result-3',
                studentId: 'student-3',
            })
        );
        expect(indexUpdates['test_results_by_teacher/grader-1/result-3']).toBeUndefined();
        expect(canonicalWrite).toEqual(
            expect.objectContaining({
                bandScore: 7,
                feedbackUpdatedBy: 'grader-1',
                visibility: expect.objectContaining({
                    visibilityOwnerTeacherId: 'teacher-2',
                    ownershipResolved: true,
                }),
            })
        );
    });

    it('rebuilds the RTDB result record when teachers cannot read the canonical row during final submit', async () => {
        (getDoc as any).mockResolvedValue({
            exists: () => true,
            data: () => ({
                id: 'result-missing',
                studentId: 'student-missing',
                studentName: 'Student Missing',
                context: {
                    type: 'live-session',
                    sessionCode: 'SESSION-MISSING',
                },
                testMeta: {
                    testId: 'test-missing',
                    testTitle: 'Missing Result Writing',
                    format: 'task1-only',
                    duration: 45,
                },
                tasks: [],
                submittedAt: 5000,
                totalElapsedTimeSeconds: 150,
                pasteAttemptCount: 0,
                markingStatus: 'pending-review',
                annotations: [],
                auditTrail: [],
            }),
        });
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        (get as any).mockImplementation((path: string) => {
            if (path === 'test_results/result-missing') {
                return Promise.reject(new Error('Permission denied'));
            }

            if (path === 'game_sessions/SESSION-MISSING') {
                return Promise.resolve({
                    exists: () => true,
                    val: () => ({
                        createdByUserId: 'teacher-1',
                        linkedClassId: 'class-missing',
                        courseId: 'course-missing',
                        moduleId: 'module-missing',
                    }),
                });
            }

            return Promise.resolve({ exists: () => false, val: () => null });
        });

        const result = await updateGrading(
            'result-missing',
            {
                teacherId: 'teacher-1',
                teacherName: 'Teacher One',
                gradedAt: 6000,
                overallBand: 6.5,
                perTask: [],
                feedback: {
                    overall: 'Recovered from missing RTDB row',
                    perCriteria: {
                        CC: 'cc',
                        LR: 'lr',
                        GRA: 'gra',
                    },
                },
            } as any,
            []
        );

        expect(result).toEqual({ success: true });
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('Existing RTDB result row unreadable during grading sync'),
            expect.any(Error)
        );

        const canonicalWrite = getSetCall(0)[1];
        const indexUpdates = getUpdatePayload(0);
        expect(canonicalWrite).toEqual(
            expect.objectContaining({
                resultId: 'result-missing',
                studentId: 'student-missing',
                bandScore: 6.5,
                markingStatus: 'graded',
                feedbackUpdatedBy: 'teacher-1',
                context: expect.objectContaining({
                    type: 'class_session',
                    sessionCode: 'SESSION-MISSING',
                }),
            })
        );
        expect(indexUpdates['test_results_by_teacher/teacher-1/result-missing']).toEqual(
            expect.objectContaining({
                resultId: 'result-missing',
                studentId: 'student-missing',
                markingStatus: 'graded',
            })
        );
        expect(indexUpdates['test_results_by_session/SESSION-MISSING/result-missing']).toEqual(
            expect.objectContaining({
                resultId: 'result-missing',
                studentId: 'student-missing',
                markingStatus: 'graded',
            })
        );

        warnSpy.mockRestore();
    });

    it('marks linked homework attempts as graded after final writing grading', async () => {
        (getDoc as any).mockResolvedValue({
            exists: () => true,
            data: () => ({
                id: 'result-homework',
                studentId: 'student-homework',
                studentName: 'Student Homework',
                context: {
                    type: 'homework',
                    homeworkId: 'homework-1',
                    homeworkSubmissionId: 'homework-submission-1',
                },
                testMeta: {
                    testId: 'test-homework',
                    testTitle: 'Homework Writing',
                    format: 'task1-only',
                    duration: 45,
                },
                tasks: [
                    {
                        taskNumber: 1,
                        taskType: 'bar-chart',
                        promptText: 'Prompt',
                        wordMinimum: 150,
                        essayText: 'Homework essay',
                        wordCount: 2,
                        activeTimeSeconds: 90,
                    },
                ],
                submittedAt: 7000,
                totalElapsedTimeSeconds: 180,
                pasteAttemptCount: 0,
                markingStatus: 'pending-review',
                annotations: [],
                auditTrail: [],
            }),
        });
        (get as any).mockResolvedValue({ exists: () => false, val: () => null });

        const result = await updateGrading(
            'result-homework',
            {
                teacherId: 'grader-2',
                teacherName: 'Grader Two',
                gradedAt: 8000,
                overallBand: 6.5,
                perTask: [],
                feedback: {
                    overall: 'Reviewed',
                    perCriteria: {
                        CC: 'cc',
                        LR: 'lr',
                        GRA: 'gra',
                    },
                },
            } as any,
            [],
            { markingStatus: 'graded' }
        );

        expect(result).toEqual({ success: true });
        expect(mockMarkHomeworkSubmissionGraded).toHaveBeenCalledWith(
            'homework-submission-1',
            { bandScore: 6.5 }
        );
    });

    it('keeps draft grading pending and skips canonical result sync until final submit', async () => {
        (getDoc as any).mockResolvedValue({
            exists: () => true,
            data: () => ({
                id: 'result-draft',
                studentId: 'student-draft',
                studentName: 'Student Draft',
                context: {
                    type: 'live-session',
                    sessionCode: 'SESSION-DRAFT',
                },
                testMeta: {
                    testId: 'test-draft',
                    testTitle: 'Draft Writing',
                    format: 'task1-only',
                    duration: 60,
                },
                tasks: [],
                submittedAt: 3500,
                totalElapsedTimeSeconds: 120,
                pasteAttemptCount: 0,
                markingStatus: 'pending-review',
                annotations: [],
                auditTrail: [],
            }),
        });

        const result = await updateGrading(
            'result-draft',
            {
                teacherId: 'grader-1',
                teacherName: 'Grader One',
                gradedAt: 4500,
                overallBand: 6,
                perTask: [],
                feedback: {
                    overall: 'Draft feedback',
                    perCriteria: {
                        CC: 'cc',
                        LR: 'lr',
                        GRA: 'gra',
                    },
                },
            } as any,
            [],
            {
                markingStatus: 'pending-review',
            }
        );

        expect(result).toEqual({ success: true });
        expect(updateDoc).toHaveBeenCalledWith(
            'writing_submissions/result-draft',
            expect.objectContaining({
                markingStatus: 'pending-review',
                grading: expect.objectContaining({
                    overallBand: 6,
                }),
            })
        );
        expect(update).not.toHaveBeenCalled();
    });

    it('auto-submits writing results through the same canonical materialization path', async () => {
        (push as any).mockReturnValue({ key: 'result-4' });
        (get as any).mockImplementation((path: string) => {
            if (path === 'game_sessions/SESSION-4/students/student-4/writing') {
                return Promise.resolve({
                    val: () => ({
                        submitted: false,
                        task1: { text: 'Essay text', activeTimeSeconds: 12 },
                        totalElapsedTime: 90,
                        pasteAttemptCount: 4,
                    }),
                });
            }

            if (path === 'game_sessions/SESSION-4') {
                return Promise.resolve({
                    exists: () => true,
                    val: () => ({
                        linkedClassId: 'class-4',
                        courseId: 'course-4',
                        moduleId: 'module-4',
                        players: { 'student-4': {} },
                    }),
                });
            }

            return Promise.resolve({ exists: () => false, val: () => null });
        });

        await autoSubmitFromRTDB(
            'SESSION-4',
            'student-4',
            'Student Four',
            {
                id: 'test-4',
                testType: 'IELTS',
                skill: 'Writing',
                metadata: {
                    title: 'Auto Submit Writing',
                    duration: 60,
                    format: 'task1-only',
                },
                tasks: [
                {
                    taskNumber: 1,
                    taskType: 'bar-chart',
                    promptText: 'Prompt',
                    wordMinimum: 150,
                    showModelAnswerToStudent: false,
                },
                ],
                createdBy: 'teacher-legacy',
                ownerId: 'teacher-legacy',
                isPublic: true,
                createdAt: 100,
                updatedAt: 100,
            } as any
        );

        const resultUpdates = getUpdatePayload(0);
        expect(resultUpdates['test_results_by_teacher/teacher-1/result-4']).toEqual(
            expect.objectContaining({
                resultId: 'result-4',
            })
        );
        expect(setDoc).toHaveBeenCalledWith(
            expect.stringContaining('writing_submissions'),
            expect.objectContaining({
                id: 'result-4',
                studentId: 'student-4',
                pasteAttemptCount: 4,
                context: expect.objectContaining({
                    type: 'live-session',
                    sessionCode: 'SESSION-4',
                    assigningTeacherId: 'teacher-legacy',
                    classId: 'class-4',
                    courseId: 'course-4',
                    moduleId: 'module-4',
                }),
            })
        );
        expect(mockNotifyWritingSubmitted).toHaveBeenCalledWith(
            'student-4',
            'result-4',
            'Auto Submit Writing',
            'class-session'
        );
    });

    it('filters pending submissions by assignment metadata instead of grading.teacherId', async () => {
        (getDocs as any).mockResolvedValue({
            forEach: (callback: (docSnap: { data: () => unknown }) => void) => {
                callback({
                    data: () => ({
                        id: 'submission-1',
                        markingStatus: 'pending-review',
                        grading: { teacherId: 'teacher-1' },
                        context: {},
                    }),
                });
                callback({
                    data: () => ({
                        id: 'submission-2',
                        markingStatus: 'pending-review',
                        context: { assigningTeacherId: 'teacher-1' },
                    }),
                });
            },
        });

        const { getPendingSubmissions } = await import('./writingSubmissionService');
        const result = await getPendingSubmissions('teacher-1');

        expect(result.data).toHaveLength(1);
        expect(result.data?.[0]).toMatchObject({
            id: 'submission-2',
            context: { assigningTeacherId: 'teacher-1' },
        });
    });
});
