import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    exportResultsToCSV,
    StudentResult,
    getSessionResults as getMappedSessionResults,
    getTeacherResults as getMappedTeacherResults,
    getResultsForTeacher,
    getResultsForAssignedStudents,
    getStudentAllResults,
} from './resultsService';

const {
    mockRef,
    mockGet,
    mockGetStudentResults,
    mockGetCanonicalSessionResults,
    mockGetCanonicalTeacherResults,
    mockIsStudentAssignedToTeacher,
    mockGetAssignmentsByTeacher,
    mockClassifyTeacherResultVisibility,
} = vi.hoisted(() => ({
    mockRef: vi.fn((_database, path) => ({ path })),
    mockGet: vi.fn(),
    mockGetStudentResults: vi.fn(),
    mockGetCanonicalSessionResults: vi.fn(),
    mockGetCanonicalTeacherResults: vi.fn(),
    mockIsStudentAssignedToTeacher: vi.fn(),
    mockGetAssignmentsByTeacher: vi.fn(),
    mockClassifyTeacherResultVisibility: vi.fn(),
}));

// Mock firebase modules
vi.mock('firebase/database', () => ({
    ref: mockRef,
    get: mockGet,
    set: vi.fn(),
    update: vi.fn()
}));

vi.mock('./firebase', () => ({
    database: {}
}));

vi.mock('./testResults.service', () => ({
    getStudentResults: mockGetStudentResults,
    getSessionResults: mockGetCanonicalSessionResults,
    getTeacherResults: mockGetCanonicalTeacherResults,
}));

vi.mock('./assignmentManager', () => ({
    isStudentAssignedToTeacher: mockIsStudentAssignedToTeacher,
    getAssignmentsByTeacher: mockGetAssignmentsByTeacher,
}));

vi.mock('./resultVisibility.service', () => ({
    classifyTeacherResultVisibility: mockClassifyTeacherResultVisibility,
}));

function createSnapshot(value: any) {
    return {
        exists: () => value !== null && value !== undefined,
        val: () => value,
    };
}

describe('resultsService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGet.mockResolvedValue(createSnapshot(null));
        mockGetStudentResults.mockResolvedValue([]);
        mockGetCanonicalSessionResults.mockResolvedValue([]);
        mockGetCanonicalTeacherResults.mockResolvedValue([]);
        mockIsStudentAssignedToTeacher.mockResolvedValue(true);
        mockGetAssignmentsByTeacher.mockResolvedValue([]);
        mockClassifyTeacherResultVisibility.mockImplementation(({ result, teacherId, hasAssignmentAccess }: any) => ({
            shouldDisplayInTeacherHistory: Boolean(
                hasAssignmentAccess
                && result?.visibility?.ownershipResolved
                && (
                    result.visibility.contextType === 'solo_practice'
                    || result.visibility.visibilityOwnerTeacherId === teacherId
                )
            ),
        }));
    });

    describe('exportResultsToCSV', () => {
        it('should generate correct CSV headers and rows', () => {
            const mockResults: StudentResult[] = [{
                studentId: 's1',
                studentName: 'John Doe',
                studentEmail: 'john@example.com',
                sessionCode: '123456',
                sessionMode: 'test',
                testTitle: 'IELTS Reading',
                score: 35,
                percentage: 87.5,
                totalQuestions: 40,
                correctAnswers: 35,
                completedAt: new Date('2023-01-01T12:00:00Z').getTime(),
                timeSpent: 3600000, // 60 mins
                className: 'Class A',
                isGuest: false,
                bandScore: 7.5,
                testSkill: 'reading',
                reMarkHistory: 0,
                teacherId: 'teacher123'
            }];

            const csv = exportResultsToCSV(mockResults);

            // Check headers
            expect(csv).toContain('Student Name,Student Email,Session Code,Test Title,Score,Percentage,Correct Answers,Total Questions,Completed At,Time Spent (min),Class Name,Is Guest,Band Score,Skill,Teacher ID,Re-marks');

            // Check data
            expect(csv).toContain('"John Doe"');
            expect(csv).toContain('"john@example.com"');
            expect(csv).toContain('"123456"');
            expect(csv).toContain('"IELTS Reading"');
            expect(csv).toContain('"35"');
            expect(csv).toContain('"87.50%"');
            expect(csv).toContain('"7.5"');
            expect(csv).toContain('"reading"');
            expect(csv).toContain('"teacher123"');
            expect(csv).toContain('"0"');
        });

        it('should handle optional missing fields', () => {
            const mockResults: StudentResult[] = [{
                studentId: 's2',
                studentName: 'Guest User',
                sessionCode: '999999',
                sessionMode: 'test',
                score: 0,
                percentage: 0,
                totalQuestions: 10,
                correctAnswers: 0,
                completedAt: Date.now(),
                isGuest: true,
            }];

            const csv = exportResultsToCSV(mockResults);
            expect(csv).toContain('"Guest User"');
            expect(csv).toContain('"Yes"'); // Is Guest
            expect(csv).toContain('""'); // Empty teacherId
            expect(csv).toContain('""'); // Empty bandScore
        });

        it('should export only normalized teacher ownership values', () => {
            const mockResults: StudentResult[] = [{
                studentId: 's3',
                studentName: 'Normalized Owner Only',
                sessionCode: 'session-1',
                sessionMode: 'test',
                score: 20,
                percentage: 100,
                totalQuestions: 20,
                correctAnswers: 20,
                completedAt: 1_710_000_000_000,
                isGuest: false,
            }];

            const csv = exportResultsToCSV(mockResults);

            expect(csv).toContain('"Normalized Owner Only"');
            expect(csv).toContain(',"",');
        });
    });

    // PRD-0016: Context-aware result tests
    describe('context field support', () => {
        it('should include context field in StudentResult interface', () => {
            const resultWithContext: StudentResult = {
                studentId: 's1',
                studentName: 'Test Student',
                sessionCode: '123456',
                sessionMode: 'test',
                score: 35,
                percentage: 87.5,
                totalQuestions: 40,
                correctAnswers: 35,
                completedAt: Date.now(),
                isGuest: false,
                context: {
                    type: 'class_session',
                    source: {
                        type: 'class',
                        id: 'class123',
                        name: 'Math Class'
                    },
                    configApplied: {
                        timerMinutes: 60,
                        feedbackTiming: 'after_completion',
                        source: 'material_default'
                    }
                }
            };

            expect(resultWithContext.context).toBeDefined();
            expect(resultWithContext.context?.type).toBe('class_session');
            expect(resultWithContext.context?.source?.type).toBe('class');
        });

        it('should handle self_study context type', () => {
            const selfStudyResult: StudentResult = {
                studentId: 's2',
                studentName: 'Solo Student',
                sessionCode: 'solo123',
                sessionMode: 'test',
                score: 28,
                percentage: 70,
                totalQuestions: 40,
                correctAnswers: 28,
                completedAt: Date.now(),
                isGuest: false,
                context: {
                    type: 'self_study',
                    source: {
                        type: 'library',
                        id: 'material456'
                    },
                    configApplied: {
                        feedbackTiming: 'immediate',
                        source: 'material_default'
                    }
                }
            };

            expect(selfStudyResult.context?.type).toBe('self_study');
            expect(selfStudyResult.context?.source?.type).toBe('library');
        });

        it('should handle homework context type', () => {
            const homeworkResult: StudentResult = {
                studentId: 's3',
                studentName: 'Homework Student',
                sessionCode: 'hw789',
                sessionMode: 'test',
                score: 32,
                percentage: 80,
                totalQuestions: 40,
                correctAnswers: 32,
                completedAt: Date.now(),
                isGuest: false,
                context: {
                    type: 'homework',
                    source: {
                        type: 'homework',
                        id: 'hw123',
                        name: 'Week 1 Assignment'
                    },
                    configApplied: {
                        timerMinutes: 45,
                        feedbackTiming: 'after_deadline',
                        source: 'teacher_override'
                    }
                }
            };

            expect(homeworkResult.context?.type).toBe('homework');
            expect(homeworkResult.context?.configApplied?.source).toBe('teacher_override');
        });

        it('should treat results without context as class_session (legacy)', () => {
            const legacyResult: StudentResult = {
                studentId: 's4',
                studentName: 'Legacy Student',
                sessionCode: 'old123',
                sessionMode: 'test',
                score: 30,
                percentage: 75,
                totalQuestions: 40,
                correctAnswers: 30,
                completedAt: Date.now(),
                isGuest: false
                // No context field - legacy result
            };

            // Legacy results should be treated as class_session
            const contextType = legacyResult.context?.type ?? 'class_session';
            expect(contextType).toBe('class_session');
        });
    });

    describe('teacher visibility filtering', () => {
        it('should exclude unresolved or foreign-owner rows from getResultsForTeacher', async () => {
            mockGetStudentResults.mockResolvedValueOnce([
                {
                    resultId: 'visible-row',
                    studentId: 'student-1',
                    studentName: 'Visible Student',
                    sessionCode: 'SESSION-1',
                    testId: 'TEST-1',
                    totalScore: 8,
                    maxScore: 10,
                    percentage: 80,
                    bandScore: 7,
                    correct: 8,
                    incorrect: 2,
                    partialCredit: 0,
                    totalQuestions: 10,
                    submittedAt: 1000,
                    timeElapsed: 100,
                    testDuration: 30,
                    createdAt: 1000,
                    testTitle: 'Visible',
                    testType: 'test',
                    testSkill: 'reading',
                    questionResults: [],
                    visibility: {
                        contextType: 'class_session',
                        sourceType: 'session',
                        sourceId: 'SESSION-1',
                        sourceNameSnapshot: 'Visible',
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
                },
                {
                    resultId: 'hidden-row',
                    studentId: 'student-1',
                    studentName: 'Hidden Student',
                    sessionCode: 'SESSION-2',
                    testId: 'TEST-2',
                    totalScore: 9,
                    maxScore: 10,
                    percentage: 90,
                    bandScore: 8,
                    correct: 9,
                    incorrect: 1,
                    partialCredit: 0,
                    totalQuestions: 10,
                    submittedAt: 2000,
                    timeElapsed: 100,
                    testDuration: 30,
                    createdAt: 2000,
                    testTitle: 'Hidden',
                    testType: 'test',
                    testSkill: 'reading',
                    questionResults: [],
                    teacherId: 'teacher-1',
                    visibility: {
                        contextType: 'class_session',
                        sourceType: 'session',
                        sourceId: 'SESSION-2',
                        sourceNameSnapshot: 'Hidden',
                        visibilityOwnerTeacherId: 'teacher-2',
                        ownerResolutionSource: 'session.createdByUserId',
                        ownershipResolved: true,
                        unresolvedReason: null,
                        homeworkId: null,
                        sessionCode: 'SESSION-2',
                        courseId: null,
                        classId: null,
                        assignmentId: null,
                    },
                },
            ]);

            const results = await getResultsForTeacher('teacher-1', ['student-1']);

            expect(results).toHaveLength(1);
            expect(results[0].id).toBe('visible-row');
        });

        it('should return only classified-visible rows from getStudentAllResults when teacher access is granted', async () => {
            mockGetStudentResults.mockResolvedValueOnce([
                {
                    resultId: 'solo-row',
                    studentId: 'student-1',
                    studentName: 'Solo Student',
                    sessionCode: 'solo-1',
                    testId: 'TEST-1',
                    totalScore: 7,
                    maxScore: 10,
                    percentage: 70,
                    bandScore: 6.5,
                    correct: 7,
                    incorrect: 3,
                    partialCredit: 0,
                    totalQuestions: 10,
                    submittedAt: 1000,
                    timeElapsed: 100,
                    testDuration: 30,
                    createdAt: 1000,
                    testTitle: 'Solo',
                    testType: 'test',
                    testSkill: 'reading',
                    questionResults: [],
                    visibility: {
                        contextType: 'solo_practice',
                        sourceType: 'solo_practice',
                        sourceId: 'solo-1',
                        sourceNameSnapshot: 'Solo',
                        visibilityOwnerTeacherId: null,
                        ownerResolutionSource: 'solo_practice',
                        ownershipResolved: true,
                        unresolvedReason: null,
                        homeworkId: null,
                        sessionCode: 'solo-1',
                        courseId: null,
                        classId: null,
                        assignmentId: null,
                    },
                },
                {
                    resultId: 'unresolved-row',
                    studentId: 'student-1',
                    studentName: 'Unresolved Student',
                    sessionCode: 'legacy-1',
                    testId: 'TEST-2',
                    totalScore: 5,
                    maxScore: 10,
                    percentage: 50,
                    bandScore: 5,
                    correct: 5,
                    incorrect: 5,
                    partialCredit: 0,
                    totalQuestions: 10,
                    submittedAt: 2000,
                    timeElapsed: 100,
                    testDuration: 30,
                    createdAt: 2000,
                    testTitle: 'Legacy',
                    testType: 'test',
                    testSkill: 'reading',
                    questionResults: [],
                    visibility: {
                        contextType: 'course_material',
                        sourceType: 'course',
                        sourceId: 'course-1',
                        sourceNameSnapshot: 'Legacy',
                        visibilityOwnerTeacherId: null,
                        ownerResolutionSource: 'unresolved',
                        ownershipResolved: false,
                        unresolvedReason: 'owner_not_resolved',
                        homeworkId: null,
                        sessionCode: 'legacy-1',
                        courseId: 'course-1',
                        classId: null,
                        assignmentId: null,
                    },
                },
            ]);

            const results = await getStudentAllResults('student-1', 'teacher-1');

            expect(results).toHaveLength(1);
            expect(results[0].id).toBe('solo-row');
        });

        it('should keep student history complete when no teacherId is provided', async () => {
            mockGetStudentResults.mockResolvedValueOnce([
                {
                    resultId: 'row-1',
                    studentId: 'student-1',
                    studentName: 'Student One',
                    sessionCode: 'SESSION-1',
                    testId: 'TEST-1',
                    totalScore: 8,
                    maxScore: 10,
                    percentage: 80,
                    bandScore: 7,
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
                    questionResults: [],
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
                },
                {
                    resultId: 'row-2',
                    studentId: 'student-1',
                    studentName: 'Student One',
                    sessionCode: 'SESSION-2',
                    testId: 'TEST-2',
                    totalScore: 5,
                    maxScore: 10,
                    percentage: 50,
                    bandScore: 5,
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
                    questionResults: [],
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
                },
            ]);

            const results = await getStudentAllResults('student-1');

            expect(results).toHaveLength(2);
            expect(results.map((result) => result.id)).toEqual(['row-2', 'row-1']);
        });

        it('should return no rows when assignment access fails', async () => {
            mockIsStudentAssignedToTeacher.mockResolvedValueOnce(false);

            const results = await getStudentAllResults('student-1', 'teacher-1');

            expect(results).toEqual([]);
        });

        it('should only include classified-visible rows for assigned students', async () => {
            mockGetAssignmentsByTeacher.mockResolvedValueOnce([
                { studentId: 'student-1' },
                { studentId: 'student-2' },
            ]);
            mockGetStudentResults
                .mockResolvedValueOnce([
                    {
                        resultId: 'visible-row',
                        studentId: 'student-1',
                        studentName: 'Visible Student',
                        sessionCode: 'SESSION-1',
                        testId: 'TEST-1',
                        totalScore: 8,
                        maxScore: 10,
                        percentage: 80,
                        bandScore: 7,
                        correct: 8,
                        incorrect: 2,
                        partialCredit: 0,
                        totalQuestions: 10,
                        submittedAt: 1000,
                        timeElapsed: 100,
                        testDuration: 30,
                        createdAt: 1000,
                        testTitle: 'Visible',
                        testType: 'test',
                        testSkill: 'reading',
                        questionResults: [],
                        visibility: {
                            contextType: 'class_session',
                            sourceType: 'session',
                            sourceId: 'SESSION-1',
                            sourceNameSnapshot: 'Visible',
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
                    },
                ])
                .mockResolvedValueOnce([
                    {
                        resultId: 'hidden-row',
                        studentId: 'student-2',
                        studentName: 'Hidden Student',
                        sessionCode: 'SESSION-2',
                        testId: 'TEST-2',
                        totalScore: 7,
                        maxScore: 10,
                        percentage: 70,
                        bandScore: 6,
                        correct: 7,
                        incorrect: 3,
                        partialCredit: 0,
                        totalQuestions: 10,
                        submittedAt: 1500,
                        timeElapsed: 100,
                        testDuration: 30,
                        createdAt: 1500,
                        testTitle: 'Hidden',
                        testType: 'test',
                        testSkill: 'reading',
                        questionResults: [],
                        visibility: {
                            contextType: 'course_material',
                            sourceType: 'course',
                            sourceId: 'course-2',
                            sourceNameSnapshot: 'Hidden',
                            visibilityOwnerTeacherId: null,
                            ownerResolutionSource: 'unresolved',
                            ownershipResolved: false,
                            unresolvedReason: 'owner_not_resolved',
                            homeworkId: null,
                            sessionCode: 'SESSION-2',
                            courseId: 'course-2',
                            classId: null,
                            assignmentId: null,
                        },
                    },
                ]);

            const results = await getResultsForAssignedStudents('teacher-1');

            expect(results).toHaveLength(1);
            expect(results[0].id).toBe('visible-row');
        });

        it('should not expose raw teacherId fallback in mapped session results', async () => {
            mockGet.mockImplementation(async ({ path }: { path: string }) => {
                if (path === 'game_sessions/SESSION-1') {
                    return createSnapshot({
                        mode: 'test',
                        testTitle: 'Mapped Session',
                        players: {
                            'student-1': {
                                name: 'Student One',
                                email: 'student@example.com',
                                score: 18,
                                percentage: 90,
                                totalQuestions: 20,
                                correctAnswers: 18,
                                completedAt: 1_710_000_000_000,
                            },
                        },
                    });
                }

                return createSnapshot(null);
            });

            mockGetCanonicalSessionResults.mockResolvedValueOnce([
                {
                    resultId: 'result-1',
                    sessionCode: 'SESSION-1',
                    testId: 'test-1',
                    studentId: 'student-1',
                    studentName: 'Student One',
                    teacherId: 'legacy-owner',
                    totalScore: 18,
                    maxScore: 20,
                    percentage: 90,
                    bandScore: 8,
                    questionResults: [],
                    correct: 18,
                    incorrect: 2,
                    partialCredit: 0,
                    totalQuestions: 20,
                    submittedAt: 1_710_000_000_000,
                    timeElapsed: 900,
                    testDuration: 60,
                    createdAt: 1_710_000_000_000,
                    testTitle: 'Mapped Session',
                    testType: 'test',
                    testSkill: 'reading',
                    visibility: {
                        contextType: 'solo_practice',
                        sourceType: 'solo_practice',
                        sourceId: 'solo-source',
                        sourceNameSnapshot: 'Mapped Session',
                        visibilityOwnerTeacherId: null,
                        ownerResolutionSource: 'solo_practice',
                        ownershipResolved: true,
                        unresolvedReason: null,
                        homeworkId: null,
                        sessionCode: 'SESSION-1',
                        courseId: null,
                        classId: null,
                        assignmentId: null,
                    },
                },
            ]);

            const results = await getMappedSessionResults('SESSION-1');

            expect(results?.results).toHaveLength(1);
            expect(results?.results[0].teacherId).toBeUndefined();
        });

        it('should not expose raw teacherId fallback in mapped teacher session groups', async () => {
            mockGet.mockImplementation(async ({ path }: { path: string }) => {
                if (path === 'game_sessions') {
                    return createSnapshot({
                        'SESSION-1': {
                            mode: 'test',
                            testTitle: 'Canonical Group',
                            createdAt: 1_710_000_000_000,
                        },
                    });
                }

                return createSnapshot(null);
            });

            mockGetCanonicalTeacherResults.mockResolvedValueOnce([
                {
                    resultId: 'result-1',
                    sessionCode: 'SESSION-1',
                    testId: 'test-1',
                    studentId: 'student-1',
                    studentName: 'Student One',
                    teacherId: 'legacy-owner',
                    totalScore: 18,
                    maxScore: 20,
                    percentage: 90,
                    bandScore: 8,
                    questionResults: [],
                    correct: 18,
                    incorrect: 2,
                    partialCredit: 0,
                    totalQuestions: 20,
                    submittedAt: 1_710_000_000_000,
                    timeElapsed: 900,
                    testDuration: 60,
                    createdAt: 1_710_000_000_000,
                    testTitle: 'Canonical Group',
                    testType: 'test',
                    testSkill: 'reading',
                    visibility: {
                        contextType: 'course_material',
                        sourceType: 'course',
                        sourceId: 'course-1',
                        sourceNameSnapshot: 'Canonical Group',
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
                },
            ]);

            const results = await getMappedTeacherResults('teacher-1');

            expect(results).toHaveLength(1);
            expect(results[0].results).toHaveLength(1);
            expect(results[0].results[0].teacherId).toBeUndefined();
        });
    });
});
