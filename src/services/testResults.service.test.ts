
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    saveTestResult,
    getTeacherResults,
    getTeacherStudentResults,
    getStudentResults,
    rebuildTeacherResultIndexes,
    updateResultScore,
    getReMarkHistory,
    markAsReviewed,
    getStudentTestAttempts,
    getHistoricalScores,
    getClassTestScores,
    TestResultRecord
} from './testResults.service';
// @ts-ignore
import { database } from './firebase';
import { ref, set, get, push, update } from 'firebase/database';

const {
    mockCreateNotification,
    mockSendReviewedNotification,
    mockResolveResultOwnership,
    mockClassifyTeacherResultVisibility,
    mockClearUnresolvedResultVisibilityReport,
    mockUpsertUnresolvedResultVisibilityReport,
    mockTriggerFormativeFeedbackForSavedResult,
} = vi.hoisted(() => ({
    mockCreateNotification: vi.fn(),
    mockSendReviewedNotification: vi.fn(),
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
    update: vi.fn()
}));

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

vi.mock('./notificationService', () => ({
    createNotification: mockCreateNotification,
    sendReviewedNotification: mockSendReviewedNotification,
}));

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
    const updateCalls = (update as any).mock.calls;
    const rootUpdateCall = updateCalls.find(
        (call: any[]) => {
            const payload = call[1];
            if (!payload || typeof payload !== 'object') {
                return false;
            }

            return Object.keys(payload).some(
                (key) => key === `test_results/${resultId}` || key.startsWith('test_results/')
            );
        }
    ) ?? updateCalls[updateCalls.length - 1];

    if (!rootUpdateCall) {
        throw new Error('Expected saveTestResult to write a root update payload');
    }

    return rootUpdateCall[1];
}

describe('testResults.service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (ref as any).mockImplementation((_database: unknown, path?: string) => path ?? '__root__');
        mockCreateNotification.mockResolvedValue(undefined);
        mockSendReviewedNotification.mockResolvedValue(undefined);
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

    describe('saveTestResult', () => {
        it('should save result and create teacher index', async () => {
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

            const updates = getSaveResultUpdatePayload('result-solo-1');
            expect(updates['test_results/result-123']).toEqual(
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
            expect(updates[`test_results_by_teacher/${teacherId}/${resultId}`]).toEqual(
                expect.objectContaining({
                    resultId,
                    studentId,
                    sessionCode,
                })
            );
            expect(mockClearUnresolvedResultVisibilityReport).toHaveBeenCalledWith('result-123');
            expect(mockCreateNotification).toHaveBeenCalledWith(
                expect.objectContaining({
                    userId: studentId,
                    link: '/result/result-123',
                    metadata: expect.objectContaining({
                        resultId: 'result-123',
                    }),
                })
            );
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
            expect(updates['test_results/result-ielts-1']).toEqual(
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

            expect(mockTriggerFormativeFeedbackForSavedResult).toHaveBeenCalledWith(
                'result-ielts-1',
                { triggerSource: 'saveTestResult' },
            );
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
            expect(updates['test_results/result-writing-1']).toEqual(
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
            expect(updates['test_results_by_teacher/teacher-1/result-solo-1']).toBeUndefined();
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
            expect(updates['test_results/result-123']).toBeDefined();
            expect(updates['test_results_by_session/SESSION-1/result-123']).toEqual(
                expect.objectContaining({ resultId: 'result-123', studentId: 'student-1' })
            );
            expect(updates['test_results_by_student/student-1/result-123']).toEqual(
                expect.objectContaining({ resultId: 'result-123', sessionCode: 'SESSION-1' })
            );
            expect(updates['test_results_by_teacher/teacher-1/result-123']).toBeUndefined();
        });
    });

    describe('getTeacherResults', () => {
        it('should return filtered results', async () => {
            // Mock index data
            const mockIndex = {
                'res-1': { resultId: 'res-1' },
                'res-2': { resultId: 'res-2' }
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
            const mockResult1 = { resultId: 'res-1', sessionCode: 'CLASS-A', percentage: 80, isGuest: false };
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
                'res-1': { resultId: 'res-1' },
                'denied-row': { resultId: 'denied-row' },
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
                'res-1': { resultId: 'res-1' },
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
                'res-1': { resultId: 'res-1' },
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
                'res-1': { resultId: 'res-1' },
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

        it('should enrich a legacy row before excluding it from teacher results', async () => {
            const mockIndex = {
                'legacy-row': { resultId: 'legacy-row' },
            };
            mockResolveResultOwnership.mockResolvedValueOnce({
                visibility: {
                    contextType: 'class_session',
                    sourceType: 'session',
                    sourceId: 'CLASS-A',
                    sourceNameSnapshot: 'Legacy Session',
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
                sourceLookupAttempted: true,
                strongestKnownSourceClue: 'session:CLASS-A',
            });

            (get as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockIndex })
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => ({
                        resultId: 'legacy-row',
                        sessionCode: 'CLASS-A',
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
                        testTitle: 'Legacy Session',
                        testType: 'test',
                        testSkill: 'reading',
                    }),
                });

            const results = await getTeacherResults('teacher-1');

            expect(results).toEqual([]);
            expect(mockResolveResultOwnership).toHaveBeenCalled();
            const enrichmentUpdateCall = (update as any).mock.calls.find((call: any[]) =>
                call[1]?.visibility?.visibilityOwnerTeacherId === 'teacher-2'
            );
            expect(enrichmentUpdateCall).toBeDefined();
        });

        it('should normalize teacher-owned session visibility during the read path', async () => {
            const mockIndex = {
                'session-row': { resultId: 'session-row' },
            };
            const resolvedVisibility = {
                contextType: 'class_session',
                sourceType: 'session',
                sourceId: 'SESSION-SESSION',
                sourceNameSnapshot: 'Live Session',
                visibilityOwnerTeacherId: 'teacher-1',
                ownerResolutionSource: 'session.createdByUserId',
                ownershipResolved: true,
                unresolvedReason: null,
                homeworkId: null,
                sessionCode: 'SESSION-SESSION',
                courseId: null,
                classId: null,
                assignmentId: null,
            };
            mockResolveResultOwnership.mockResolvedValueOnce({
                visibility: resolvedVisibility,
                sourceLookupAttempted: true,
                strongestKnownSourceClue: 'session:SESSION-SESSION',
            });

            (get as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockIndex })
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => createLegacyResultRecord({
                        resultId: 'session-row',
                        sessionCode: 'SESSION-SESSION',
                        testTitle: 'Live Session',
                    }),
                });

            const results = await getTeacherResults('teacher-1');

            expect(results).toHaveLength(1);
            expect(results[0].resultId).toBe('session-row');
            expect(mockResolveResultOwnership).toHaveBeenCalledWith(expect.objectContaining({
                contextType: 'class_session',
                sessionCode: 'SESSION-SESSION',
                homeworkId: null,
                classId: null,
                courseId: null,
                sourceNameSnapshot: 'Live Session',
            }));
            expect((update as any).mock.calls.some((call: any[]) =>
                call[1]?.visibility?.visibilityOwnerTeacherId === 'teacher-1'
                && call[1]?.visibility?.sourceId === 'SESSION-SESSION'
            )).toBe(true);
        });

        it('should normalize teacher-owned homework visibility during the read path', async () => {
            const mockIndex = {
                'homework-row': { resultId: 'homework-row' },
            };
            const resolvedVisibility = {
                contextType: 'homework',
                sourceType: 'homework',
                sourceId: 'hw-1',
                sourceNameSnapshot: 'Homework Pack',
                visibilityOwnerTeacherId: 'teacher-1',
                ownerResolutionSource: 'homework.createdBy',
                ownershipResolved: true,
                unresolvedReason: null,
                homeworkId: 'hw-1',
                sessionCode: 'HOMEWORK-SESSION',
                courseId: null,
                classId: null,
                assignmentId: 'assignment-1',
            };
            mockResolveResultOwnership.mockResolvedValueOnce({
                visibility: resolvedVisibility,
                sourceLookupAttempted: true,
                strongestKnownSourceClue: 'homework:hw-1',
            });

            (get as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockIndex })
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => createLegacyResultRecord({
                        resultId: 'homework-row',
                        sessionCode: 'HOMEWORK-SESSION',
                        testTitle: 'Homework Submission',
                        context: {
                            type: 'homework',
                            source: {
                                type: 'homework',
                                id: 'material-1',
                                name: 'Homework Pack',
                            },
                            assignment: {
                                homeworkId: 'hw-1',
                                assignmentId: 'assignment-1',
                            },
                            configApplied: {},
                        } as any,
                    }),
                });

            const results = await getTeacherResults('teacher-1');

            expect(results).toHaveLength(1);
            expect(results[0].visibility).toEqual(resolvedVisibility);
            expect(mockResolveResultOwnership).toHaveBeenCalledWith(expect.objectContaining({
                contextType: 'homework',
                homeworkId: 'hw-1',
                sessionCode: 'HOMEWORK-SESSION',
                sourceNameSnapshot: 'Homework Pack',
            }));
        });

        it('should normalize class-linked course material visibility during the read path', async () => {
            const mockIndex = {
                'class-material-row': { resultId: 'class-material-row' },
            };
            const resolvedVisibility = {
                contextType: 'course_material',
                sourceType: 'class',
                sourceId: 'class-1',
                sourceNameSnapshot: 'Class Library Material',
                visibilityOwnerTeacherId: 'teacher-1',
                ownerResolutionSource: 'class.createdBy',
                ownershipResolved: true,
                unresolvedReason: null,
                homeworkId: null,
                sessionCode: 'CLASS-MATERIAL-SESSION',
                courseId: 'course-1',
                classId: 'class-1',
                assignmentId: null,
            };
            mockResolveResultOwnership.mockResolvedValueOnce({
                visibility: resolvedVisibility,
                sourceLookupAttempted: true,
                strongestKnownSourceClue: 'class:class-1',
            });

            (get as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockIndex })
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => createLegacyResultRecord({
                        resultId: 'class-material-row',
                        sessionCode: 'CLASS-MATERIAL-SESSION',
                        testTitle: 'Class Library Material',
                        classId: 'class-1',
                        courseId: 'course-1',
                        context: {
                            type: 'course_material',
                            source: {
                                type: 'library',
                                id: 'material-1',
                                name: 'Class Library Material',
                                classId: 'class-1',
                                courseId: 'course-1',
                            },
                            classId: 'class-1',
                            courseId: 'course-1',
                            configApplied: {},
                        } as any,
                    }),
                });

            const results = await getTeacherResults('teacher-1');

            expect(results).toHaveLength(1);
            expect(results[0].visibility).toEqual(resolvedVisibility);
            expect(mockResolveResultOwnership).toHaveBeenCalledWith(expect.objectContaining({
                contextType: 'course_material',
                classId: 'class-1',
                courseId: 'course-1',
                sessionCode: 'CLASS-MATERIAL-SESSION',
                sourceNameSnapshot: 'Class Library Material',
            }));
        });

        it('should normalize standalone course material visibility during the read path', async () => {
            const mockIndex = {
                'course-material-row': { resultId: 'course-material-row' },
            };
            const resolvedVisibility = {
                contextType: 'course_material',
                sourceType: 'course',
                sourceId: 'course-9',
                sourceNameSnapshot: 'Standalone Library Material',
                visibilityOwnerTeacherId: 'teacher-1',
                ownerResolutionSource: 'course.ownerId',
                ownershipResolved: true,
                unresolvedReason: null,
                homeworkId: null,
                sessionCode: 'COURSE-MATERIAL-SESSION',
                courseId: 'course-9',
                classId: null,
                assignmentId: null,
            };
            mockResolveResultOwnership.mockResolvedValueOnce({
                visibility: resolvedVisibility,
                sourceLookupAttempted: true,
                strongestKnownSourceClue: 'course:course-9',
            });

            (get as any)
                .mockResolvedValueOnce({ exists: () => true, val: () => mockIndex })
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => createLegacyResultRecord({
                        resultId: 'course-material-row',
                        sessionCode: 'COURSE-MATERIAL-SESSION',
                        testTitle: 'Standalone Library Material',
                        courseId: 'course-9',
                        context: {
                            type: 'course_material',
                            source: {
                                type: 'library',
                                id: 'material-9',
                                name: 'Standalone Library Material',
                                courseId: 'course-9',
                            },
                            courseId: 'course-9',
                            configApplied: {},
                        } as any,
                    }),
                });

            const results = await getTeacherResults('teacher-1');

            expect(results).toHaveLength(1);
            expect(results[0].visibility).toEqual(resolvedVisibility);
            expect(mockResolveResultOwnership).toHaveBeenCalledWith(expect.objectContaining({
                contextType: 'course_material',
                classId: null,
                courseId: 'course-9',
                sessionCode: 'COURSE-MATERIAL-SESSION',
                sourceNameSnapshot: 'Standalone Library Material',
            }));
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
                    case 'test_results_by_teacher/teacher-1':
                        return Promise.resolve({
                            exists: () => true,
                            val: () => ({
                                'teacher-row': { resultId: 'teacher-row' },
                                'other-student-row': { resultId: 'other-student-row' },
                            }),
                        });
                    case 'test_results_solo_practice_by_student/student-1':
                        return Promise.resolve({
                            exists: () => true,
                            val: () => ({
                                'solo-visible': { resultId: 'solo-visible' },
                                'solo-foreign-student': { resultId: 'solo-foreign-student' },
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
                    case 'test_results_by_teacher/teacher-1':
                        return Promise.resolve({
                            exists: () => true,
                            val: () => ({
                                'teacher-row': { resultId: 'teacher-row' },
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
            expect(set).toHaveBeenCalled();
            const updatedResult = (set as any).mock.calls[0][1];
            expect(updatedResult.questionResults[0].score).toBe(1);
            expect(updatedResult.questionResults[0].isCorrect).toBe(true);
            expect(updatedResult.reMarkHistory).toHaveLength(1);
            expect(updatedResult.reMarkHistory[0].remarkedBy).toBe('teacher-1');

            // Check index updates
            expect(update).toHaveBeenCalledTimes(3); // Session, Student, Teacher indexes
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

            expect(ref).not.toHaveBeenCalledWith(database, 'test_results_by_teacher/teacher-1/result-999');
            expect(mockUpsertUnresolvedResultVisibilityReport).toHaveBeenCalledWith(
                expect.objectContaining({
                    resultId: 'result-999',
                    studentId: 'student-1',
                    strongestKnownSourceClue: 'course:course-1',
                })
            );
        });

        it('should re-resolve unresolved homework visibility during index rebuild', async () => {
            const resolvedVisibility = {
                contextType: 'homework',
                sourceType: 'homework',
                sourceId: 'hw-1',
                sourceNameSnapshot: 'Listening Homework',
                visibilityOwnerTeacherId: 'teacher-1',
                ownerResolutionSource: 'homework.createdBy',
                ownershipResolved: true,
                unresolvedReason: null,
                homeworkId: 'hw-1',
                sessionCode: 'HOMEWORK-SESSION',
                courseId: null,
                classId: null,
                assignmentId: null,
            };
            mockResolveResultOwnership.mockResolvedValueOnce({
                visibility: resolvedVisibility,
                sourceLookupAttempted: true,
                strongestKnownSourceClue: 'homework:hw-1',
            });

            (get as any)
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => ({
                        'result-homework-bad': createLegacyResultRecord({
                            resultId: 'result-homework-bad',
                            sessionCode: 'HOMEWORK-SESSION',
                            testTitle: 'Listening Homework',
                            context: {
                                type: 'homework',
                                source: {
                                    type: 'homework',
                                    id: 'hw-1',
                                    name: 'Listening Homework',
                                    submissionId: 'hw-1_student-1_123',
                                },
                                assignment: {
                                    homeworkId: 'hw-1',
                                },
                                configApplied: {},
                            } as any,
                            visibility: {
                                contextType: 'homework',
                                sourceType: 'writing_submission',
                                sourceId: 'hw-1_student-1_123',
                                sourceNameSnapshot: 'Listening Homework',
                                visibilityOwnerTeacherId: null,
                                ownerResolutionSource: 'unresolved',
                                ownershipResolved: false,
                                unresolvedReason: 'writing_submission_not_found',
                                homeworkId: 'hw-1',
                                sessionCode: 'HOMEWORK-SESSION',
                                courseId: null,
                                classId: null,
                                assignmentId: null,
                                sourceDeleted: true,
                            },
                            isGuest: false,
                        }),
                    }),
                })
                .mockResolvedValueOnce({ exists: () => false, val: () => null })
                .mockResolvedValueOnce({ exists: () => false, val: () => null })
                .mockResolvedValueOnce({ exists: () => false, val: () => null })
                .mockResolvedValueOnce({ exists: () => false, val: () => null });

            const summary = await rebuildTeacherResultIndexes();

            expect(summary).toMatchObject({
                rebuiltCount: 1,
                unresolvedCount: 0,
            });
            expect(mockResolveResultOwnership).toHaveBeenCalledWith(expect.objectContaining({
                contextType: 'homework',
                homeworkId: 'hw-1',
                sourceNameSnapshot: 'Listening Homework',
            }));
            expect((update as any).mock.calls.some((call: any[]) =>
                call[1]?.visibility?.visibilityOwnerTeacherId === 'teacher-1'
                && call[1]?.visibility?.sourceType === 'homework'
            )).toBe(true);
            expect((update as any).mock.calls.some((call: any[]) =>
                call[1]?.['test_results_by_teacher/teacher-1/result-homework-bad']
            )).toBe(true);
        });

        it('should rebuild teacher indexes from normalized visibility and delete stale rows', async () => {
            (get as any)
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => ({
                        'result-1': {
                            resultId: 'result-1',
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
                            testTitle: 'Teacher Owned',
                            testType: 'test',
                            testSkill: 'reading',
                            visibility: {
                                contextType: 'class_session',
                                sourceType: 'session',
                                sourceId: 'SESSION-1',
                                sourceNameSnapshot: 'Teacher Owned',
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
                            isGuest: false,
                        },
                        'result-2': {
                            resultId: 'result-2',
                            sessionCode: 'SESSION-2',
                            testId: 'TEST-2',
                            studentId: 'student-2',
                            studentName: 'Solo Student',
                            totalScore: 7,
                            maxScore: 10,
                            percentage: 70,
                            bandScore: 6.5,
                            questionResults: [],
                            correct: 7,
                            incorrect: 3,
                            partialCredit: 0,
                            totalQuestions: 10,
                            submittedAt: 2000,
                            timeElapsed: 100,
                            testDuration: 30,
                            createdAt: 2000,
                            testTitle: 'Solo Practice',
                            testType: 'test',
                            testSkill: 'reading',
                            visibility: {
                                contextType: 'solo_practice',
                                sourceType: 'solo_practice',
                                sourceId: 'solo-2',
                                sourceNameSnapshot: 'Solo Practice',
                                visibilityOwnerTeacherId: null,
                                ownerResolutionSource: 'solo_practice',
                                ownershipResolved: true,
                                unresolvedReason: null,
                                homeworkId: null,
                                sessionCode: 'SESSION-2',
                                courseId: null,
                                classId: null,
                                assignmentId: null,
                            },
                            isGuest: false,
                        },
                    }),
                })
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => ({
                        'legacy-teacher': {
                            'result-1': { resultId: 'result-1' },
                            'result-2': { resultId: 'result-2' },
                        },
                    }),
                })
                .mockResolvedValueOnce({
                    exists: () => false,
                    val: () => null,
                })
                .mockResolvedValueOnce({
                    exists: () => false,
                    val: () => null,
                });

            const summary = await rebuildTeacherResultIndexes();

            expect(summary).toMatchObject({
                rebuiltCount: 1,
                deletedCount: 2,
                unresolvedCount: 0,
                rebuiltCourseCount: 0,
                rebuiltClassCount: 0,
            });
            const rootUpdateCall = (update as any).mock.calls.find((call: any[]) =>
                call[0] === '__root__' || call[0] === undefined || call[0] === null || call[0] === ''
            ) ?? (update as any).mock.calls[(update as any).mock.calls.length - 1];
            expect(rootUpdateCall[1]).toEqual(
                expect.objectContaining({
                    'test_results_by_teacher/legacy-teacher/result-1': null,
                    'test_results_by_teacher/legacy-teacher/result-2': null,
                    'test_results_by_teacher/teacher-2/result-1': expect.objectContaining({
                        resultId: 'result-1',
                        studentId: 'student-1',
                    }),
                })
            );
            expect(rootUpdateCall[1]['test_results_by_teacher/teacher-2/result-2']).toBeUndefined();
        });

        it('should repair stale class and course indexes from canonical visibility only', async () => {
            (get as any)
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => ({
                        'result-7': {
                            resultId: 'result-7',
                            sessionCode: 'SESSION-7',
                            testId: 'TEST-7',
                            studentId: 'student-7',
                            studentName: 'Student Seven',
                            totalScore: 9,
                            maxScore: 10,
                            percentage: 90,
                            bandScore: 7.5,
                            questionResults: [],
                            correct: 9,
                            incorrect: 1,
                            partialCredit: 0,
                            totalQuestions: 10,
                            submittedAt: 7000,
                            timeElapsed: 100,
                            testDuration: 30,
                            createdAt: 7000,
                            testTitle: 'Course Material',
                            testType: 'test',
                            testSkill: 'reading',
                            moduleId: 'module-7',
                            courseId: 'course-root',
                            classId: 'class-root',
                            visibility: {
                                contextType: 'course_material',
                                sourceType: 'course_material',
                                sourceId: 'material-7',
                                sourceNameSnapshot: 'Course Material',
                                visibilityOwnerTeacherId: 'teacher-7',
                                ownerResolutionSource: 'class.createdBy',
                                ownershipResolved: true,
                                unresolvedReason: null,
                                homeworkId: null,
                                sessionCode: 'SESSION-7',
                                courseId: 'course-7',
                                classId: 'class-7',
                                assignmentId: null,
                            },
                            isGuest: false,
                        },
                        'result-8': {
                            resultId: 'result-8',
                            sessionCode: 'SESSION-8',
                            testId: 'TEST-8',
                            studentId: 'student-8',
                            studentName: 'Student Eight',
                            totalScore: 5,
                            maxScore: 10,
                            percentage: 50,
                            bandScore: 5.5,
                            questionResults: [],
                            correct: 5,
                            incorrect: 5,
                            partialCredit: 0,
                            totalQuestions: 10,
                            submittedAt: 8000,
                            timeElapsed: 100,
                            testDuration: 30,
                            createdAt: 8000,
                            testTitle: 'Unresolved Result',
                            testType: 'test',
                            testSkill: 'reading',
                            courseId: 'course-8',
                            classId: 'class-8',
                            visibility: {
                                contextType: 'class_session',
                                sourceType: 'session',
                                sourceId: 'SESSION-8',
                                sourceNameSnapshot: 'Unresolved Result',
                                visibilityOwnerTeacherId: null,
                                ownerResolutionSource: 'unresolved',
                                ownershipResolved: false,
                                unresolvedReason: 'owner_not_resolved',
                                homeworkId: null,
                                sessionCode: 'SESSION-8',
                                courseId: 'course-8',
                                classId: 'class-8',
                                assignmentId: null,
                            },
                            isGuest: false,
                        },
                    }),
                })
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => ({
                        'teacher-7': {
                            'result-7': { resultId: 'result-7' },
                        },
                    }),
                })
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => ({
                        'course-root': {
                            'student-7': {
                                'result-7': { resultId: 'result-7' },
                            },
                        },
                        'course-7': {
                            'legacy-student': {
                                'result-7': { resultId: 'result-7' },
                            },
                        },
                        'course-8': {
                            'student-8': {
                                'result-8': { resultId: 'result-8' },
                            },
                        },
                    }),
                })
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => ({
                        'class-root': {
                            'student-7': {
                                'result-7': { resultId: 'result-7' },
                            },
                        },
                        'class-8': {
                            'student-8': {
                                'result-8': { resultId: 'result-8' },
                            },
                        },
                    }),
                });
            mockResolveResultOwnership.mockResolvedValueOnce({
                visibility: {
                    contextType: 'class_session',
                    sourceType: 'session',
                    sourceId: 'SESSION-8',
                    sourceNameSnapshot: 'Unresolved Result',
                    visibilityOwnerTeacherId: null,
                    ownerResolutionSource: 'unresolved',
                    ownershipResolved: false,
                    unresolvedReason: 'owner_not_resolved',
                    homeworkId: null,
                    sessionCode: 'SESSION-8',
                    courseId: 'course-8',
                    classId: 'class-8',
                    assignmentId: null,
                },
                sourceLookupAttempted: true,
                strongestKnownSourceClue: 'session:SESSION-8',
            });

            const summary = await rebuildTeacherResultIndexes();

            expect(summary).toMatchObject({
                rebuiltCount: 2,
                deletedCount: 5,
                unresolvedCount: 1,
                rebuiltCourseCount: 1,
                deletedCourseCount: 3,
                rebuiltClassCount: 1,
                deletedClassCount: 2,
            });
            const rootUpdateCall = (update as any).mock.calls.find((call: any[]) =>
                call[0] === '__root__' || call[0] === undefined || call[0] === null || call[0] === ''
            ) ?? (update as any).mock.calls[(update as any).mock.calls.length - 1];
            expect(rootUpdateCall[1]).toEqual(
                expect.objectContaining({
                    'test_results_by_course/course-root/student-7/result-7': null,
                    'test_results_by_course/course-7/legacy-student/result-7': null,
                    'test_results_by_class/class-root/student-7/result-7': null,
                    'test_results_by_course/course-8/student-8/result-8': null,
                    'test_results_by_class/class-8/student-8/result-8': null,
                    'test_results_by_course/course-7/student-7/result-7': expect.objectContaining({
                        resultId: 'result-7',
                        moduleId: 'module-7',
                    }),
                    'test_results_by_class/class-7/student-7/result-7': expect.objectContaining({
                        resultId: 'result-7',
                        courseId: 'course-7',
                    }),
                })
            );
        });

        it('should re-resolve unresolved homework visibility during index rebuild', async () => {
            (get as any)
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => ({
                        'result-homework-bad': {
                            resultId: 'result-homework-bad',
                            sessionCode: 'SESSION-HW',
                            testId: 'TEST-HW',
                            studentId: 'student-1',
                            studentName: 'Student One',
                            totalScore: 8,
                            maxScore: 10,
                            percentage: 80,
                            bandScore: 7,
                            questionResults: [],
                            correct: 8,
                            incorrect: 2,
                            partialCredit: 0,
                            totalQuestions: 10,
                            submittedAt: 9000,
                            timeElapsed: 100,
                            testDuration: 30,
                            createdAt: 9000,
                            testTitle: 'Listening Homework',
                            testType: 'test',
                            testSkill: 'listening',
                            context: {
                                type: 'homework',
                                source: {
                                    type: 'homework',
                                    id: 'hw-1',
                                    name: 'Listening Homework',
                                    submissionId: 'hw-1_student-1_9000',
                                },
                                assignment: {
                                    homeworkId: 'hw-1',
                                    attemptNumber: 1,
                                },
                            },
                            visibility: {
                                contextType: 'homework',
                                sourceType: 'writing_submission',
                                sourceId: 'hw-1_student-1_9000',
                                sourceNameSnapshot: 'Listening Homework',
                                visibilityOwnerTeacherId: null,
                                ownerResolutionSource: 'unresolved',
                                ownershipResolved: false,
                                unresolvedReason: 'writing_submission_not_found',
                                homeworkId: 'hw-1',
                                sessionCode: 'SESSION-HW',
                                courseId: null,
                                classId: null,
                                assignmentId: null,
                                sourceDeleted: true,
                            },
                            isGuest: false,
                        },
                    }),
                })
                .mockResolvedValueOnce({
                    exists: () => false,
                    val: () => null,
                })
                .mockResolvedValueOnce({
                    exists: () => false,
                    val: () => null,
                })
                .mockResolvedValueOnce({
                    exists: () => false,
                    val: () => null,
                })
                .mockResolvedValueOnce({
                    exists: () => false,
                    val: () => null,
                });
            mockResolveResultOwnership.mockResolvedValueOnce({
                visibility: {
                    contextType: 'homework',
                    sourceType: 'homework',
                    sourceId: 'hw-1',
                    sourceNameSnapshot: 'Listening Homework',
                    visibilityOwnerTeacherId: 'teacher-1',
                    ownerResolutionSource: 'homework.createdBy',
                    ownershipResolved: true,
                    unresolvedReason: null,
                    homeworkId: 'hw-1',
                    sessionCode: 'SESSION-HW',
                    courseId: null,
                    classId: null,
                    assignmentId: null,
                },
                sourceLookupAttempted: true,
                strongestKnownSourceClue: 'homework:hw-1',
            });

            const summary = await rebuildTeacherResultIndexes();

            expect(summary).toMatchObject({
                rebuiltCount: 1,
                deletedCount: 0,
                unresolvedCount: 0,
            });
            expect(mockResolveResultOwnership).toHaveBeenCalledWith(
                expect.objectContaining({
                    result: expect.objectContaining({
                        resultId: 'result-homework-bad',
                    }),
                })
            );
            expect(update).toHaveBeenCalledWith(
                'test_results/result-homework-bad',
                expect.objectContaining({
                    visibility: expect.objectContaining({
                        sourceType: 'homework',
                        sourceId: 'hw-1',
                        visibilityOwnerTeacherId: 'teacher-1',
                        ownershipResolved: true,
                    }),
                })
            );
            const rootUpdateCall = (update as any).mock.calls.find((call: any[]) =>
                call[0] === '__root__' || call[0] === undefined || call[0] === null || call[0] === ''
            ) ?? (update as any).mock.calls[(update as any).mock.calls.length - 1];
            expect(rootUpdateCall[1]).toEqual(
                expect.objectContaining({
                    'test_results_by_teacher/teacher-1/result-homework-bad': expect.objectContaining({
                        resultId: 'result-homework-bad',
                        studentId: 'student-1',
                    }),
                })
            );
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

            const savedRecord = getSaveResultUpdatePayload()['test_results/result-123'] as Record<string, unknown>;

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

            const savedRecord = getSaveResultUpdatePayload()['test_results/result-123'] as Record<string, unknown>;

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
            const savedRecord = updates['test_results/result-123'] as Record<string, unknown>;

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
        const mockResult: TestResultRecord = {
            resultId: 'result-test-1',
            sessionCode: 'SESSION-1',
            testId: 'test-1',
            studentId: 'student-1',
            studentName: 'John Doe',
            totalScore: 15,
            maxScore: 20,
            percentage: 75,
            bandScore: 7.0,
            correct: 15,
            incorrect: 5,
            partialCredit: 0,
            totalQuestions: 20,
            submittedAt: Date.now(),
            timeElapsed: 1200,
            testDuration: 30,
            createdAt: Date.now(),
            testTitle: 'Writing Test 1',
            testType: 'test',
            testSkill: 'writing',
            teacherId: 'teacher-1',
            isGuest: false,
            markingStatus: 'pending-review',
            writingSubmission: { text: 'Student essay content here...', wordCount: 50 },
            questionResults: [],
            courseId: null,
            courseName: null,
            classId: null,
            className: null,
            moduleId: null,
            moduleName: null
        };

        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should update status from pending-review to reviewed', async () => {
            const { markAsReviewed } = await import('./testResults.service');

            (get as any).mockResolvedValue({
                exists: () => true,
                val: () => mockResult
            });

            await markAsReviewed('result-test-1', 'teacher-1');

            // Verify update was called
            expect(update).toHaveBeenCalled();
            const updateCall = (update as any).mock.calls.find((call: any[]) =>
                call[1] && call[1].markingStatus === 'reviewed'
            );
            expect(updateCall).toBeDefined();
            const updates = updateCall[1];

            expect(updates.markingStatus).toBe('reviewed');
            expect(updates.reviewedBy).toBe('teacher-1');
            expect(updates.reviewedAt).toBeDefined();
            expect(updates.updatedAt).toBeDefined();
        });

        it('should throw error if result not found', async () => {
            const { markAsReviewed } = await import('./testResults.service');

            (get as any).mockResolvedValue({
                exists: () => false,
                val: () => null
            });

            await expect(markAsReviewed('non-existent', 'teacher-1'))
                .rejects.toThrow('Result not found');
        });

        it('should throw error if status is not pending-review', async () => {
            const { markAsReviewed } = await import('./testResults.service');

            const reviewedResult = { ...mockResult, markingStatus: 'reviewed' };
            (get as any).mockResolvedValue({
                exists: () => true,
                val: () => reviewedResult
            });

            await expect(markAsReviewed('result-test-1', 'teacher-1'))
                .rejects.toThrow("Cannot mark as reviewed: current status is 'reviewed'");
        });

        it('should throw error if status is auto-marked', async () => {
            const { markAsReviewed } = await import('./testResults.service');

            const autoMarkedResult = { ...mockResult, markingStatus: 'auto-marked' };
            (get as any).mockResolvedValue({
                exists: () => true,
                val: () => autoMarkedResult
            });

            await expect(markAsReviewed('result-test-1', 'teacher-1'))
                .rejects.toThrow("Cannot mark as reviewed: current status is 'auto-marked'");
        });

        it('should handle notification failure gracefully', async () => {
            const { markAsReviewed } = await import('./testResults.service');

            (get as any).mockResolvedValue({
                exists: () => true,
                val: () => mockResult
            });

            mockSendReviewedNotification.mockRejectedValueOnce(new Error('Notification failed'));

            // Should not throw even if notification fails
            await expect(markAsReviewed('result-test-1', 'teacher-1')).resolves.not.toThrow();

            // But status update should still happen
            expect(update).toHaveBeenCalled();
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

            const savedRecord = getSaveResultUpdatePayload('result-456')['test_results/result-456'] as Record<string, any>;

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

            const savedRecord = getSaveResultUpdatePayload('result-456')['test_results/result-456'] as Record<string, any>;

            expect(savedRecord.markingStatus).toBe('pending-review');
            expect(savedRecord.speakingSubmission.audioUrl).toBe('https://storage.example.com/audio.mp3');
        });

        it('should set auto-marked for reading/listening tests', async () => {
            const readingMetadata = { ...metadata, type: 'reading', skill: 'reading' };

            await saveTestResult(
                sessionCode, testId, studentId, 'Student Name',
                markingResult, readingMetadata, 500, teacherId, false
            );

            const savedRecord = getSaveResultUpdatePayload('result-456')['test_results/result-456'] as Record<string, any>;

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

            const savedRecord = getSaveResultUpdatePayload('result-456')['test_results/result-456'] as Record<string, any>;

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

            const savedRecord = getSaveResultUpdatePayload('result-789')['test_results/result-789'] as Record<string, any>;

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

            const savedRecord = getSaveResultUpdatePayload('result-790')['test_results/result-790'] as Record<string, any>;

            expect(savedRecord.ieltsData).toBeUndefined();
        });
    });
});
