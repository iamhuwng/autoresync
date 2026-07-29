import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    linkCourseToClass,
    unlinkCourseFromClass,
    enrollStudentInCourse,
    unenrollStudent,
    getEnrollmentsByCourse,
    getLinkedCourses,
    getLinkedClasses,
    checkCourseExpirations,
    sendExpirationWarning,
    extendCourseDuration,
    syncCourseWithOriginal
} from './enrollmentManager';
import { database } from './firebase';
import { ref, set, get, push, remove, update, query, orderByChild, equalTo } from 'firebase/database';
import { getCourse, getModulesByCourse, createModule, updateCourse } from './courseManager';
import { getMaterialsByModule, linkMaterialToModule } from './materialLinkManager';
import { getClass } from './classManager';
import { createTrustedNotification } from './notificationProducerClient';

// Mock dependencies
vi.mock('./firebase', () => ({
    database: {}
}));

vi.mock('./notificationProducerClient', () => ({
    createTrustedNotification: vi.fn()
}));

vi.mock('firebase/database', () => ({
    ref: vi.fn(),
    set: vi.fn(),
    get: vi.fn(),
    push: vi.fn(),
    remove: vi.fn(),
    update: vi.fn(),
    query: vi.fn(),
    orderByChild: vi.fn(),
    equalTo: vi.fn()
}));

vi.mock('./courseManager', () => ({
    getCourse: vi.fn(),
    getModulesByCourse: vi.fn(),
    createModule: vi.fn(),
    createCourse: vi.fn(),
    updateCourse: vi.fn()
}));

vi.mock('./materialLinkManager', () => ({
    getMaterialsByModule: vi.fn(),
    linkMaterialToModule: vi.fn()
}));

vi.mock('./classManager', () => ({
    getClass: vi.fn()
}));

describe('EnrollmentManager', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default mocks
        (push as any).mockReturnValue({ key: 'new-id' });
        (ref as any).mockReturnValue('ref');
        (get as any).mockResolvedValue({ exists: () => false, val: () => null });
    });

    describe('linkCourseToClass', () => {
        const mockCourse = {
            id: 'course-1',
            name: 'IELTS Basic',
            code: 'IELTS-001',
            ownerId: 'teacher-1',
            duration: { value: 30, unit: 'days' }
        };

        const mockClass = {
            id: 'class-1',
            classCode: 'CLASS123',
            name: 'Morning Class',
            students: {
                'student-1': { uid: 'student-1' },
                'student-2': { uid: 'student-2' }
            }
        };

        const mockModules = [
            { id: 'mod-1', name: 'Module 1', accessType: 'open' }
        ];

        const mockMaterials = [
            { id: 'link-1', materialId: 'mat-1' }
        ];

        it('should create course copy and link to class', async () => {
            (getCourse as any).mockResolvedValue(mockCourse);
            (getClass as any).mockResolvedValue(mockClass);
            (getModulesByCourse as any).mockResolvedValue(mockModules);
            (getMaterialsByModule as any).mockResolvedValue(mockMaterials);
            (createModule as any).mockResolvedValue({ success: true, moduleId: 'new-mod-1' });

            (push as any)
                .mockReturnValueOnce({ key: 'copy-course-id' }) // Course Copy ID
                .mockReturnValueOnce({ key: 'link-id' }) // Link ID
                .mockReturnValueOnce({ key: 'enroll-1' }) // Enrollment 1
                .mockReturnValueOnce({ key: 'enroll-2' }); // Enrollment 2

            const result = await linkCourseToClass('class-1', 'course-1', undefined, true);

            expect(result.success).toBe(true);
            expect(result.linkId).toBe('link-id');
            expect(result.linkedCourseId).toBe('copy-course-id');

            // Verify course was copied
            expect(set).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    id: 'copy-course-id',
                    name: 'IELTS Basic (Morning Class)',
                    code: 'IELTS-001-CLASS123'
                })
            );

            // Verify modules copied
            expect(createModule).toHaveBeenCalledWith('copy-course-id', expect.objectContaining({
                name: 'Module 1'
            }));

            // Verify materials linked
            expect(linkMaterialToModule).toHaveBeenCalledWith('copy-course-id', 'new-mod-1', 'mat-1');

            // Verify Enrollments created
            expect(set).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    studentId: 'student-1',
                    courseId: 'copy-course-id'
                })
            );
        });

        it('should calculate expiration correctly', async () => {
            (getCourse as any).mockResolvedValue(mockCourse);
            (getClass as any).mockResolvedValue(mockClass);
            (getModulesByCourse as any).mockResolvedValue([]);
            (push as any).mockReturnValue({ key: 'id' });

            const duration = { value: 2, unit: 'months' };
            await linkCourseToClass('class-1', 'course-1', duration as any, false);

            const setData = (set as any).mock.calls.find((call: any) => call[1].isAutoEnroll !== undefined)[1];

            // Check if dates are roughly correct (2 months from now)
            const now = Date.now();
            const expected = new Date();
            expected.setMonth(expected.getMonth() + 2);

            expect(setData.expiresAt).toBeGreaterThan(now);
            // Allow roughly small difference
            expect(Math.abs(setData.expiresAt - expected.getTime())).toBeLessThan(5000);
        });

        it('should return error if original course not found', async () => {
            (getCourse as any).mockResolvedValue(null);

            const result = await linkCourseToClass('c1', 'course1');
            expect(result.success).toBe(false);
            expect(result.error).toContain('course not found');
        });
    });

    describe('unlinkCourseFromClass', () => {
        it('should remove link and enrollments', async () => {
            const mockSnapshot = {
                exists: () => true,
                val: () => ({
                    'link-1': { id: 'link-1', classId: 'c1', courseId: 'courseCopied' }
                })
            };

            const mockEnrollSnapshot = {
                exists: () => true,
                val: () => ({
                    'e1': { id: 'e1', courseId: 'courseCopied', sourceClassId: 'c1' },
                    'e2': { id: 'e2', courseId: 'courseCopied', sourceClassId: 'c1' }
                })
            };

            (query as any).mockReturnValue('query');
            (get as any)
                .mockResolvedValueOnce(mockSnapshot) // get Links
                .mockResolvedValueOnce(mockEnrollSnapshot); // get Enrollments

            const result = await unlinkCourseFromClass('c1', 'courseCopied');

            expect(result.success).toBe(true);
            expect(remove).toHaveBeenCalled(); // Link removal
            expect(update).toHaveBeenCalled(); // Enrollment nullification
        });
    });
});

describe('unenrollStudent', () => {
    it('should remove enrollment', async () => {
        const mockSnapshot = {
            exists: () => true,
            val: () => ({
                'e1': { id: 'e1', studentId: 's1', courseId: 'c1' }
            })
        };

        (query as any).mockReturnValue('query');
        (get as any).mockResolvedValue(mockSnapshot);

        const result = await unenrollStudent('s1', 'c1');
        expect(result.success).toBe(true);
        expect(remove).toHaveBeenCalled();
    });
});

describe('Getters', () => {
    beforeEach(() => {
        const mockSnapshot = {
            exists: () => true,
            val: () => ({ 'id1': { id: 'id1' } })
        };
        (get as any).mockResolvedValue(mockSnapshot);
    });

    it('getEnrollmentsByCourse searches by courseId', async () => {
        await getEnrollmentsByCourse('c1');
        expect(orderByChild).toHaveBeenCalledWith('courseId');
        expect(equalTo).toHaveBeenCalledWith('c1');
    });

    it('getLinkedCourses searches by classId', async () => {
        await getLinkedCourses('class1');
        expect(orderByChild).toHaveBeenCalledWith('classId');
        expect(equalTo).toHaveBeenCalledWith('class1');
    });

    it('getLinkedClasses searches by originalCourseId', async () => {
        await getLinkedClasses('orig1');
        expect(orderByChild).toHaveBeenCalledWith('originalCourseId');
        expect(equalTo).toHaveBeenCalledWith('orig1');
    });
});

describe('Expiration Management', () => {
    it('checkCourseExpirations should expire old active enrollments', async () => {
        const now = Date.now();
        const past = now - 10000;
        const mockEnrollments = {
            'e1': { id: 'e1', status: 'active', expiresAt: past },
            'e2': { id: 'e2', status: 'active', expiresAt: now + 99999 }, // Future
            'e3': { id: 'e3', status: 'expired', expiresAt: past } // Already expired
        };

        (get as any).mockResolvedValue({
            exists: () => true,
            val: () => mockEnrollments
        });

        const result = await checkCourseExpirations();
        expect(result.processed).toBe(1); // Only e1 should be processed
        expect(update).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                [`course_enrollments/e1/status`]: 'expired'
            })
        );
    });

    it('sendExpirationWarning should notify teacher', async () => {
        // Mock link
        const mockLinks = { 'l1': { classId: 'c1', courseId: 'copy1' } };
        // Mock class
        const mockClassData = { name: 'Math 101', createdBy: 't1' };

        (query as any).mockReturnValue('query');
        (get as any)
            .mockResolvedValueOnce({ exists: () => true, val: () => mockLinks }); // get Link

        (getClass as any).mockResolvedValue(mockClassData);

        await sendExpirationWarning('c1', 'copy1');

        expect(createTrustedNotification).toHaveBeenCalledWith(expect.objectContaining({
            producerFamily: 'enrollment',
            recipientId: 't1',
            type: 'warning',
            message: expect.stringContaining('Math 101')
        }));
    });

    it('extendCourseDuration should update link and enrollments', async () => {
        const now = Date.now();
        const future = now + 100000;
        const mockLink = {
            id: 'l1',
            expiresAt: future,
            courseId: 'copy1'
        };

        const mockEnrollments = {
            'e1': { id: 'e1', courseId: 'copy1', status: 'active', expiresAt: future }
        };

        (get as any)
            .mockResolvedValueOnce({ exists: () => true, val: () => mockLink }) // get Link
            .mockResolvedValueOnce({ exists: () => true, val: () => mockEnrollments }); // get Enrollments

        const result = await extendCourseDuration('l1', { value: 5, unit: 'days' });

        expect(result.success).toBe(true);
        expect(update).toHaveBeenCalled();
    });
});

describe('syncCourseWithOriginal', () => {
    it('should update course with original metadata', async () => {
        const mockLink = {
            id: 'l1',
            originalCourseId: 'orig1',
            courseId: 'copy1'
        };
        const mockOriginal = {
            id: 'orig1',
            description: 'New Desc',
            type: 'IELTS',
            entranceRequirements: '5.0'
        };
        const mockCopy = {
            id: 'copy1',
            visibility: 'private',
            description: 'Old Desc'
        };

        (get as any).mockResolvedValue({ exists: () => true, val: () => mockLink });
        (getCourse as any)
            .mockResolvedValueOnce(mockOriginal)
            .mockResolvedValueOnce(mockCopy);
        (updateCourse as any).mockResolvedValue({ success: true });

        const result = await syncCourseWithOriginal('l1');

        expect(result.success).toBe(true);
        expect(updateCourse).toHaveBeenCalledWith('copy1', expect.objectContaining({
            description: 'New Desc',
            entranceRequirements: '5.0',
            visibility: 'private'
        }));
    });
});
