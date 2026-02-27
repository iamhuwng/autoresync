import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enrollStudent, addStudent } from './classManager';
import * as enrollmentManager from './enrollmentManager';
import { database } from './firebase';
import { ref, set, get, push, update } from 'firebase/database';

// Mock dependencies
vi.mock('./firebase', () => ({
    database: {}
}));

vi.mock('firebase/database', () => ({
    ref: vi.fn(),
    set: vi.fn(),
    get: vi.fn(),
    push: vi.fn(),
    update: vi.fn(),
    remove: vi.fn()
}));

// Mock enrollmentManager partially or fully
vi.mock('./enrollmentManager', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        autoEnrollStudentInClassCourses: vi.fn().mockResolvedValue({ success: true, count: 0 })
    };
});

describe('Enrollment Inheritance Integration', () => {
    const mockClass = {
        id: 'class-1',
        classCode: 'CLASS123',
        status: 'active',
        students: {},
        moduleProgress: {
            'mod-1': { status: 'available' }
        },
        stats: { totalStudents: 0 }
    };

    beforeEach(() => {
        vi.clearAllMocks();
        (ref as any).mockReturnValue('ref');
        (push as any).mockReturnValue({ key: 'new-id' });
        // Default get mock to return a valid class
        (get as any).mockResolvedValue({
            exists: () => true,
            val: () => mockClass
        });
    });

    it('new student joining class via code should trigger auto-enrollment', async () => {
        const result = await enrollStudent('CLASS123', 'student-1', 'Student Name', 'student@test.com');

        expect(result.success).toBe(true);
        expect(enrollmentManager.autoEnrollStudentInClassCourses).toHaveBeenCalledWith('CLASS123', 'student-1');
    });

    it('new student added manually should trigger auto-enrollment', async () => {
        // addStudent(classId, studentName, studentEmail)
        const result = await addStudent('class-1', 'Student Name', 'student@test.com');

        expect(result.success).toBe(true);
        // studentId is generated internally, so we check for any string
        expect(enrollmentManager.autoEnrollStudentInClassCourses).toHaveBeenCalledWith('class-1', expect.any(String));
    });
});
