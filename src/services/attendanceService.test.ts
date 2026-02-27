/**
 * Attendance Service Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, set, get, remove } from 'firebase/database';
import {
    recordAttendance,
    linkTestResultToAttendance,
    getModuleAttendance,
    markModuleComplete,
    isModuleComplete,
    getModuleCompletion,
    addException,
    removeException,
    getModuleExceptions,
    getStudentAttendance,
    getStudentAttendanceSummary,
    getModuleAttendees,
    hasStudentAttended
} from './attendanceService';

// Mock Firebase
vi.mock('firebase/database');
vi.mock('./firebase', () => ({
    database: {}
}));

describe('AttendanceService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('recordAttendance', () => {
        it('should record student attendance for a module', async () => {
            const mockRef = vi.mocked(ref);
            const mockSet = vi.mocked(set);

            mockRef.mockReturnValue({} as any);
            mockSet.mockResolvedValue(undefined);

            await recordAttendance(
                'course-1',
                'class-1',
                'module-1',
                'student-1',
                'John Doe',
                'session-1'
            );

            expect(mockSet).toHaveBeenCalled();
            const attendeeRecord = mockSet.mock.calls[0][1] as any;
            expect(attendeeRecord.studentId).toBe('student-1');
            expect(attendeeRecord.studentName).toBe('John Doe');
            expect(attendeeRecord.sessionId).toBe('session-1');
            expect(attendeeRecord.joinedAt).toBeTypeOf('number');
        });
    });

    describe('linkTestResultToAttendance', () => {
        it('should link test result to attendance record', async () => {
            const mockRef = vi.mocked(ref);
            const mockSet = vi.mocked(set);

            mockRef.mockReturnValue({} as any);
            mockSet.mockResolvedValue(undefined);

            await linkTestResultToAttendance(
                'course-1',
                'class-1',
                'module-1',
                'student-1',
                'result-1'
            );

            expect(mockSet).toHaveBeenCalledWith({}, 'result-1');
        });
    });

    describe('getModuleAttendance', () => {
        it('should return null if no attendance record exists', async () => {
            const mockRef = vi.mocked(ref);
            const mockGet = vi.mocked(get);

            mockRef.mockReturnValue({} as any);
            mockGet.mockResolvedValue({
                exists: () => false,
                val: () => null
            } as any);

            const result = await getModuleAttendance('course-1', 'class-1', 'module-1');

            expect(result).toBeNull();
        });

        it('should return module attendance with calculated percentage', async () => {
            const mockRef = vi.mocked(ref);
            const mockGet = vi.mocked(get);

            const mockAttendanceData = {
                attendees: {
                    'student-1': {
                        studentId: 'student-1',
                        studentName: 'John Doe',
                        joinedAt: Date.now(),
                        sessionId: 'session-1'
                    },
                    'student-2': {
                        studentId: 'student-2',
                        studentName: 'Jane Smith',
                        joinedAt: Date.now(),
                        sessionId: 'session-1'
                    }
                },
                lastUpdated: Date.now()
            };

            const mockClassData = {
                name: 'Class A',
                students: {
                    'student-1': true,
                    'student-2': true,
                    'student-3': true,
                    'student-4': true
                }
            };

            const mockCourseData = {
                title: 'English 101',
                modules: {
                    'module-1': { title: 'Module 1' }
                }
            };

            mockRef.mockReturnValue({} as any);
            mockGet
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => mockAttendanceData
                } as any)
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => mockClassData
                } as any)
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => mockCourseData
                } as any);

            const result = await getModuleAttendance('course-1', 'class-1', 'module-1');

            expect(result).toEqual({
                courseId: 'course-1',
                courseName: 'English 101',
                classId: 'class-1',
                className: 'Class A',
                moduleId: 'module-1',
                moduleName: 'Module 1',
                attendees: expect.arrayContaining([
                    expect.objectContaining({ studentId: 'student-1' }),
                    expect.objectContaining({ studentId: 'student-2' })
                ]),
                totalStudentsInClass: 4,
                attendancePercentage: 50, // 2 out of 4 students
                lastUpdated: expect.any(Number)
            });
        });
    });

    describe('markModuleComplete', () => {
        it('should mark module as complete with attendance snapshot', async () => {
            const mockRef = vi.mocked(ref);
            const mockGet = vi.mocked(get);
            const mockSet = vi.mocked(set);

            const mockAttendanceData = {
                attendees: {
                    'student-1': { studentId: 'student-1', studentName: 'John' },
                    'student-2': { studentId: 'student-2', studentName: 'Jane' }
                }
            };

            const mockClassData = {
                name: 'Class A',
                students: { 'student-1': true, 'student-2': true }
            };

            const mockCourseData = {
                title: 'English 101',
                modules: { 'module-1': { title: 'Module 1' } }
            };

            mockRef.mockReturnValue({} as any);
            mockGet
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => mockAttendanceData
                } as any)
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => mockClassData
                } as any)
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => mockCourseData
                } as any);
            mockSet.mockResolvedValue(undefined);

            await markModuleComplete(
                'course-1',
                'class-1',
                'module-1',
                'teacher-1',
                'Mr. Smith'
            );

            expect(mockSet).toHaveBeenCalled();
            const completionData = mockSet.mock.calls[0][1] as any;
            expect(completionData.courseId).toBe('course-1');
            expect(completionData.completedBy).toBe('teacher-1');
            expect(completionData.totalAttendees).toBe(2);
        });
    });

    describe('isModuleComplete', () => {
        it('should return true if module is complete', async () => {
            const mockRef = vi.mocked(ref);
            const mockGet = vi.mocked(get);

            mockRef.mockReturnValue({} as any);
            mockGet.mockResolvedValue({
                exists: () => true,
                val: () => ({ completedAt: Date.now() })
            } as any);

            const result = await isModuleComplete('course-1', 'class-1', 'module-1');

            expect(result).toBe(true);
        });

        it('should return false if module is not complete', async () => {
            const mockRef = vi.mocked(ref);
            const mockGet = vi.mocked(get);

            mockRef.mockReturnValue({} as any);
            mockGet.mockResolvedValue({
                exists: () => false,
                val: () => null
            } as any);

            const result = await isModuleComplete('course-1', 'class-1', 'module-1');

            expect(result).toBe(false);
        });
    });

    describe('getModuleCompletion', () => {
        it('should return completion record', async () => {
            const mockRef = vi.mocked(ref);
            const mockGet = vi.mocked(get);

            const mockCompletion = {
                courseId: 'course-1',
                classId: 'class-1',
                moduleId: 'module-1',
                completedAt: Date.now(),
                completedBy: 'teacher-1',
                completedByName: 'Mr. Smith',
                totalAttendees: 5,
                exceptions: []
            };

            mockRef.mockReturnValue({} as any);
            mockGet.mockResolvedValue({
                exists: () => true,
                val: () => mockCompletion
            } as any);

            const result = await getModuleCompletion('course-1', 'class-1', 'module-1');

            expect(result).toEqual(mockCompletion);
        });

        it('should return null if no completion record exists', async () => {
            const mockRef = vi.mocked(ref);
            const mockGet = vi.mocked(get);

            mockRef.mockReturnValue({} as any);
            mockGet.mockResolvedValue({
                exists: () => false,
                val: () => null
            } as any);

            const result = await getModuleCompletion('course-1', 'class-1', 'module-1');

            expect(result).toBeNull();
        });
    });

    describe('addException', () => {
        it('should add exception for student', async () => {
            const mockRef = vi.mocked(ref);
            const mockSet = vi.mocked(set);
            const mockGet = vi.mocked(get);

            mockRef.mockReturnValue({} as any);
            mockSet.mockResolvedValue(undefined);
            mockGet.mockResolvedValue({
                exists: () => true,
                val: () => []
            } as any);

            await addException(
                'course-1',
                'class-1',
                'module-1',
                'student-1',
                'John Doe',
                'Sick leave',
                'teacher-1',
                'Mr. Smith'
            );

            expect(mockSet).toHaveBeenCalled();
            const exceptionData = mockSet.mock.calls[0][1] as any;
            expect(exceptionData.studentId).toBe('student-1');
            expect(exceptionData.reason).toBe('Sick leave');
        });
    });

    describe('removeException', () => {
        it('should remove exception for student', async () => {
            const mockRef = vi.mocked(ref);
            const mockRemove = vi.mocked(remove);
            const mockGet = vi.mocked(get);
            const mockSet = vi.mocked(set);

            mockRef.mockReturnValue({} as any);
            mockRemove.mockResolvedValue(undefined);
            mockGet.mockResolvedValue({
                exists: () => true,
                val: () => ['student-1', 'student-2']
            } as any);
            mockSet.mockResolvedValue(undefined);

            await removeException('course-1', 'class-1', 'module-1', 'student-1');

            expect(mockRemove).toHaveBeenCalled();
            expect(mockSet).toHaveBeenCalledWith({}, ['student-2']);
        });
    });

    describe('getModuleExceptions', () => {
        it('should return all exceptions for a module', async () => {
            const mockRef = vi.mocked(ref);
            const mockGet = vi.mocked(get);

            const mockExceptions = {
                'student-1': {
                    studentId: 'student-1',
                    studentName: 'John Doe',
                    reason: 'Sick leave',
                    addedAt: Date.now()
                },
                'student-2': {
                    studentId: 'student-2',
                    studentName: 'Jane Smith',
                    reason: 'Family emergency',
                    addedAt: Date.now()
                }
            };

            mockRef.mockReturnValue({} as any);
            mockGet.mockResolvedValue({
                exists: () => true,
                val: () => mockExceptions
            } as any);

            const result = await getModuleExceptions('course-1', 'class-1', 'module-1');

            expect(result).toHaveLength(2);
            expect(result).toEqual(expect.arrayContaining([
                expect.objectContaining({ studentId: 'student-1' }),
                expect.objectContaining({ studentId: 'student-2' })
            ]));
        });

        it('should return empty array if no exceptions exist', async () => {
            const mockRef = vi.mocked(ref);
            const mockGet = vi.mocked(get);

            mockRef.mockReturnValue({} as any);
            mockGet.mockResolvedValue({
                exists: () => false,
                val: () => null
            } as any);

            const result = await getModuleExceptions('course-1', 'class-1', 'module-1');

            expect(result).toEqual([]);
        });
    });

    describe('getStudentAttendance', () => {
        it('should calculate attendance percentage including exceptions', async () => {
            const mockRef = vi.mocked(ref);
            const mockGet = vi.mocked(get);

            const mockModules = {
                'module-1': { title: 'Module 1' },
                'module-2': { title: 'Module 2' },
                'module-3': { title: 'Module 3' },
                'module-4': { title: 'Module 4' }
            };

            mockRef.mockReturnValue({} as any);
            mockGet
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => mockModules
                } as any)
                // Module 1: attended
                .mockResolvedValueOnce({ exists: () => true } as any)
                // Module 2: not attended, no exception
                .mockResolvedValueOnce({ exists: () => false } as any)
                .mockResolvedValueOnce({ exists: () => false } as any)
                // Module 3: not attended, has exception
                .mockResolvedValueOnce({ exists: () => false } as any)
                .mockResolvedValueOnce({ exists: () => true } as any)
                // Module 4: attended
                .mockResolvedValueOnce({ exists: () => true } as any);

            const result = await getStudentAttendance('student-1', 'course-1');

            // 2 attended + 1 exception = 3/4 = 75%
            expect(result).toBe(75);
        });

        it('should return 0 if course has no modules', async () => {
            const mockRef = vi.mocked(ref);
            const mockGet = vi.mocked(get);

            mockRef.mockReturnValue({} as any);
            mockGet.mockResolvedValue({
                exists: () => false,
                val: () => null
            } as any);

            const result = await getStudentAttendance('student-1', 'course-1');

            expect(result).toBe(0);
        });
    });

    describe('getStudentAttendanceSummary', () => {
        it('should return detailed attendance summary', async () => {
            const mockRef = vi.mocked(ref);
            const mockGet = vi.mocked(get);

            const mockModules = {
                'module-1': { title: 'Module 1' },
                'module-2': { title: 'Module 2' },
                'module-3': { title: 'Module 3' },
                'module-4': { title: 'Module 4' }
            };

            mockRef.mockReturnValue({} as any);
            mockGet
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => mockModules
                } as any)
                // Module 1: attended
                .mockResolvedValueOnce({ exists: () => true } as any)
                // Module 2: not attended, no exception
                .mockResolvedValueOnce({ exists: () => false } as any)
                .mockResolvedValueOnce({ exists: () => false } as any)
                // Module 3: not attended, has exception
                .mockResolvedValueOnce({ exists: () => false } as any)
                .mockResolvedValueOnce({ exists: () => true } as any)
                // Module 4: attended
                .mockResolvedValueOnce({ exists: () => true } as any);

            const result = await getStudentAttendanceSummary('student-1', 'course-1');

            expect(result).toEqual({
                studentId: 'student-1',
                courseId: 'course-1',
                totalModules: 4,
                attendedModules: 2,
                exceptedModules: 1,
                attendancePercentage: 75, // (2 + 1) / 4 * 100
                missedModules: 1, // 4 - 2 - 1
                lastUpdated: expect.any(Number)
            });
        });
    });

    describe('getModuleAttendees', () => {
        it('should return list of attendees', async () => {
            const mockRef = vi.mocked(ref);
            const mockGet = vi.mocked(get);

            const mockAttendanceData = {
                attendees: {
                    'student-1': {
                        studentId: 'student-1',
                        studentName: 'John Doe',
                        joinedAt: Date.now(),
                        sessionId: 'session-1'
                    }
                }
            };

            const mockClassData = {
                name: 'Class A',
                students: { 'student-1': true }
            };

            const mockCourseData = {
                title: 'English 101',
                modules: { 'module-1': { title: 'Module 1' } }
            };

            mockRef.mockReturnValue({} as any);
            mockGet
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => mockAttendanceData
                } as any)
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => mockClassData
                } as any)
                .mockResolvedValueOnce({
                    exists: () => true,
                    val: () => mockCourseData
                } as any);

            const result = await getModuleAttendees('course-1', 'class-1', 'module-1');

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual(expect.objectContaining({
                studentId: 'student-1',
                studentName: 'John Doe'
            }));
        });
    });

    describe('hasStudentAttended', () => {
        it('should return true if student attended', async () => {
            const mockRef = vi.mocked(ref);
            const mockGet = vi.mocked(get);

            mockRef.mockReturnValue({} as any);
            mockGet.mockResolvedValue({
                exists: () => true,
                val: () => ({ studentId: 'student-1' })
            } as any);

            const result = await hasStudentAttended(
                'course-1',
                'class-1',
                'module-1',
                'student-1'
            );

            expect(result).toBe(true);
        });

        it('should return false if student did not attend', async () => {
            const mockRef = vi.mocked(ref);
            const mockGet = vi.mocked(get);

            mockRef.mockReturnValue({} as any);
            mockGet.mockResolvedValue({
                exists: () => false,
                val: () => null
            } as any);

            const result = await hasStudentAttended(
                'course-1',
                'class-1',
                'module-1',
                'student-1'
            );

            expect(result).toBe(false);
        });
    });
});
