
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    saveTestResult,
    getTeacherResults,
    updateResultScore,
    getReMarkHistory,
    markAsReviewed,
    TestResultRecord
} from './testResults.service';
// @ts-ignore
import { database } from './firebase';
import { ref, set, get, push, update } from 'firebase/database';

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

describe('testResults.service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
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

            // Check that teacher index was created
            expect(set).toHaveBeenCalledTimes(4); // Main record, session index, student index, teacher index

            // Verify teacher index call
            // The 4th call to set should be the teacher index
            const teacherIndexCall = (set as any).mock.calls.find((call: any[]) =>
                call[0] && call[0].toString && call[0].toString().includes('teacher-1')
            );

            // Since ref() is mocked, we need to inspect how ref was called or mock ref return values
            // A simpler way is to verify 'ref' calls
            expect(ref).toHaveBeenCalledWith(database, `test_results_by_teacher/${teacherId}/${resultId}`);
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
                teacherId: 'teach1'
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

            // Verify main record includes context fields
            const mainRecordCall = (set as any).mock.calls[0];
            const savedRecord = mainRecordCall[1];

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

            // Should create: main record, session index, student index, teacher index, course index
            expect(set).toHaveBeenCalledTimes(5);

            // Verify course index was created
            expect(ref).toHaveBeenCalledWith(
                database,
                `test_results_by_course/${academicContext.courseId}/${studentId}/result-123`
            );

            // Find the course index call
            const courseIndexCall = (set as any).mock.calls.find((call: any[]) => {
                const refCall = (ref as any).mock.calls.find((r: any[]) =>
                    r[1] && r[1].includes('test_results_by_course')
                );
                return refCall !== undefined;
            });

            expect(courseIndexCall).toBeDefined();
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

            // Should create: main record, session index, student index, teacher index, course index, class index
            expect(set).toHaveBeenCalledTimes(6);

            // Verify class index was created
            expect(ref).toHaveBeenCalledWith(
                database,
                `test_results_by_class/${academicContext.classId}/${studentId}/result-123`
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

            // Should create: main record, session index, student index, teacher index, course index, class index
            expect(set).toHaveBeenCalledTimes(6);

            // Verify both indexes were created
            expect(ref).toHaveBeenCalledWith(
                database,
                `test_results_by_course/${academicContext.courseId}/${studentId}/result-123`
            );
            expect(ref).toHaveBeenCalledWith(
                database,
                `test_results_by_class/${academicContext.classId}/${studentId}/result-123`
            );
        });

        it('should set context fields to null when not provided', async () => {
            const resultId = await saveTestResult(
                sessionCode, testId, studentId, 'Student Name',
                markingResult, metadata, 500, teacherId, false
                // No academicContext provided
            );

            expect(resultId).toBe('result-123');

            // Verify main record has null context fields
            const mainRecordCall = (set as any).mock.calls[0];
            const savedRecord = mainRecordCall[1];

            expect(savedRecord.courseId).toBeNull();
            expect(savedRecord.courseName).toBeNull();
            expect(savedRecord.classId).toBeNull();
            expect(savedRecord.className).toBeNull();
            expect(savedRecord.moduleId).toBeNull();
            expect(savedRecord.moduleName).toBeNull();

            // Should NOT create course or class indexes
            expect(set).toHaveBeenCalledTimes(4); // Only main, session, student, teacher
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

            const mainRecordCall = (set as any).mock.calls[0];
            const savedRecord = mainRecordCall[1];

            expect(savedRecord.courseId).toBe('course-1');
            expect(savedRecord.courseName).toBeNull();
            expect(savedRecord.classId).toBeNull();

            // Should create course index but not class index
            expect(set).toHaveBeenCalledTimes(5); // main, session, student, teacher, course
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

            // Find the course index set call
            const courseIndexSetCall = (set as any).mock.calls.find((call: any[], index: number) => {
                const correspondingRefCall = (ref as any).mock.calls[index];
                return correspondingRefCall && correspondingRefCall[1] &&
                    correspondingRefCall[1].includes('test_results_by_course');
            });

            expect(courseIndexSetCall).toBeDefined();
            if (courseIndexSetCall) {
                const indexData = courseIndexSetCall[1];
                expect(indexData.moduleId).toBe('module-1');
            }
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

            // Find the class index set call
            const classIndexSetCall = (set as any).mock.calls.find((call: any[], index: number) => {
                const correspondingRefCall = (ref as any).mock.calls[index];
                return correspondingRefCall && correspondingRefCall[1] &&
                    correspondingRefCall[1].includes('test_results_by_class');
            });

            expect(classIndexSetCall).toBeDefined();
            if (classIndexSetCall) {
                const indexData = classIndexSetCall[1];
                expect(indexData.courseId).toBe('course-1');
            }
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
            const updateCall = (update as any).mock.calls[0];
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

            // Mock notification to fail
            vi.doMock('./notificationService', () => ({
                sendReviewedNotification: vi.fn().mockRejectedValue(new Error('Notification failed'))
            }));

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

            const mainRecordCall = (set as any).mock.calls[0];
            const savedRecord = mainRecordCall[1];

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

            const mainRecordCall = (set as any).mock.calls[0];
            const savedRecord = mainRecordCall[1];

            expect(savedRecord.markingStatus).toBe('pending-review');
            expect(savedRecord.speakingSubmission.audioUrl).toBe('https://storage.example.com/audio.mp3');
        });

        it('should set auto-marked for reading/listening tests', async () => {
            const readingMetadata = { ...metadata, type: 'reading', skill: 'reading' };

            await saveTestResult(
                sessionCode, testId, studentId, 'Student Name',
                markingResult, readingMetadata, 500, teacherId, false
            );

            const mainRecordCall = (set as any).mock.calls[0];
            const savedRecord = mainRecordCall[1];

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

            const mainRecordCall = (set as any).mock.calls[0];
            const savedRecord = mainRecordCall[1];

            expect(savedRecord.markingStatus).toBe('pending-review');
            expect(savedRecord.writingSubmission.text).toBe('Essay...');
            expect(savedRecord.speakingSubmission.audioUrl).toBe('https://audio.mp3');
        });
    });
});
