
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    saveTestResult,
    getTeacherResults,
    getTeacherStudentResults,
    getStudentResults,
    getSessionResults,
    rebuildTeacherResultIndexes,
    updateResultScore,
    getReMarkHistory,
    markAsReviewed,
    deleteTestResult,
    getStudentTestAttempts,
    getHistoricalScores,
    getClassTestScores,
    TestResultRecord
} from './testResults.service';
// @ts-ignore
import { database } from './firebase';
import { ref, set, get, push, update, runTransaction } from 'firebase/database';

const {
    mockCreateTrustedNotification,
    mockDispatchTestCompleteNotification,
    mockNotifyCommittedEvent,
    mockGetAuth,
    mockGetAuthorizedTeacherResult,
    mockResolveResultOwnership,
    mockClassifyTeacherResultVisibility,
    mockClearUnresolvedResultVisibilityReport,
    mockUpsertUnresolvedResultVisibilityReport,
    mockTriggerFormativeFeedbackForSavedResult,
} = vi.hoisted(() => ({
    mockCreateTrustedNotification: vi.fn(),
    mockDispatchTestCompleteNotification: vi.fn(),
    mockNotifyCommittedEvent: vi.fn(),
    mockGetAuth: vi.fn(),
    mockGetAuthorizedTeacherResult: vi.fn(),
    mockResolveResultOwnership: vi.fn(),
    mockClassifyTeacherResultVisibility: vi.fn(),
    mockClearUnresolvedResultVisibilityReport: vi.fn(),
    mockUpsertUnresolvedResultVisibilityReport: vi.fn(),
    mockTriggerFormativeFeedbackForSavedResult: vi.fn(),
}));

// Mock Firebase
vi.mock('./firebase', () => ({
    database: {}
}));

vi.mock('firebase/database', () => ({
    ref: vi.fn(),
    set: vi.fn(),
    get: vi.fn(),
    push: vi.fn(),
    update: vi.fn(),
    runTransaction: vi.fn()
}));

vi.mock('firebase/auth', () => ({ getAuth: mockGetAuth }));

// Mock autoMarking service
vi.mock('./autoMarking.service', () => ({
    calculateBandScore: vi.fn().mockReturnValue(7.0)
}));

// Mock guestResultsService
vi.mock('./guestResultsService', () => ({
    saveGuestResult: vi.fn().mockResolvedValue('guest-result-123')
}));

vi.mock('./resultOwnershipResolver', () => ({
    resolveResultOwnership: mockResolveResultOwnership,
}));

vi.mock('./resultVisibility.service', () => ({
    classifyTeacherResultVisibility: mockClassifyTeacherResultVisibility,
}));

vi.mock('./resultVisibilityReporting.service', () => ({
    clearUnresolvedResultVisibilityReport: mockClearUnresolvedResultVisibilityReport,
    upsertUnresolvedResultVisibilityReport: mockUpsertUnresolvedResultVisibilityReport,
}));

vi.mock('./notificationProducerClient', () => ({
    createTrustedNotification: mockCreateTrustedNotification,
    dispatchCommittedNotification: mockDispatchTestCompleteNotification,
    notifyCommittedEvent: mockNotifyCommittedEvent,
}));

vi.mock('./feedbackService', () => ({ getAuthorizedTeacherResult: mockGetAuthorizedTeacherResult }));

vi.mock('./resultFeedbackGeneration.service', () => ({
    triggerFormativeFeedbackForSavedResult: (...args: any[]) =>
        mockTriggerFormativeFeedbackForSavedResult(...args),
}));

function createLegacyResultRecord(
    overrides: Partial<TestResultRecord> = {}
): TestResultRecord {
    return {
        resultId: 'legacy-row',
        sessionCode: 'SESSION-1',
        testId: 'TEST-1',
        studentId: 'student-1',
        studentName: 'Student Name',
        totalScore: 8,
        maxScore: 10,
        percentage: 80,
        bandScore: 7,
        questionResults: [],
        correct: 8,
        incorrect: 2,
        partialCredit: 0,
        totalQuestions: 10,
        submittedAt: 1000,
        timeElapsed: 100,
        testDuration: 30,
        createdAt: 1000,
        testTitle: 'Legacy Result',
        testType: 'test',
        testSkill: 'reading',
        ...overrides,
    };
}

function getSaveResultUpdatePayload(resultId = 'result-123'): Record<string, unknown> {
    const call = vi.mocked(update).mock.calls.find(([, payload]) =>
        Object.keys(payload).some(key => key.endsWith('/' + resultId) && key.startsWith('test_results_by_')));
    if (!call) throw new Error('Expected saveTestResult secondary index fanout');
    return call[1];
}

function getSavedResultRecord(resultId = 'result-123'): Record<string, any> {
    const call = vi.mocked(set).mock.calls.find(([, payload]) => payload?.resultId === resultId);
    if (!call) throw new Error('Expected saveTestResult initial canonical write');
    return call[1];
}

describe('testResults.service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(get).mockReset();
        vi.mocked(runTransaction).mockReset().mockImplementation(async (_path, repair) => ({
            snapshot: { val: () => repair(null) },
        } as any));
        mockResolveResultOwnership.mockReset();
        (ref as any).mockImplementation((_database: unknown, path?: string) => path ?? '__root__');
        mockGetAuth.mockReturnValue(undefined);
        mockNotifyCommittedEvent.mockResolvedValue({ status: 'written', delivered: 1 });
        mockCreateTrustedNotification.mockResolvedValue({ success: true, notificationId: 'notification-1' });
        mockDispatchTestCompleteNotification.mockResolvedValue({ success: true, status: 'delivered' });
        mockGetAuthorizedTeacherResult.mockResolvedValue({
            status: 'committed', eventId: '00000000-0000-4000-8000-000000000121', notificationStatus: 'delivered',
        });
        mockClearUnresolvedResultVisibilityReport.mockResolvedValue(undefined);
        mockUpsertUnresolvedResultVisibilityReport.mockResolvedValue(undefined);
        mockResolveResultOwnership.mockImplementation(async ({ result }: any) => ({
            visibility: {
                contextType: 'class_session',
                sourceType: 'session',
                sourceId: result?.sessionCode ?? 'SESSION-1',
                sourceNameSnapshot: result?.testTitle ?? 'Test',
                visibilityOwnerTeacherId: 'teacher-1',
                ownerResolutionSource: 'session.createdByUserId',
                ownershipResolved: true,
                unresolvedReason: null,
                homeworkId: null,
                sessionCode: result?.sessionCode ?? 'SESSION-1',
                courseId: result?.courseId ?? null,
                classId: result?.classId ?? null,
                assignmentId: null,
            },
            sourceLookupAttempted: true,
            strongestKnownSourceClue: `session:${result?.sessionCode ?? 'SESSION-1'}`,
        }));
        mockClassifyTeacherResultVisibility.mockImplementation(({ result, teacherId, hasAssignmentAccess }: any) => ({
            shouldDisplayInTeacherHistory: Boolean(
                hasAssignmentAccess
                && result?.visibility?.ownershipResolved
                && result.visibility.visibilityOwnerTeacherId === teacherId
            ),
        }));
    });

    it('retrieves teacher session results from boolean teacher keys and authorized canonical records', async () => {
        mockGetAuth.mockReturnValue({ currentUser: { uid: 'teacher-1' } });
        const result = createLegacyResultRecord({ resultId: 'session-result', sessionCode: 'SESSION1',
            visibility: { ownershipResolved: true, visibilityOwnerTeacherId: 'teacher-1', contextType: 'class_session' } });
        (get as any).mockImplementation(async (path: string) => ({
            exists: () => true,
            val: () => path === 'users/teacher-1/role' ? 'teacher'
                : path === 'teacher_result_keys/teacher-1' ? { 'session-result': true }
                : result,
        }));
        expect(await getSessionResults('SESSION1')).toEqual([result]);
        expect(get).toHaveBeenCalledWith('teacher_result_keys/teacher-1');
        expect(get).toHaveBeenCalledWith('test_results/session-result');
        expect(get).not.toHaveBeenCalledWith('test_results_by_session/SESSION1');
    });

    it('deletes results and their optional indexes atomically and propagates rejection', async () => {
        const result = createLegacyResultRecord({
            resultId: 'result-delete', sessionCode: 'reading-v2',
            visibility: {
                contextType: 'homework', sourceType: 'homework', sourceId: 'homework-1',
                sourceNameSnapshot: 'Homework', visibilityOwnerTeacherId: 'teacher-1',
                ownerResolutionSource: 'homework.createdBy', ownershipResolved: true,
                unresolvedReason: null, homeworkId: 'homework-1', sessionCode: null,
                courseId: 'course-1', classId: 'class-1', assignmentId: null,
            },
        });
        vi.mocked(get).mockResolvedValue({ exists: () => true, val: () => result } as any);
        vi.mocked(update).mockResolvedValue(undefined);

        await deleteTestResult(result.resultId);

        expect(update).toHaveBeenCalledExactlyOnceWith('__root__', {
            'test_results/result-delete': null,
            'test_results_by_session/reading-v2/result-delete': null,
            'test_results_by_student/student-1/result-delete': null,
            'teacher_result_keys/teacher-1/result-delete': null,
            'test_results_by_course/course-1/student-1/result-delete': null,
            'test_results_by_class/class-1/student-1/result-delete': null,
        });
        expect(set).not.toHaveBeenCalled();
        expect(mockClearUnresolvedResultVisibilityReport).toHaveBeenCalledWith('result-delete');

        vi.mocked(update).mockClear();
        mockClearUnresolvedResultVisibilityReport.mockClear();
        const solo = { ...result, visibility: { ...result.visibility!,
            contextType: 'solo_practice', sourceType: 'solo_practice',
            visibilityOwnerTeacherId: null, courseId: null, classId: null,
        } };
        vi.mocked(get).mockResolvedValue({ exists: () => true, val: () => solo } as any);
        await deleteTestResult(result.resultId);
        expect(update).toHaveBeenCalledExactlyOnceWith('__root__', {
            'test_results/result-delete': null,
            'test_results_by_session/reading-v2/result-delete': null,
            'test_results_by_student/student-1/result-delete': null,
            'test_results_solo_practice_by_student/student-1/result-delete': null,
        });

        mockClearUnresolvedResultVisibilityReport.mockClear();
        const denied = new Error('permission_denied');
        vi.mocked(update).mockRejectedValueOnce(denied);
        await expect(deleteTestResult(result.resultId)).rejects.toBe(denied);
        expect(mockClearUnresolvedResultVisibilityReport).not.toHaveBeenCalled();
        expect(set).not.toHaveBeenCalled();
    });

    describe('saveTestResult', () => {
        it.each(['pending', 'failed'])('returns the committed result when completion delivery is %s', async mode => {
            vi.mocked(push).mockReturnValue({ key: 'result-123' } as any);
            mockNotifyCommittedEvent.mockReturnValue(mode === 'pending' ? new Promise(() => {})
                : Promise.resolve({ status: 'failed', failed: 1, code: 'PERMISSION_DENIED' }));
            const marking = { totalScore: 1, maxScore: 2, percentage: 50, completedAt: 123,
                questionResults: [], summary: { correct: 1, incorrect: 1, partialCredit: 0, totalQuestions: 2 } };
            await expect(saveTestResult('LIVE1', 'test-1', 'student-1', 'Student', marking as any,
                { title: 'Test', type: 'reading', skill: 'reading', duration: 10 }, 30)).resolves.toBe('result-123');
            expect(set).toHaveBeenCalledOnce();
            expect(update).toHaveBeenCalledOnce();
            expect(mockNotifyCommittedEvent).toHaveBeenCalledExactlyOnceWith({ eventKind: 'result-completed', resultId: 'result-123' });
        });
        it('commits canonical once before projection fanout without attempting forbidden student update', async () => {
            vi.mocked(update).mockImplementationOnce(async (_path, payload) => {
                if (Object.keys(payload).some(key => key.startsWith('test_results/'))) {
                    throw new Error('PERMISSION_DENIED: student canonical UPDATE');
                }
            });
            const mockPush = { key: 'result-123' };
            (push as any).mockReturnValue(mockPush);

            const sessionCode = 'SESSION-1';
            const testId = 'TEST-1';
            const studentId = 'student-1';
            const teacherId = 'teacher-1';

            const markingResult = {
                totalScore: 10,
                maxScore: 20,
                percentage: 50,
                completedAt: 1000,
                questionResults: [],
                summary: { correct: 5, incorrect: 5, partialCredit: 0, totalQuestions: 10 }
            } as any;

            const metadata = {
                title: 'Test',
                type: 'reading',
                skill: 'reading',
                duration: 30
            };

            const resultId = await saveTestResult(
                sessionCode, testId, studentId, 'Student Name',
                markingResult, metadata, 500, teacherId, false
            );

            expect(resultId).toBe('result-123');
            expect(set).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    resultId: 'result-123',
                    studentId,
                    sessionCode,
                })
            );

            const updates = getSaveResultUpdatePayload('result-123');
            expect(getSavedResultRecord('result-123')).toEqual(
                expect.objectContaining({
                    resultId: 'result-123',
                    studentId,
                    sessionCode,
                })
            );
            expect(updates[`test_results_by_session/${sessionCode}/${resultId}`]).toEqual(
                expect.objectContaining({
                    resultId,
                    studentId,
                    studentName: 'Student Name',
                })
            );
            expect(updates[`test_results_by_student/${studentId}/${resultId}`]).toEqual(
                expect.objectContaining({
                    resultId,
                    sessionCode,
                    testId,
                })
            );
            expect(updates[`teacher_result_keys/${teacherId}/${resultId}`]).toEqual(true);
            expect(Object.keys(updates).some(key => key.startsWith('test_results/'))).toBe(false);
            expect(set).toHaveBeenCalledTimes(1);
            expect(vi.mocked(set).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(update).mock.invocationCallOrder[0]);
            expect(mockClearUnresolvedResultVisibilityReport).toHaveBeenCalledWith('result-123');
            expect(mockNotifyCommittedEvent).toHaveBeenCalledWith({ eventKind: 'result-completed', resultId: 'result-123' });
            expect(mockCreateTrustedNotification).not.toHaveBeenCalled();
            expect(vi.mocked(update).mock.invocationCallOrder[0]).toBeLessThan(mockNotifyCommittedEvent.mock.invocationCallOrder[0]);
        });

        it('writes a stable solo result id with operation identity for idempotent reload recovery', async () => {
            (get as any).mockResolvedValueOnce({
                exists: () => false,
                val: () => null,
            });

            const markingResult = {
                totalScore: 10,
                maxScore: 20,
                percentage: 50,
                completedAt: 1000,
                questionResults: [],
                summary: { correct: 5, incorrect: 5, partialCredit: 0, totalQuestions: 10 },
            } as any;

            const resultId = await saveTestResult(
                'self_study__student-1__TEST-1__attempt-001__submit',
                'TEST-1',
                'student-1',
                'Student Name',
                markingResult,
                { title: 'Test', type: 'IELTS', skill: 'Listening', duration: 30 },
                500,
                undefined,
                false,
                undefined,
                undefined,
                {
                    type: 'self_study',
                    source: { type: 'library', id: 'TEST-1', name: 'Test' },
                },
                undefined,
                undefined,
                {
                    stableResultId: 'listening_solo__self_study__student-1__TEST-1__attempt-001__submit',
                    submissionOperationId: 'self_study__student-1__TEST-1__attempt-001__submit',
                },
            );

            expect(resultId).toBe('listening_solo__self_study__student-1__TEST-1__attempt-001__submit');
            expect(mockNotifyCommittedEvent).toHaveBeenCalledWith({ eventKind: 'result-completed', resultId });
            expect(push).not.toHaveBeenCalled();
            expect(set).toHaveBeenCalledWith(
                'test_results/listening_solo__self_study__student-1__TEST-1__attempt-001__submit',
                expect.objectContaining({
                    resultId: 'listening_solo__self_study__student-1__TEST-1__attempt-001__submit',
                    submissionOperationId: 'self_study__student-1__TEST-1__attempt-001__submit',
                }),
            );
        });

        it('returns an existing stable solo result after projection repair without canonical writes or side effects', async () => {
            (get as any).mockResolvedValueOnce({
                exists: () => true,
                val: () => createLegacyResultRecord({
                    resultId: 'listening_solo__self_study__student-1__TEST-1__attempt-001__submit',
                    sessionCode: 'self_study__student-1__TEST-1__attempt-001__submit',
                    testId: 'TEST-1',
                    studentId: 'student-1',
                    testSkill: 'Listening',
                    ...( { submissionOperationId: 'self_study__student-1__TEST-1__attempt-001__submit' } as any ),
                }),
            });

            const resultId = await saveTestResult(
                'self_study__student-1__TEST-1__attempt-001__submit',
                'TEST-1',
                'student-1',
                'Student Name',
                {
                    totalScore: 10,
                    maxScore: 20,
                    percentage: 50,
                    completedAt: 1000,
                    questionResults: [],
                    summary: { correct: 5, incorrect: 5, partialCredit: 0, totalQuestions: 10 },
                } as any,
                { title: 'Test', type: 'IELTS', skill: 'Listening', duration: 30 },
                500,
                undefined,
                false,
                undefined,
                undefined,
                {
                    type: 'self_study',
                    source: { type: 'library', id: 'TEST-1', name: 'Test' },
                },
                undefined,
                undefined,
                {
                    stableResultId: 'listening_solo__self_study__student-1__TEST-1__attempt-001__submit',
                    submissionOperationId: 'self_study__student-1__TEST-1__attempt-001__submit',
                },
            );

            expect(resultId).toBe('listening_solo__self_study__student-1__TEST-1__attempt-001__submit');
            expect(set).not.toHaveBeenCalled();
            expect(update).not.toHaveBeenCalled();
            expect(runTransaction).toHaveBeenCalledTimes(2);
            expect(mockCreateTrustedNotification).not.toHaveBeenCalled();
            expect(mockTriggerFormativeFeedbackForSavedResult).not.toHaveBeenCalled();
        });

        it('same-operation retry repairs missing projections from accepted canonical save and preserves newer grading', async () => {
            const resultId = 'stable-result';
            const records: Record<string, any> = {};
            const args = [
                'SESSION-1', 'TEST-1', 'student-1', 'Student Name',
                { totalScore: 10, maxScore: 20, percentage: 50, completedAt: 1000, questionResults: [],
                    summary: { correct: 5, incorrect: 5, partialCredit: 0, totalQuestions: 10 } },
                { title: 'Test', type: 'reading', skill: 'reading', duration: 30 },
                500, undefined, false, undefined, undefined, undefined, undefined, undefined,
                { stableResultId: resultId, submissionOperationId: 'operation-1' },
            ] as Parameters<typeof saveTestResult>;
            vi.mocked(get).mockImplementation(async path => ({
                exists: () => records[String(path)] !== undefined, val: () => records[String(path)],
            } as any));
            vi.mocked(set).mockImplementationOnce(async (path, value) => { records[String(path)] = value; });
            vi.mocked(update).mockRejectedValueOnce(new Error('Connection lost after canonical save'));
            await expect(saveTestResult(...args)).rejects.toThrow('Connection lost after canonical save');
            const canonical = { ...records['test_results/stable-result'], percentage: 95, totalScore: 19,
                teacherFeedback: { text: 'New grading', read: true } };
            records['test_results/stable-result'] = canonical;
            const newerSessionProjection = { resultId, studentId: 'student-1', submittedAt: 1000, percentage: 99 };
            records['test_results_by_session/SESSION-1/stable-result'] = newerSessionProjection;
            vi.mocked(runTransaction).mockImplementation(async (path, repair) => {
                const current = records[String(path)] ?? null;
                const value = repair(current);
                if (value !== undefined) records[String(path)] = value;
                return { snapshot: { val: () => records[String(path)] } } as any;
            });
            expect(await saveTestResult(...args)).toBe(resultId);
            expect(records['test_results/stable-result']).toBe(canonical);
            expect(records['test_results_by_session/SESSION-1/stable-result']).toBe(newerSessionProjection);
            expect(records['test_results_by_student/student-1/stable-result']).toMatchObject({ percentage: 95 });
            expect(records['teacher_result_keys/teacher-1/stable-result']).toBe(true);
            expect(set).toHaveBeenCalledTimes(1);
            expect(update).toHaveBeenCalledTimes(1);
            expect(push).not.toHaveBeenCalled();
            expect(mockCreateTrustedNotification).not.toHaveBeenCalled();
            expect(mockTriggerFormativeFeedbackForSavedResult).not.toHaveBeenCalled();
            records['test_results/stable-result'] = { ...canonical, studentId: 'other-student' };
            const repairCount = vi.mocked(runTransaction).mock.calls.length;
            await expect(saveTestResult(...args)).rejects.toThrow('saved submission identity');
            expect(runTransaction).toHaveBeenCalledTimes(repairCount);
        });

        it('rejects a stable result id that belongs to a different submit operation', async () => {
            (get as any).mockResolvedValueOnce({
                exists: () => true,
                val: () => createLegacyResultRecord({
                    resultId: 'listening_solo__self_study__student-1__TEST-1__attempt-001__submit',
                    sessionCode: 'self_study__student-1__TEST-1__attempt-001__submit',
                    testId: 'TEST-1',
                    studentId: 'student-1',
                    testSkill: 'Listening',
                    ...( { submissionOperationId: 'different-operation' } as any ),
                }),
            });

            await expect(saveTestResult(
                'self_study__student-1__TEST-1__attempt-001__submit',
                'TEST-1',
                'student-1',
                'Student Name',
                {
                    totalScore: 10,
                    maxScore: 20,
                    percentage: 50,
                    completedAt: 1000,
                    questionResults: [],
                    summary: { correct: 5, incorrect: 5, partialCredit: 0, totalQuestions: 10 },
                } as any,
                { title: 'Test', type: 'IELTS', skill: 'Listening', duration: 30 },
                500,
                undefined,
                false,
                undefined,
                undefined,
                {
                    type: 'self_study',
                    source: { type: 'library', id: 'TEST-1', name: 'Test' },
                },
                undefined,
                undefined,
                {
                    stableResultId: 'listening_solo__self_study__student-1__TEST-1__attempt-001__submit',
                    submissionOperationId: 'self_study__student-1__TEST-1__attempt-001__submit',
                },
            )).rejects.toThrow(/already belongs to another submit operation/i);

            expect(set).not.toHaveBeenCalled();
            expect(update).not.toHaveBeenCalled();
        });

        it('writes the canonical result before fan-out indexes so RTDB rule checks can resolve the row', async () => {
            const mockPush = { key: 'result-order-1' };
            (push as any).mockReturnValue(mockPush);

            const markingResult = {
                totalScore: 10,
                maxScore: 20,
                percentage: 50,
                completedAt: 1000,
                questionResults: [],
                summary: { correct: 5, incorrect: 5, partialCredit: 0, totalQuestions: 10 }
            } as any;

            const metadata = {
                title: 'Test',
                type: 'reading',
                skill: 'reading',
                duration: 30
            };

            await saveTestResult(
                'SESSION-1', 'TEST-1', 'student-1', 'Student Name',
                markingResult, metadata, 500, 'teacher-1', false
            );

            expect((set as any).mock.invocationCallOrder[0]).toBeLessThan(
                (update as any).mock.invocationCallOrder[0]
            );
        });

        it('sanitizes nested undefined fields in result context before persisting to RTDB', async () => {
            const mockPush = { key: 'result-context-1' };
            (push as any).mockReturnValue(mockPush);

            const markingResult = {
                totalScore: 0,
                maxScore: 20,
                percentage: 0,
                completedAt: 1000,
                questionResults: [],
                summary: { correct: 0, incorrect: 20, partialCredit: 0, totalQuestions: 20 }
            } as any;

            const metadata = {
                title: 'Reading Test',
                type: 'IELTS',
                skill: 'Reading',
                duration: 30
            };

            await saveTestResult(
                'SESSION-CONTEXT',
                'TEST-CONTEXT',
                'student-1',
                'Student Name',
                markingResult,
                metadata,
                500,
                'teacher-1',
                false,
                undefined,
                undefined,
                {
                    type: 'class_session',
                    source: {
                        type: 'class',
                        id: 'SESSION-CONTEXT',
                        name: 'Reading Test',
                        sessionCode: 'SESSION-CONTEXT',
                        classId: undefined,
                        courseId: undefined,
                    },
                    sessionCode: 'SESSION-CONTEXT',
                    classId: undefined,
                    courseId: undefined,
                    assignmentId: undefined,
                    configApplied: {
                        timerMinutes: 30,
                        feedbackTiming: 'after_completion',
                        source: 'teacher_override',
                    },
                },
            );

            expect(set).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    context: expect.objectContaining({
                        sessionCode: 'SESSION-CONTEXT',
                        classId: null,
                        courseId: null,
                        assignmentId: null,
                        source: expect.objectContaining({
                            classId: null,
                            courseId: null,
                        }),
                    }),
                })
            );
        });

        it('should seed feedback generation metadata and trigger initial feedback for IELTS reading saves', async () => {
            const mockPush = { key: 'result-ielts-1' };
            (push as any).mockReturnValue(mockPush);

            const markingResult = {
                totalScore: 30,
                maxScore: 40,
                percentage: 75,
                completedAt: 1000,
                questionResults: [],
                summary: { correct: 30, incorrect: 10, partialCredit: 0, totalQuestions: 40 }
            } as any;

            const metadata = {
                title: 'IELTS Reading Practice',
                type: 'ielts-reading',
                skill: 'reading',
                duration: 60
            };

            const ieltsData = {
                passageResults: [
                    { passageName: 'Passage 1', questionRange: [1, 13] as [number, number], correct: 10, total: 13, percentage: 76.9 },
                    { passageName: 'Passage 2', questionRange: [14, 26] as [number, number], correct: 11, total: 13, percentage: 84.6 },
                    { passageName: 'Passage 3', questionRange: [27, 40] as [number, number], correct: 9, total: 14, percentage: 64.3 },
                ]
            };

            const resultId = await saveTestResult(
                'SESSION-IELTS',
                'TEST-IELTS',
                'student-1',
                'Student Name',
                markingResult,
                metadata,
                3000,
                'teacher-1',
                false,
                undefined,
                undefined,
                undefined,
                undefined,
                ieltsData,
            );

            expect(resultId).toBe('result-ielts-1');

            const updates = getSaveResultUpdatePayload('result-ielts-1');
            expect(getSavedResultRecord('result-ielts-1')).toEqual(
                expect.objectContaining({
                    feedbackGenerationMeta: expect.objectContaining({
                        kind: 'ielts-reading',
                        lastAttemptAt: null,
                        lastTriggerSource: null,
                        lastOutcome: null,
                        lastError: null,
                    }),
                }),
            );

            await vi.waitFor(() => expect(mockTriggerFormativeFeedbackForSavedResult).toHaveBeenCalledWith(
                'result-ielts-1',
                { triggerSource: 'saveTestResult' },
            ));
        });

        it('does not trigger initial feedback for pending-review writing saves', async () => {
            const mockPush = { key: 'result-writing-1' };
            (push as any).mockReturnValue(mockPush);

            const markingResult = {
                totalScore: 8,
                maxScore: 10,
                percentage: 80,
                completedAt: 1000,
                questionResults: [],
                summary: { correct: 8, incorrect: 2, partialCredit: 0, totalQuestions: 10 }
            } as any;

            const metadata = {
                title: 'Writing Task',
                type: 'writing',
                skill: 'writing',
                duration: 60
            };

            const submissionContent = {
                writing: { text: 'Essay content', wordCount: 250 },
            };

            await saveTestResult(
                'SESSION-1',
                'TEST-1',
                'student-1',
                'Student Name',
                markingResult,
                metadata,
                3000,
                'teacher-1',
                false,
                submissionContent,
            );

            expect(mockTriggerFormativeFeedbackForSavedResult).not.toHaveBeenCalled();
            const updates = getSaveResultUpdatePayload('result-writing-1');
            expect(getSavedResultRecord('result-writing-1')).toEqual(
                expect.objectContaining({
                    feedbackGenerationMeta: expect.objectContaining({
                        kind: null,
                    }),
                }),
            );
        });

        it('should not create a teacher index for solo-practice rows even when teacherId is passed', async () => {
            const mockPush = { key: 'result-solo-1' };
            (push as any).mockReturnValue(mockPush);
            mockResolveResultOwnership.mockResolvedValueOnce({
                visibility: {
                    contextType: 'solo_practice',
                    sourceType: 'solo_practice',
                    sourceId: 'material-1',
                    sourceNameSnapshot: 'Solo Practice',
                    visibilityOwnerTeacherId: null,
                    ownerResolutionSource: 'solo_practice',
                    ownershipResolved: true,
                    unresolvedReason: null,
                    homeworkId: null,
                    sessionCode: 'solo-session',
                    courseId: null,
                    classId: null,
                    assignmentId: null,
                },
                sourceLookupAttempted: false,
                strongestKnownSourceClue: 'solo_practice:material-1',
            });

            const markingResult = {
                totalScore: 10,
                maxScore: 20,
                percentage: 50,
                completedAt: 1000,
                questionResults: [],
                summary: { correct: 5, incorrect: 5, partialCredit: 0, totalQuestions: 10 }
            } as any;

            const metadata = {
                title: 'Solo Test',
                type: 'reading',
                skill: 'reading',
                duration: 30
            };

            await saveTestResult(
                'solo-session', 'TEST-1', 'student-1', 'Student Name',
                markingResult, metadata, 500, 'teacher-1', false, undefined, undefined,
                {
                    type: 'self_study',
                    source: { type: 'library', id: 'material-1', name: 'Solo Practice' },
                    configApplied: { feedbackTiming: 'immediate', source: 'material_default' }
                } as any
            );

            const updates = getSaveResultUpdatePayload('result-solo-1');
            expect(updates['teacher_result_keys/teacher-1/result-solo-1']).toBeUndefined();
            expect(updates['test_results_solo_practice_by_student/student-1/result-solo-1']).toEqual(
                expect.objectContaining({
                    resultId: 'result-solo-1',
                    sessionCode: 'solo-session',
                    testId: 'TEST-1',
                })
            );
        });

        it('should keep student and session indexes when visibility is unresolved', async () => {
            (push as any).mockReturnValue({ key: 'result-123' });
            mockResolveResultOwnership.mockResolvedValueOnce({
                visibility: {
                    contextType: 'class_session',
                    sourceType: 'session',
                    sourceId: 'SESSION-1',
                    sourceNameSnapshot: 'Test',
                    visibilityOwnerTeacherId: null,
                    ownerResolutionSource: 'unresolved',
                    ownershipResolved: false,
                    unresolvedReason: 'owner_not_resolved',
                    homeworkId: null,
                    sessionCode: 'SESSION-1',
                    courseId: null,
                    classId: null,
                    assignmentId: null,
                },
                sourceLookupAttempted: true,
                strongestKnownSourceClue: 'session:SESSION-1',
            });

            const markingResult = {
                totalScore: 10,
                maxScore: 20,
                percentage: 50,
                completedAt: 1000,
                questionResults: [],
                summary: { correct: 5, incorrect: 5, partialCredit: 0, totalQuestions: 10 }
            } as any;

            const metadata = {
                title: 'Test',
                type: 'reading',
                skill: 'reading',
                duration: 30
            };

            await saveTestResult(
                'SESSION-1', 'TEST-1', 'student-1', 'Student Name',
                markingResult, metadata, 500, 'teacher-1', false
            );

            const updates = getSaveResultUpdatePayload('result-123');
            expect(getSavedResultRecord('result-123')).toBeDefined();
            expect(updates['test_results_by_session/SESSION-1/result-123']).toEqual(
                expect.objectContaining({ resultId: 'result-123', studentId: 'student-1' })
            );
            expect(updates['test_results_by_student/student-1/result-123']).toEqual(
                expect.objectContaining({ resultId: 'result-123', sessionCode: 'SESSION-1' })
            );
            expect(updates['teacher_result_keys/teacher-1/result-123']).toBeUndefined();
        });

        it('persists student-private homework with true homework context and only its student result index', async () => {
            (push as any).mockReturnValue({ key: '-P2vOtvgXx1Vn6A5Ueku' });
            const homeworkContext = {
                type: 'homework',
                source: { type: 'homework', id: 'homework-1', name: 'Assigned THCS', submissionId: 'attempt-1' },
                assignment: { homeworkId: 'homework-1', attemptNumber: 1 },
                configApplied: { timerMinutes: 45, feedbackTiming: 'after_completion', source: 'teacher_override' },
            } as any;

            await saveTestResult(
                'homework_practice_attempt-1', 'thcs-material-1', 'student-1', 'Student Name',
                { totalScore: 1, maxScore: 1, percentage: 100, completedAt: 1000, questionResults: [],
                    summary: { correct: 1, incorrect: 0, partialCredit: 0, totalQuestions: 1 } } as any,
                { title: 'Assigned THCS', type: 'THCS-THPT', skill: 'Mixed', duration: 45 },
                120, undefined, false, undefined, undefined, homeworkContext, undefined, undefined,
                { studentPrivateHomework: true },
            );

            const saved = getSavedResultRecord('-P2vOtvgXx1Vn6A5Ueku');
            const updates = getSaveResultUpdatePayload('-P2vOtvgXx1Vn6A5Ueku');
            expect(saved.context).toEqual(homeworkContext);
            expect(saved.visibility).toMatchObject({
                contextType: 'homework',
                ownershipResolved: false,
                visibilityOwnerTeacherId: null,
                ownerResolutionSource: 'unresolved',
                unresolvedReason: 'owner_not_resolved',
            });
            expect(saved).not.toHaveProperty('teacherId');
            expect(saved.classId).toBeNull();
            expect(saved.courseId).toBeNull();
            expect(saved.moduleId).toBeNull();
            expect(Object.keys(updates)).toEqual(['test_results_by_student/student-1/-P2vOtvgXx1Vn6A5Ueku']);
            expect(updates['test_results_by_student/student-1/-P2vOtvgXx1Vn6A5Ueku']).toMatchObject({
                resultId: '-P2vOtvgXx1Vn6A5Ueku',
            });
            expect((set as any).mock.invocationCallOrder[0]).toBeLessThan((update as any).mock.invocationCallOrder[0]);
        });
    });

    describe('getTeacherResults', () => {
        it('hydrates only true keys and never reads the retired rich index', async () => {
            const canonical = createLegacyResultRecord({ resultId: 'valid', visibility: {
                ownershipResolved: true, visibilityOwnerTeacherId: 'teacher-1', contextType: 'class_session',
            } as any });
            vi.mocked(get).mockResolvedValueOnce({ exists: () => true, val: () => ({
                valid: true, rich: { resultId: 'rich', visibilityOwnerTeacherId: 'teacher-1' },
                falseKey: false, nullKey: null,
            }) } as any).mockResolvedValueOnce({ exists: () => true, val: () => canonical } as any);
            expect(await getTeacherResults('teacher-1')).toEqual([canonical]);
            expect(vi.mocked(get).mock.calls.map(([path]) => path)).toEqual([
                'teacher_result_keys/teacher-1', 'test_results/valid',
            ]);
            expect(update).not.toHaveBeenCalled();
        });

        it('should return filtered results', async () => {
            // Mock index data
            const mockIndex = {
                'res-1': true,
                'res-2': true
            };

            (get as any).mockImplementation((refObj: any) => {
                // We can't easily distinguish refs by object identity in this simple mock
                // So we'll assume first call is index, subsequent are results
                return Promise.resolve({
                    exists: () => true,
                    val: () => mockIndex
                });
            });

            // Mock individual result fetching
            // We need to make get implementation smarter or just mock response for specific calls
            // but simplistic approach:
            const mockResult1 = { resultId: 'res-1', sessionCode: 'CLASS-A', percentage: 80, isGuest: false,
                visibility: { ownershipResolved: true, visibilityOwnerTeacherId: 'teacher-1', contextType: 'class_session' } };
            const mockResult2 = { resultId: 'res-2', sessionCode: 'CLASS-B', percentage: 40, isGuest: true };

            (get as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockIndex }) // for index
                .mockResolvedValueOnce({ exists: () => true, val: () => mockResult1 }) // for res-1
                .mockResolvedValueOnce({ exists: () => true, val: () => mockResult2 }); // for res-2

            const results = await getTeacherResults('teacher-1', { sessionCode: 'CLASS-A' });

            expect(results).toHaveLength(1);
            expect(results[0].resultId).toBe('res-1');
        });

        it('should suppress per-result permission-denied errors and keep only the skipped summary', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const mockIndex = {
                'res-1': true,
                'denied-row': true,
            };
            const visibleResult = createLegacyResultRecord({
                resultId: 'res-1',
                visibility: {
                    contextType: 'class_session',
                    sourceType: 'session',
                    sourceId: 'SESSION-1',
                    sourceNameSnapshot: 'Visible Result',
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
            });

            (get as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockIndex })
                .mockResolvedValueOnce({ exists: () => true, val: () => visibleResult })
                .mockRejectedValueOnce(new Error('Permission denied'));

            const results = await getTeacherResults('teacher-1');

            expect(results.map((result) => result.resultId)).toEqual(['res-1']);
            expect(errorSpy).not.toHaveBeenCalledWith('Error getting test result:', expect.anything());
            expect(warnSpy).toHaveBeenCalledWith(
                '[TestResults] Skipped 1 inaccessible teacher teacher-1 result(s)',
                ['denied-row']
            );

            warnSpy.mockRestore();
            errorSpy.mockRestore();
        });

        it('should exclude rows whose normalized visibility does not belong to the teacher', async () => {
            const mockIndex = {
                'res-1': true,
            };
            const hiddenResult = {
                resultId: 'res-1',
                sessionCode: 'CLASS-A',
                percentage: 80,
                isGuest: false,
                teacherId: 'teacher-1',
                visibility: {
                    contextType: 'class_session',
                    sourceType: 'session',
                    sourceId: 'CLASS-A',
                    sourceNameSnapshot: 'Class A',
                    visibilityOwnerTeacherId: 'teacher-2',
                    ownerResolutionSource: 'session.createdByUserId',
                    ownershipResolved: true,
                    unresolvedReason: null,
                    homeworkId: null,
                    sessionCode: 'CLASS-A',
                    courseId: null,
                    classId: null,
                    assignmentId: null,
                },
            };

            (get as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockIndex })
                .mockResolvedValueOnce({ exists: () => true, val: () => hiddenResult });

            const results = await getTeacherResults('teacher-1');

            expect(results).toEqual([]);
        });

        it('should exclude unresolved rows even if they appear in the teacher index', async () => {
            const mockIndex = {
                'res-1': true,
            };
            const unresolvedResult = {
                resultId: 'res-1',
                sessionCode: 'CLASS-A',
                percentage: 80,
                isGuest: false,
                visibility: {
                    contextType: 'class_session',
                    sourceType: 'session',
                    sourceId: 'CLASS-A',
                    sourceNameSnapshot: 'Class A',
                    visibilityOwnerTeacherId: null,
                    ownerResolutionSource: 'unresolved',
                    ownershipResolved: false,
                    unresolvedReason: 'owner_not_resolved',
                    homeworkId: null,
                    sessionCode: 'CLASS-A',
                    courseId: null,
                    classId: null,
                    assignmentId: null,
                },
            };

            (get as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockIndex })
                .mockResolvedValueOnce({ exists: () => true, val: () => unresolvedResult });

            const results = await getTeacherResults('teacher-1');

            expect(results).toEqual([]);
        });

        it('should exclude solo-practice rows from teacher-owned index reads', async () => {
            const mockIndex = {
                'res-1': true,
            };
            const soloPracticeResult = {
                resultId: 'res-1',
                sessionCode: 'SOLO-1',
                percentage: 80,
                isGuest: false,
                visibility: {
                    contextType: 'solo_practice',
                    sourceType: 'solo_practice',
                    sourceId: 'material-1',
                    sourceNameSnapshot: 'Solo Practice',
                    visibilityOwnerTeacherId: 'teacher-1',
                    ownerResolutionSource: 'solo_practice',
                    ownershipResolved: true,
                    unresolvedReason: null,
                    homeworkId: null,
                    sessionCode: 'SOLO-1',
                    courseId: null,
                    classId: null,
                    assignmentId: null,
                },
            };

            (get as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockIndex })
                .mockResolvedValueOnce({ exists: () => true, val: () => soloPracticeResult });

            const results = await getTeacherResults('teacher-1');

            expect(results).toEqual([]);
        });

        it.each(['class_session', 'homework', 'course_material'])('does not rewrite retained %s rows during teacher reads', async (type) => {
            const retained = createLegacyResultRecord({ resultId: 'retained', context: { type } as any });
            vi.mocked(get).mockResolvedValueOnce({ exists: () => true, val: () => ({ retained: { resultId: 'retained' } }) } as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => retained } as any);
            expect(await getTeacherResults('teacher-1')).toEqual([]);
            expect(mockResolveResultOwnership).not.toHaveBeenCalled();
            expect(update).not.toHaveBeenCalled();
        });
    });

    describe('getTeacherStudentResults', () => {
        it('returns no results and performs no reads when assignment access is denied', async () => {
            const results = await getTeacherStudentResults(
                'teacher-1',
                'student-1',
                undefined,
                { hasAssignmentAccess: false }
            );

            expect(results).toEqual([]);
            expect(get).not.toHaveBeenCalled();
            expect(mockClassifyTeacherResultVisibility).not.toHaveBeenCalled();
        });

        it('merges teacher-owned rows with only the target student solo-practice rows', async () => {
            (ref as any).mockImplementation((_: unknown, path?: string) => path ?? '__root__');
            (get as any).mockImplementation((path: string) => {
                switch (path) {
                    case 'teacher_result_keys/teacher-1':
                        return Promise.resolve({
                            exists: () => true,
                            val: () => ({
                                'teacher-row': true,
                                'other-student-row': true,
                            }),
                        });
                    case 'test_results_solo_practice_by_student/student-1':
                        return Promise.resolve({
                            exists: () => true,
                            val: () => ({
                                'solo-visible': true,
                                'solo-foreign-student': true,
                            }),
                        });
                    case 'test_results/teacher-row':
                        return Promise.resolve({
                            exists: () => true,
                            val: () => ({
                                resultId: 'teacher-row',
                                sessionCode: 'SESSION-1',
                                testId: 'TEST-1',
                                studentId: 'student-1',
                                studentName: 'Student One',
                                totalScore: 18,
                                maxScore: 20,
                                percentage: 90,
                                bandScore: 8,
                                questionResults: [],
                                correct: 18,
                                incorrect: 2,
                                partialCredit: 0,
                                totalQuestions: 20,
                                submittedAt: 1000,
                                timeElapsed: 100,
                                testDuration: 30,
                                createdAt: 1000,
                                testTitle: 'Teacher-Owned Result',
                                testType: 'test',
                                testSkill: 'reading',
                                visibility: {
                                    contextType: 'class_session',
                                    sourceType: 'session',
                                    sourceId: 'SESSION-1',
                                    sourceNameSnapshot: 'Teacher-Owned Result',
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
                            }),
                        });
                    case 'test_results/other-student-row':
                        return Promise.resolve({
                            exists: () => true,
                            val: () => ({
                                resultId: 'other-student-row',
                                sessionCode: 'SESSION-2',
                                testId: 'TEST-2',
                                studentId: 'student-2',
                                studentName: 'Student Two',
                                totalScore: 17,
                                maxScore: 20,
                                percentage: 85,
                                bandScore: 7.5,
                                questionResults: [],
                                correct: 17,
                                incorrect: 3,
                                partialCredit: 0,
                                totalQuestions: 20,
                                submittedAt: 900,
                                timeElapsed: 100,
                                testDuration: 30,
                                createdAt: 900,
                                testTitle: 'Other Student Result',
                                testType: 'test',
                                testSkill: 'reading',
                                visibility: {
                                    contextType: 'class_session',
                                    sourceType: 'session',
                                    sourceId: 'SESSION-2',
                                    sourceNameSnapshot: 'Other Student Result',
                                    visibilityOwnerTeacherId: 'teacher-1',
                                    ownerResolutionSource: 'session.createdByUserId',
                                    ownershipResolved: true,
                                    unresolvedReason: null,
                                    homeworkId: null,
                                    sessionCode: 'SESSION-2',
                                    courseId: null,
                                    classId: null,
                                    assignmentId: null,
                                },
                            }),
                        });
                    case 'test_results/solo-visible':
                        return Promise.resolve({
                            exists: () => true,
                            val: () => ({
                                resultId: 'solo-visible',
                                sessionCode: 'SOLO-1',
                                testId: 'SOLO-TEST-1',
                                studentId: 'student-1',
                                studentName: 'Student One',
                                totalScore: 12,
                                maxScore: 20,
                                percentage: 60,
                                bandScore: 6,
                                questionResults: [],
                                correct: 12,
                                incorrect: 8,
                                partialCredit: 0,
                                totalQuestions: 20,
                                submittedAt: 1100,
                                timeElapsed: 100,
                                testDuration: 30,
                                createdAt: 1100,
                                testTitle: 'Solo Visible Result',
                                testType: 'self_study',
                                testSkill: 'reading',
                                visibility: {
                                    contextType: 'solo_practice',
                                    sourceType: 'solo_practice',
                                    sourceId: 'material-1',
                                    sourceNameSnapshot: 'Solo Visible Result',
                                    visibilityOwnerTeacherId: null,
                                    ownerResolutionSource: 'solo_practice',
                                    ownershipResolved: true,
                                    unresolvedReason: null,
                                    homeworkId: null,
                                    sessionCode: 'SOLO-1',
                                    courseId: null,
                                    classId: null,
                                    assignmentId: null,
                                },
                            }),
                        });
                    case 'test_results/solo-foreign-student':
                        return Promise.resolve({
                            exists: () => true,
                            val: () => ({
                                resultId: 'solo-foreign-student',
                                sessionCode: 'SOLO-2',
                                testId: 'SOLO-TEST-2',
                                studentId: 'student-2',
                                studentName: 'Student Two',
                                totalScore: 11,
                                maxScore: 20,
                                percentage: 55,
                                bandScore: 5.5,
                                questionResults: [],
                                correct: 11,
                                incorrect: 9,
                                partialCredit: 0,
                                totalQuestions: 20,
                                submittedAt: 1200,
                                timeElapsed: 100,
                                testDuration: 30,
                                createdAt: 1200,
                                testTitle: 'Solo Foreign Result',
                                testType: 'self_study',
                                testSkill: 'reading',
                                visibility: {
                                    contextType: 'solo_practice',
                                    sourceType: 'solo_practice',
                                    sourceId: 'material-2',
                                    sourceNameSnapshot: 'Solo Foreign Result',
                                    visibilityOwnerTeacherId: null,
                                    ownerResolutionSource: 'solo_practice',
                                    ownershipResolved: true,
                                    unresolvedReason: null,
                                    homeworkId: null,
                                    sessionCode: 'SOLO-2',
                                    courseId: null,
                                    classId: null,
                                    assignmentId: null,
                                },
                            }),
                        });
                    default:
                        return Promise.resolve({ exists: () => false, val: () => null });
                }
            });
            mockClassifyTeacherResultVisibility.mockImplementation(({ result }: any) => ({
                shouldDisplayInTeacherHistory: result.resultId === 'solo-visible',
            }));

            const results = await getTeacherStudentResults(
                'teacher-1',
                'student-1',
                undefined,
                { hasAssignmentAccess: true }
            );

            expect(results.map((result) => result.resultId)).toEqual([
                'teacher-row',
                'solo-visible',
            ]);
            expect(mockClassifyTeacherResultVisibility).toHaveBeenCalledWith(
                expect.objectContaining({
                    teacherId: 'teacher-1',
                    hasAssignmentAccess: true,
                    result: expect.objectContaining({ resultId: 'solo-visible' }),
                })
            );
            expect(mockClassifyTeacherResultVisibility).not.toHaveBeenCalledWith(
                expect.objectContaining({
                    result: expect.objectContaining({ resultId: 'solo-foreign-student' }),
                })
            );

            (ref as any).mockReset();
            (get as any).mockReset();
        });

        it('keeps teacher-owned history when the solo-practice index read is denied', async () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            (ref as any).mockImplementation((_: unknown, path?: string) => path ?? '__root__');
            (get as any).mockImplementation((path: string) => {
                switch (path) {
                    case 'teacher_result_keys/teacher-1':
                        return Promise.resolve({
                            exists: () => true,
                            val: () => ({
                                'teacher-row': true,
                            }),
                        });
                    case 'test_results_solo_practice_by_student/student-1':
                        return Promise.reject(new Error('Permission denied'));
                    case 'test_results/teacher-row':
                        return Promise.resolve({
                            exists: () => true,
                            val: () => ({
                                resultId: 'teacher-row',
                                sessionCode: 'SESSION-1',
                                testId: 'TEST-1',
                                studentId: 'student-1',
                                studentName: 'Student One',
                                totalScore: 18,
                                maxScore: 20,
                                percentage: 90,
                                bandScore: 8,
                                questionResults: [],
                                correct: 18,
                                incorrect: 2,
                                partialCredit: 0,
                                totalQuestions: 20,
                                submittedAt: 1000,
                                timeElapsed: 100,
                                testDuration: 30,
                                createdAt: 1000,
                                testTitle: 'Teacher-Owned Result',
                                testType: 'test',
                                testSkill: 'reading',
                                visibility: {
                                    contextType: 'class_session',
                                    sourceType: 'session',
                                    sourceId: 'SESSION-1',
                                    sourceNameSnapshot: 'Teacher-Owned Result',
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
                            }),
                        });
                    default:
                        return Promise.resolve({ exists: () => false, val: () => null });
                }
            });

            const results = await getTeacherStudentResults(
                'teacher-1',
                'student-1',
                undefined,
                { hasAssignmentAccess: true }
            );

            expect(results.map((result) => result.resultId)).toEqual(['teacher-row']);
            expect(mockClassifyTeacherResultVisibility).not.toHaveBeenCalled();
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Solo-practice index unavailable for student student-1')
            );

            warnSpy.mockRestore();
            (ref as any).mockReset();
            (get as any).mockReset();
        });
    });

    describe('getStudentResults', () => {
        it('should keep student reads complete even for unresolved and foreign-owned rows', async () => {
            const mockIndex = {
                'owned-row': { resultId: 'owned-row' },
                'unresolved-row': { resultId: 'unresolved-row' },
            };

            (get as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockIndex })
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => ({
                        resultId: 'owned-row',
                        sessionCode: 'SESSION-1',
                        testId: 'TEST-1',
                        studentId: 'student-1',
                        studentName: 'Student Name',
                        totalScore: 8,
                        maxScore: 10,
                        percentage: 80,
                        bandScore: 7,
                        questionResults: [],
                        correct: 8,
                        incorrect: 2,
                        partialCredit: 0,
                        totalQuestions: 10,
                        submittedAt: 1000,
                        timeElapsed: 100,
                        testDuration: 30,
                        createdAt: 1000,
                        testTitle: 'Owned',
                        testType: 'test',
                        testSkill: 'reading',
                        visibility: {
                            contextType: 'class_session',
                            sourceType: 'session',
                            sourceId: 'SESSION-1',
                            sourceNameSnapshot: 'Owned',
                            visibilityOwnerTeacherId: 'teacher-2',
                            ownerResolutionSource: 'session.createdByUserId',
                            ownershipResolved: true,
                            unresolvedReason: null,
                            homeworkId: null,
                            sessionCode: 'SESSION-1',
                            courseId: null,
                            classId: null,
                            assignmentId: null,
                        },
                    }),
                })
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => ({
                        resultId: 'unresolved-row',
                        sessionCode: 'SESSION-2',
                        testId: 'TEST-2',
                        studentId: 'student-1',
                        studentName: 'Student Name',
                        totalScore: 5,
                        maxScore: 10,
                        percentage: 50,
                        bandScore: 5,
                        questionResults: [],
                        correct: 5,
                        incorrect: 5,
                        partialCredit: 0,
                        totalQuestions: 10,
                        submittedAt: 2000,
                        timeElapsed: 100,
                        testDuration: 30,
                        createdAt: 2000,
                        testTitle: 'Unresolved',
                        testType: 'test',
                        testSkill: 'reading',
                    }),
                });
            mockResolveResultOwnership.mockResolvedValueOnce({
                visibility: {
                    contextType: 'course_material',
                    sourceType: 'course',
                    sourceId: 'course-1',
                    sourceNameSnapshot: 'Unresolved',
                    visibilityOwnerTeacherId: null,
                    ownerResolutionSource: 'unresolved',
                    ownershipResolved: false,
                    unresolvedReason: 'owner_not_resolved',
                    homeworkId: null,
                    sessionCode: 'SESSION-2',
                    courseId: 'course-1',
                    classId: null,
                    assignmentId: null,
                },
                sourceLookupAttempted: true,
                strongestKnownSourceClue: 'course:course-1',
            });

            const results = await getStudentResults('student-1');

            expect(results).toHaveLength(2);
            expect(results.map((result) => result.resultId)).toEqual(['owned-row', 'unresolved-row']);
        });

        it('should skip inaccessible rows instead of failing the whole student history fetch', async () => {
            const mockIndex = {
                'owned-row': { resultId: 'owned-row' },
                'denied-row': { resultId: 'denied-row' },
            };

            (get as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockIndex })
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => ({
                        resultId: 'owned-row',
                        sessionCode: 'SESSION-1',
                        testId: 'TEST-1',
                        studentId: 'student-1',
                        studentName: 'Student Name',
                        totalScore: 8,
                        maxScore: 10,
                        percentage: 80,
                        bandScore: 7,
                        questionResults: [],
                        correct: 8,
                        incorrect: 2,
                        partialCredit: 0,
                        totalQuestions: 10,
                        submittedAt: 1000,
                        timeElapsed: 100,
                        testDuration: 30,
                        createdAt: 1000,
                        testTitle: 'Owned',
                        testType: 'test',
                        testSkill: 'reading',
                    }),
                })
                .mockRejectedValueOnce(new Error('PERMISSION_DENIED'));

            const results = await getStudentResults('student-1');

            expect(results).toHaveLength(1);
            expect(results[0].resultId).toBe('owned-row');
        });
    });

    describe('updateResultScore', () => {
        it('should update score and history', async () => {
            const mockResult = {
                resultId: 'res-1',
                totalScore: 10,
                maxScore: 20,
                percentage: 50,
                questionResults: [
                    { questionNumber: 1, score: 0, isCorrect: false }
                ],
                correct: 5,
                incorrect: 5,
                sessionCode: 'S1',
                studentId: 'stu1',
                teacherId: 'teach1',
                visibility: {
                    contextType: 'class_session',
                    sourceType: 'session',
                    sourceId: 'S1',
                    sourceNameSnapshot: 'Session',
                    visibilityOwnerTeacherId: 'teach1',
                    ownerResolutionSource: 'session.createdByUserId',
                    ownershipResolved: true,
                    unresolvedReason: null,
                    homeworkId: null,
                    sessionCode: 'S1',
                    courseId: null,
                    classId: null,
                    assignmentId: null,
                }
            };

            (get as any).mockResolvedValue({ exists: () => true, val: () => mockResult });

            await updateResultScore('res-1', 1, 1, 'Regrading', 'teacher-1');

            // Check main record update
            expect(set).not.toHaveBeenCalledWith('test_results/res-1', expect.anything());
            const updatedResult = (update as any).mock.calls[0][1];
            expect(updatedResult['questionResults/0/score']).toBe(1);
            expect(updatedResult['questionResults/0/isCorrect']).toBe(true);
            expect(updatedResult.questionResults).toBeUndefined();
            expect(updatedResult.reMarkHistory).toHaveLength(1);
            expect(updatedResult.reMarkHistory[0].remarkedBy).toBe('teacher-1');

            // Check index updates
            expect(update).toHaveBeenCalledTimes(3); // Canonical, session and student payloads
            expect(set).toHaveBeenCalledWith('teacher_result_keys/teach1/res-1', true);
        });
    });

    describe('normalized visibility reporting', () => {
        it('should not create a teacher index for unresolved rows and should report them', async () => {
            const mockPush = { key: 'result-999' };
            (push as any).mockReturnValue(mockPush);
            mockResolveResultOwnership.mockResolvedValueOnce({
                visibility: {
                    contextType: 'course_material',
                    sourceType: 'course',
                    sourceId: 'course-1',
                    sourceNameSnapshot: 'Course 1',
                    visibilityOwnerTeacherId: null,
                    ownerResolutionSource: 'unresolved',
                    ownershipResolved: false,
                    unresolvedReason: 'owner_not_resolved',
                    homeworkId: null,
                    sessionCode: 'SESSION-1',
                    courseId: 'course-1',
                    classId: null,
                    assignmentId: null,
                },
                sourceLookupAttempted: true,
                strongestKnownSourceClue: 'course:course-1',
            });

            const markingResult = {
                totalScore: 10,
                maxScore: 20,
                percentage: 50,
                completedAt: 1000,
                questionResults: [],
                summary: { correct: 5, incorrect: 5, partialCredit: 0, totalQuestions: 10 }
            } as any;

            const metadata = {
                title: 'Test',
                type: 'reading',
                skill: 'reading',
                duration: 30
            };

            await saveTestResult(
                'SESSION-1',
                'TEST-1',
                'student-1',
                'Student Name',
                markingResult,
                metadata,
                500,
                'teacher-1',
                false
            );

            expect(ref).not.toHaveBeenCalledWith(database, 'teacher_result_keys/teacher-1/result-999');
            expect(mockUpsertUnresolvedResultVisibilityReport).toHaveBeenCalledWith(
                expect.objectContaining({
                    resultId: 'result-999',
                    studentId: 'student-1',
                    strongestKnownSourceClue: 'course:course-1',
                })
            );
        });

        it('empty audited repair performs no reads or writes', async () => {
            expect(await rebuildTeacherResultIndexes({ verifiedResultIds: [] })).toMatchObject({ rebuiltCount: 0 });
            expect(get).not.toHaveBeenCalled();
            expect(update).not.toHaveBeenCalled();
            expect(mockResolveResultOwnership).not.toHaveBeenCalled();
        });
        it('admin verified current ownership rebuilds teacher, class and course indexes without changing grading', async () => {
            const stored = createLegacyResultRecord({ resultId: 'verified-row', markingStatus: 'reviewed', bandScore: 8 });
            const visibility = { ownershipResolved: true, visibilityOwnerTeacherId: 'teacher-current', contextType: 'course_material',
                sourceType: 'class', sourceId: 'class-current', classId: 'class-current', courseId: 'course-current' };
            mockResolveResultOwnership.mockResolvedValueOnce({ visibility, sourceLookupAttempted: true });
            vi.mocked(get).mockResolvedValueOnce({ exists: () => true, val: () => stored } as any);
            const plan = await rebuildTeacherResultIndexes({ verifiedResultIds: ['verified-row', 'verified-row'] });
            expect(plan).toMatchObject({ rebuiltCount: 3, rebuiltClassCount: 1, rebuiltCourseCount: 1, unresolvedCount: 0 });
            expect(plan.updates['teacher_result_keys/teacher-current/verified-row']).toBe(true);
            expect(vi.mocked(get).mock.calls.map(([path]) => path)).toEqual(['test_results/verified-row']);
            expect(update).toHaveBeenCalledWith('test_results/verified-row', { visibility });
            expect(stored.bandScore).toBe(8);
        });
        it('clears only the audited row former normalized owner when fresh source resolution fails', async () => {
            const stored = createLegacyResultRecord({ resultId: 'repair-row', visibility: {
                ownershipResolved: true, visibilityOwnerTeacherId: 'teacher-old', contextType: 'class_session',
            } as any });
            const visibility = { ownershipResolved: false, visibilityOwnerTeacherId: null, contextType: 'class_session',
                sourceType: 'session', sourceId: 'SESSION-1', ownerResolutionSource: 'unresolved' };
            mockResolveResultOwnership.mockResolvedValueOnce({ visibility, sourceLookupAttempted: true });
            vi.mocked(get).mockResolvedValueOnce({ exists: () => true, val: () => stored } as any);
            const plan = await rebuildTeacherResultIndexes({ verifiedResultIds: ['repair-row'] });
            expect(plan).toMatchObject({ rebuiltCount: 0, unresolvedCount: 1, deletedCount: 1 });
            expect(plan.updates).toEqual({ 'teacher_result_keys/teacher-old/repair-row': null });
            expect(vi.mocked(get).mock.calls.map(([path]) => path)).toEqual(['test_results/repair-row']);
        });
        it('requires the audited manifest on every retry and never clears the index before recreation', async () => {
            const stored = createLegacyResultRecord({ resultId: 'retry-row', markingStatus: 'graded', bandScore: 8,
                visibility: { ownershipResolved: true, visibilityOwnerTeacherId: 'teacher-1', contextType: 'class_session' } as any });
            const visibility = { ownershipResolved: true, visibilityOwnerTeacherId: 'teacher-1', contextType: 'class_session',
                sourceType: 'session', sourceId: 'SESSION-1', sessionCode: 'SESSION-1' };
            mockResolveResultOwnership.mockResolvedValue({ visibility, sourceLookupAttempted: true });
            vi.mocked(get).mockResolvedValueOnce({ exists: () => true, val: () => stored } as any);
            vi.mocked(update).mockImplementation(async (_path, updates) => {
                if (updates['teacher_result_keys/teacher-1/retry-row'] === true) throw new Error('Rebuild interrupted');
            });
            await expect(rebuildTeacherResultIndexes({ verifiedResultIds: ['retry-row'] })).rejects.toThrow('Rebuild interrupted');
            expect(vi.mocked(get).mock.calls.map(([path]) => path)).toEqual(['test_results/retry-row']);
            expect(vi.mocked(update).mock.calls.some(([, updates]) => Object.values(updates).includes(null))).toBe(false);
            const readCount = vi.mocked(get).mock.calls.length;
            const writeCount = vi.mocked(update).mock.calls.length;
            await expect(rebuildTeacherResultIndexes()).rejects.toThrow('Audited result-ID manifest');
            await expect(rebuildTeacherResultIndexes({ verifiedResultIds: ['../unaudited'] })).rejects.toThrow('invalid RTDB key');
            expect(get).toHaveBeenCalledTimes(readCount);
            expect(update).toHaveBeenCalledTimes(writeCount);
            expect(stored.bandScore).toBe(8);
        });
    });

    describe('getReMarkHistory', () => {
        it('should return history array', async () => {
            const mockHistory = [{ questionNumber: 1, originalScore: 0, newScore: 1 }];
            const mockResult = {
                resultId: 'res-1',
                reMarkHistory: mockHistory
            };

            (get as any).mockResolvedValue({ exists: () => true, val: () => mockResult });

            const history = await getReMarkHistory('res-1');
            expect(history).toEqual(mockHistory);
        });

        it('should return empty array if no history', async () => {
            const mockResult = { resultId: 'res-1' };
            (get as any).mockResolvedValue({ exists: () => true, val: () => mockResult });

            const history = await getReMarkHistory('res-1');
            expect(history).toEqual([]);
        });
    });

    // ============================================
    // ACADEMIC CONTEXT TESTS (PRD-0015: Phase 3)
    // ============================================

    describe('saveTestResult with Academic Context', () => {
        const mockPush = { key: 'result-123' };
        const sessionCode = 'SESSION-1';
        const testId = 'TEST-1';
        const studentId = 'student-1';
        const teacherId = 'teacher-1';

        const markingResult = {
            totalScore: 10,
            maxScore: 20,
            percentage: 50,
            completedAt: 1000,
            questionResults: [],
            summary: { correct: 5, incorrect: 5, partialCredit: 0, totalQuestions: 10 }
        } as any;

        const metadata = {
            title: 'Test',
            type: 'reading',
            skill: 'reading',
            duration: 30
        };

        beforeEach(() => {
            (push as any).mockReturnValue(mockPush);
        });

        it('should save result with academic context fields', async () => {
            const academicContext = {
                courseId: 'course-1',
                courseName: 'IELTS Preparation',
                classId: 'class-1',
                className: 'Advanced Class',
                moduleId: 'module-1',
                moduleName: 'Reading Module 1'
            };

            const resultId = await saveTestResult(
                sessionCode, testId, studentId, 'Student Name',
                markingResult, metadata, 500, teacherId, false,
                undefined, // submissionContent
                academicContext
            );

            expect(resultId).toBe('result-123');

            const savedRecord = getSavedResultRecord('result-123') as Record<string, unknown>;

            expect(savedRecord.courseId).toBe('course-1');
            expect(savedRecord.courseName).toBe('IELTS Preparation');
            expect(savedRecord.classId).toBe('class-1');
            expect(savedRecord.className).toBe('Advanced Class');
            expect(savedRecord.moduleId).toBe('module-1');
            expect(savedRecord.moduleName).toBe('Reading Module 1');
        });

        it('should create course index when courseId is provided', async () => {
            const academicContext = {
                courseId: 'course-1',
                courseName: 'IELTS Preparation',
                moduleId: 'module-1'
            };

            await saveTestResult(
                sessionCode, testId, studentId, 'Student Name',
                markingResult, metadata, 500, teacherId, false,
                undefined,
                academicContext
            );

            const updates = getSaveResultUpdatePayload();
            expect(updates[`test_results_by_course/${academicContext.courseId}/${studentId}/result-123`]).toEqual(
                expect.objectContaining({
                    resultId: 'result-123',
                    studentId,
                    moduleId: 'module-1',
                })
            );
        });

        it('should create class index when classId is provided', async () => {
            const academicContext = {
                classId: 'class-1',
                className: 'Advanced Class',
                courseId: 'course-1'
            };

            await saveTestResult(
                sessionCode, testId, studentId, 'Student Name',
                markingResult, metadata, 500, teacherId, false,
                undefined,
                academicContext
            );

            const updates = getSaveResultUpdatePayload();
            expect(updates[`test_results_by_class/${academicContext.classId}/${studentId}/result-123`]).toEqual(
                expect.objectContaining({
                    resultId: 'result-123',
                    studentId,
                    courseId: 'course-1',
                })
            );
        });

        it('should create both course and class indexes when both are provided', async () => {
            const academicContext = {
                courseId: 'course-1',
                courseName: 'IELTS Preparation',
                classId: 'class-1',
                className: 'Advanced Class',
                moduleId: 'module-1',
                moduleName: 'Reading Module 1'
            };

            await saveTestResult(
                sessionCode, testId, studentId, 'Student Name',
                markingResult, metadata, 500, teacherId, false,
                undefined,
                academicContext
            );

            const updates = getSaveResultUpdatePayload();
            expect(updates[`test_results_by_course/${academicContext.courseId}/${studentId}/result-123`]).toBeDefined();
            expect(updates[`test_results_by_class/${academicContext.classId}/${studentId}/result-123`]).toBeDefined();
        });

        it('should skip course and class indexes when ownership is unresolved', async () => {
            const academicContext = {
                courseId: 'course-1',
                classId: 'class-1',
                moduleId: 'module-1',
            };

            mockResolveResultOwnership.mockResolvedValueOnce({
                visibility: {
                    contextType: 'course_material',
                    sourceType: 'course',
                    sourceId: 'course-1',
                    sourceNameSnapshot: 'Course 1',
                    visibilityOwnerTeacherId: null,
                    ownerResolutionSource: 'unresolved',
                    ownershipResolved: false,
                    unresolvedReason: 'owner_not_resolved',
                    homeworkId: null,
                    sessionCode: 'SESSION-1',
                    courseId: 'course-1',
                    classId: 'class-1',
                    assignmentId: null,
                },
                sourceLookupAttempted: true,
                strongestKnownSourceClue: 'course:course-1',
            });

            await saveTestResult(
                sessionCode, testId, studentId, 'Student Name',
                markingResult, metadata, 500, teacherId, false,
                undefined,
                academicContext
            );

            const updates = getSaveResultUpdatePayload();
            expect(updates[`test_results_by_session/${sessionCode}/result-123`]).toBeDefined();
            expect(updates[`test_results_by_student/${studentId}/result-123`]).toBeDefined();
            expect(updates[`test_results_by_course/${academicContext.courseId}/${studentId}/result-123`]).toBeUndefined();
            expect(updates[`test_results_by_class/${academicContext.classId}/${studentId}/result-123`]).toBeUndefined();
        });

        it('should set context fields to null when not provided', async () => {
            const resultId = await saveTestResult(
                sessionCode, testId, studentId, 'Student Name',
                markingResult, metadata, 500, teacherId, false
                // No academicContext provided
            );

            expect(resultId).toBe('result-123');

            const savedRecord = getSavedResultRecord('result-123') as Record<string, unknown>;

            expect(savedRecord.courseId).toBeNull();
            expect(savedRecord.courseName).toBeNull();
            expect(savedRecord.classId).toBeNull();
            expect(savedRecord.className).toBeNull();
            expect(savedRecord.moduleId).toBeNull();
            expect(savedRecord.moduleName).toBeNull();

            const updates = getSaveResultUpdatePayload();
            expect(updates['test_results_by_course/course-1/student-1/result-123']).toBeUndefined();
            expect(updates['test_results_by_class/class-1/student-1/result-123']).toBeUndefined();
        });

        it('should handle partial context (only courseId)', async () => {
            const academicContext = {
                courseId: 'course-1'
                // Other fields not provided
            };

            await saveTestResult(
                sessionCode, testId, studentId, 'Student Name',
                markingResult, metadata, 500, teacherId, false,
                undefined,
                academicContext
            );

            const updates = getSaveResultUpdatePayload();
            const savedRecord = getSavedResultRecord('result-123') as Record<string, unknown>;

            expect(savedRecord.courseId).toBe('course-1');
            expect(savedRecord.courseName).toBeNull();
            expect(savedRecord.classId).toBeNull();

            expect(updates['test_results_by_course/course-1/student-1/result-123']).toBeDefined();
            expect(updates['test_results_by_class/class-1/student-1/result-123']).toBeUndefined();
        });

        it('should include moduleId in course index', async () => {
            const academicContext = {
                courseId: 'course-1',
                moduleId: 'module-1'
            };

            await saveTestResult(
                sessionCode, testId, studentId, 'Student Name',
                markingResult, metadata, 500, teacherId, false,
                undefined,
                academicContext
            );

            const updates = getSaveResultUpdatePayload();
            const courseIndexData = updates['test_results_by_course/course-1/student-1/result-123'] as Record<string, unknown>;
            expect(courseIndexData.moduleId).toBe('module-1');
        });

        it('should include courseId in class index', async () => {
            const academicContext = {
                courseId: 'course-1',
                classId: 'class-1'
            };

            await saveTestResult(
                sessionCode, testId, studentId, 'Student Name',
                markingResult, metadata, 500, teacherId, false,
                undefined,
                academicContext
            );

            const updates = getSaveResultUpdatePayload();
            const classIndexData = updates['test_results_by_class/class-1/student-1/result-123'] as Record<string, unknown>;
            expect(classIndexData.courseId).toBe('course-1');
        });
    });

    // ============================================
    // REVIEW FLOW TESTS (PRD-0015: Phase 7 & 8)
    // ============================================

    describe('Review Flow - markAsReviewed', () => {
        const eventId = '00000000-0000-4000-8000-000000000121';
        let result: any;
        beforeEach(() => {
            result = { resultId: 'result-test-1', studentId: 'student-1', markingStatus: 'pending-review',
                testTitle: 'Writing test', testSkill: 'writing' };
            mockGetAuthorizedTeacherResult.mockResolvedValue({ result });
            vi.mocked(update).mockResolvedValue(undefined);
        });

        it('commits review fields and event pointer before independent notice dispatch', async () => {
            await markAsReviewed('result-test-1', 'teacher-1', { eventId });
            expect(mockGetAuthorizedTeacherResult).toHaveBeenCalledWith('result-test-1', 'teacher-1');
            expect(update).toHaveBeenCalledExactlyOnceWith('__root__', {
                'test_results/result-test-1/markingStatus': 'reviewed',
                'test_results/result-test-1/reviewedAt': expect.any(Number),
                'test_results/result-test-1/reviewedBy': 'teacher-1',
                'test_results/result-test-1/updatedAt': expect.any(Number),
                'test_results/result-test-1/reviewNotificationEventId': eventId,
            });
            expect(mockNotifyCommittedEvent).toHaveBeenCalledExactlyOnceWith({ eventKind: 'result-reviewed', resultId: 'result-test-1', eventId });
            expect(mockCreateTrustedNotification).not.toHaveBeenCalled();
            expect(mockDispatchTestCompleteNotification).not.toHaveBeenCalled();
            expect(vi.mocked(update).mock.invocationCallOrder[0]).toBeLessThan(mockNotifyCommittedEvent.mock.invocationCallOrder[0]);
        });

        it('keeps the product save successful after an offline wake', async () => {
            mockNotifyCommittedEvent.mockReturnValue(new Promise(() => {}));
            await expect(markAsReviewed('result-test-1', 'teacher-1', { eventId })).resolves.toBeUndefined();
            expect(update).toHaveBeenCalledOnce();
        });

        it('replays matching reviewed event without rewriting', async () => {
            Object.assign(result, { markingStatus: 'reviewed', reviewedAt: 123, reviewedBy: 'teacher-1', reviewNotificationEventId: eventId });
            await markAsReviewed('result-test-1', 'teacher-1');
            expect(update).not.toHaveBeenCalled();
            expect(mockNotifyCommittedEvent).toHaveBeenCalledWith({ eventKind: 'result-reviewed', resultId: 'result-test-1', eventId });
            result.reviewedBy = 'other';
            await expect(markAsReviewed('result-test-1', 'teacher-1')).rejects.toThrow('Cannot mark as reviewed');
        });

        it('rejects invalid event, occupied event, nonpending and unproven result before product writes', async () => {
            await expect(markAsReviewed('result-test-1', 'teacher-1', { eventId: '../x' })).rejects.toThrow('invalid');
            result.reviewNotificationEventId = eventId;
            await expect(markAsReviewed('result-test-1', 'teacher-1', { eventId })).rejects.toThrow('conflict');
            delete result.reviewNotificationEventId;
            result.markingStatus = 'auto-marked';
            await expect(markAsReviewed('result-test-1', 'teacher-1', { eventId })).rejects.toThrow('Cannot mark as reviewed');
            mockGetAuthorizedTeacherResult.mockRejectedValue(new Error('Result authority mismatch'));
            await expect(markAsReviewed('result-test-1', 'teacher-1', { eventId })).rejects.toThrow('authority mismatch');
            expect(update).not.toHaveBeenCalled();
            expect(mockNotifyCommittedEvent).not.toHaveBeenCalled();
        });

        it('propagates a rejected atomic commit without waking delivery', async () => {
            vi.mocked(update).mockRejectedValueOnce(new Error('permission denied'));
            await expect(markAsReviewed('result-test-1', 'teacher-1', { eventId })).rejects.toThrow('permission denied');
            expect(mockNotifyCommittedEvent).not.toHaveBeenCalled();
        });
    });
    describe('Review Flow - markingStatus Assignment', () => {
        const mockPush = { key: 'result-456' };
        const sessionCode = 'SESSION-1';
        const testId = 'TEST-1';
        const studentId = 'student-1';
        const teacherId = 'teacher-1';

        const markingResult = {
            totalScore: 10,
            maxScore: 20,
            percentage: 50,
            completedAt: 1000,
            questionResults: [],
            summary: { correct: 5, incorrect: 5, partialCredit: 0, totalQuestions: 10 }
        } as any;

        const metadata = {
            title: 'Test',
            type: 'writing',
            skill: 'writing',
            duration: 30
        };

        beforeEach(() => {
            (push as any).mockReturnValue(mockPush);
            vi.clearAllMocks();
        });

        it('should set pending-review for writing submissions', async () => {
            const submissionContent = {
                writing: { text: 'Student essay here...', wordCount: 20 }
            };

            await saveTestResult(
                sessionCode, testId, studentId, 'Student Name',
                markingResult, metadata, 500, teacherId, false,
                submissionContent
            );

            const savedRecord = getSavedResultRecord('result-456') as Record<string, any>;

            expect(savedRecord.markingStatus).toBe('pending-review');
            expect(savedRecord.writingSubmission.text).toBe('Student essay here...');
        });

        it('should set pending-review for speaking submissions', async () => {
            const submissionContent = {
                speaking: { audioUrl: 'https://storage.example.com/audio.mp3', duration: 120 }
            };

            const speakingMetadata = { ...metadata, type: 'speaking', skill: 'speaking' };

            await saveTestResult(
                sessionCode, testId, studentId, 'Student Name',
                markingResult, speakingMetadata, 500, teacherId, false,
                submissionContent
            );

            const savedRecord = getSavedResultRecord('result-456') as Record<string, any>;

            expect(savedRecord.markingStatus).toBe('pending-review');
            expect(savedRecord.speakingSubmission.audioUrl).toBe('https://storage.example.com/audio.mp3');
        });

        it('should set auto-marked for reading/listening tests', async () => {
            const readingMetadata = { ...metadata, type: 'reading', skill: 'reading' };

            await saveTestResult(
                sessionCode, testId, studentId, 'Student Name',
                markingResult, readingMetadata, 500, teacherId, false
            );

            const savedRecord = getSavedResultRecord('result-456') as Record<string, any>;

            expect(savedRecord.markingStatus).toBe('auto-marked');
            expect(savedRecord.writingSubmission).toBeUndefined();
            expect(savedRecord.speakingSubmission).toBeUndefined();
        });

        it('should set pending-review if both writing and speaking exist', async () => {
            const submissionContent = {
                writing: { text: 'Essay...', wordCount: 10 },
                speaking: { audioUrl: 'https://audio.mp3', duration: 60 }
            };

            await saveTestResult(
                sessionCode, testId, studentId, 'Student Name',
                markingResult, metadata, 500, teacherId, false,
                submissionContent
            );

            const savedRecord = getSavedResultRecord('result-456') as Record<string, any>;

            expect(savedRecord.markingStatus).toBe('pending-review');
            expect(savedRecord.writingSubmission.text).toBe('Essay...');
            expect(savedRecord.speakingSubmission.audioUrl).toBe('https://audio.mp3');
        });
    });

    // ============================================
    // PRD-0039: New service function tests (Task 2.9)
    // ============================================

    describe('getStudentTestAttempts', () => {
        it('should return attempts sorted by submittedAt DESC for matching testId', async () => {
            const mockIndex = {
                'res-1': { resultId: 'res-1' },
                'res-2': { resultId: 'res-2' },
                'res-3': { resultId: 'res-3' },
            };
            const mockResults: Record<string, any> = {
                'res-1': { resultId: 'res-1', testId: 'T1', submittedAt: 1000 },
                'res-2': { resultId: 'res-2', testId: 'T1', submittedAt: 3000 },
                'res-3': { resultId: 'res-3', testId: 'T2', submittedAt: 2000 },
            };

            (get as any).mockImplementation((_refObj: any) => {
                const refCalls = (ref as any).mock.calls;
                const lastRefCall = refCalls[refCalls.length - 1];
                const path = lastRefCall?.[1] || '';
                if (path.includes('test_results_by_student')) {
                    return Promise.resolve({ exists: () => true, val: () => mockIndex });
                }
                const resultId = path.split('/').pop();
                return Promise.resolve({
                    exists: () => !!mockResults[resultId],
                    val: () => mockResults[resultId] || null,
                });
            });

            const results = await getStudentTestAttempts('student-1', 'T1');

            expect(results).toHaveLength(2);
            expect(results[0].resultId).toBe('res-2');
            expect(results[1].resultId).toBe('res-1');
        });

        it('should return empty array when no results exist', async () => {
            (get as any).mockResolvedValue({ exists: () => false, val: () => null });

            const results = await getStudentTestAttempts('student-1', 'T1');
            expect(results).toEqual([]);
        });
    });

    describe('getHistoricalScores', () => {
        it('should filter by testId for homework context', async () => {
            const anchor = {
                resultId: 'res-1',
                testId: 'T1',
                context: { type: 'homework' },
                testType: 'reading',
                testSkill: 'reading',
            } as any;

            const mockIndex = {
                'res-1': { resultId: 'res-1' },
                'res-2': { resultId: 'res-2' },
                'res-3': { resultId: 'res-3' },
            };
            const mockResults: Record<string, any> = {
                'res-1': { resultId: 'res-1', testId: 'T1', testType: 'reading', testSkill: 'reading', submittedAt: 3000, percentage: 80 },
                'res-2': { resultId: 'res-2', testId: 'T1', testType: 'reading', testSkill: 'reading', submittedAt: 1000, percentage: 60 },
                'res-3': { resultId: 'res-3', testId: 'T2', testType: 'reading', testSkill: 'reading', submittedAt: 2000, percentage: 70 },
            };

            (get as any).mockImplementation((_refObj: any) => {
                const refCalls = (ref as any).mock.calls;
                const lastRefCall = refCalls[refCalls.length - 1];
                const path = lastRefCall?.[1] || '';
                if (path.includes('test_results_by_student')) {
                    return Promise.resolve({ exists: () => true, val: () => mockIndex });
                }
                const resultId = path.split('/').pop();
                return Promise.resolve({
                    exists: () => !!mockResults[resultId],
                    val: () => mockResults[resultId] || null,
                });
            });

            const results = await getHistoricalScores('student-1', anchor, 5);

            expect(results.every((r: any) => r.testId === 'T1')).toBe(true);
            expect(results).toHaveLength(2);
        });

        it('should return at most limit records', async () => {
            const anchor = {
                resultId: 'res-1',
                testId: 'T1',
                testType: 'reading',
                testSkill: 'reading',
            } as any;

            const mockIndex: Record<string, any> = {};
            const mockResults: Record<string, any> = {};
            for (let i = 0; i < 10; i++) {
                mockIndex[`res-${i}`] = { resultId: `res-${i}` };
                mockResults[`res-${i}`] = { resultId: `res-${i}`, testId: 'T1', testType: 'reading', testSkill: 'reading', submittedAt: i * 1000, percentage: 50 + i };
            }

            (get as any).mockImplementation((_refObj: any) => {
                const refCalls = (ref as any).mock.calls;
                const lastRefCall = refCalls[refCalls.length - 1];
                const path = lastRefCall?.[1] || '';
                if (path.includes('test_results_by_student')) {
                    return Promise.resolve({ exists: () => true, val: () => mockIndex });
                }
                const resultId = path.split('/').pop();
                return Promise.resolve({
                    exists: () => !!mockResults[resultId],
                    val: () => mockResults[resultId] || null,
                });
            });

            const results = await getHistoricalScores('student-1', anchor, 5);
            expect(results.length).toBeLessThanOrEqual(5);
        });
    });

    describe('getClassTestScores', () => {
        it('should return scores filtered by testId from class index', async () => {
            const mockClassIndex = {
                'student-1': { 'res-1': { resultId: 'res-1' } },
                'student-2': { 'res-2': { resultId: 'res-2' }, 'res-3': { resultId: 'res-3' } },
            };
            const mockResults: Record<string, any> = {
                'res-1': { resultId: 'res-1', testId: 'T1', percentage: 80, studentId: 'student-1' },
                'res-2': { resultId: 'res-2', testId: 'T1', percentage: 60, studentId: 'student-2' },
                'res-3': { resultId: 'res-3', testId: 'T2', percentage: 90, studentId: 'student-2' },
            };

            (get as any).mockImplementation((_refObj: any) => {
                const refCalls = (ref as any).mock.calls;
                const lastRefCall = refCalls[refCalls.length - 1];
                const path = lastRefCall?.[1] || '';
                if (path.includes('test_results_by_class')) {
                    return Promise.resolve({ exists: () => true, val: () => mockClassIndex });
                }
                const resultId = path.split('/').pop();
                return Promise.resolve({
                    exists: () => !!mockResults[resultId],
                    val: () => mockResults[resultId] || null,
                });
            });

            const results = await getClassTestScores('T1', 'class-1');

            expect(results).toHaveLength(2);
            expect(results.every((r: any) => r.testId === 'T1')).toBe(true);
        });

        it('should return empty array when classId is missing', async () => {
            const results = await getClassTestScores('T1', '');
            expect(results).toEqual([]);
        });

        it('should return empty array when no class index exists', async () => {
            (get as any).mockResolvedValue({ exists: () => false, val: () => null });

            const results = await getClassTestScores('T1', 'class-1');
            expect(results).toEqual([]);
        });
    });

    describe('saveTestResult with ieltsData', () => {
        it('should include ieltsData in saved record when provided', async () => {
            const mockPush = { key: 'result-789' };
            (push as any).mockReturnValue(mockPush);

            const markingResult = {
                totalScore: 30,
                maxScore: 40,
                percentage: 75,
                completedAt: 1000,
                questionResults: [],
                summary: { correct: 30, incorrect: 10, partialCredit: 0, totalQuestions: 40 }
            } as any;

            const metadata = {
                title: 'IELTS Reading Test',
                type: 'ielts_reading',
                skill: 'reading',
                duration: 60
            };

            const ieltsData = {
                passageResults: [
                    { passageName: 'Passage 1', questionRange: [1, 13] as [number, number], correct: 10, total: 13, percentage: 76.9 },
                    { passageName: 'Passage 2', questionRange: [14, 26] as [number, number], correct: 11, total: 13, percentage: 84.6 },
                    { passageName: 'Passage 3', questionRange: [27, 40] as [number, number], correct: 9, total: 14, percentage: 64.3 },
                ]
            };

            await saveTestResult(
                'SESSION-IELTS', 'TEST-IELTS', 'student-1', 'Student Name',
                markingResult, metadata, 3000, 'teacher-1', false,
                undefined,
                undefined,
                undefined,
                undefined,
                ieltsData
            );

            const savedRecord = getSavedResultRecord('result-789') as Record<string, any>;

            expect(savedRecord.ieltsData).toBeDefined();
            expect(savedRecord.ieltsData.passageResults).toHaveLength(3);
            expect(savedRecord.ieltsData.passageResults[0].passageName).toBe('Passage 1');
        });

        it('should not include ieltsData when not provided', async () => {
            const mockPush = { key: 'result-790' };
            (push as any).mockReturnValue(mockPush);

            const markingResult = {
                totalScore: 10,
                maxScore: 20,
                percentage: 50,
                completedAt: 1000,
                questionResults: [],
                summary: { correct: 5, incorrect: 5, partialCredit: 0, totalQuestions: 10 }
            } as any;

            const metadata = {
                title: 'Test',
                type: 'reading',
                skill: 'reading',
                duration: 30
            };

            await saveTestResult(
                'SESSION-1', 'TEST-1', 'student-1', 'Student Name',
                markingResult, metadata, 500, 'teacher-1', false
            );

            const savedRecord = getSavedResultRecord('result-790') as Record<string, any>;

            expect(savedRecord.ieltsData).toBeUndefined();
        });
    });
});
