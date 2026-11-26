import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTeacherStudentRoster } from './useTeacherStudentRoster';
import type { AssignmentRequest, StudentTeacherAssignment } from '../../types/assignment.types';
import type { TeacherClassWithMembers } from '../../services/classManager';
import type { UserProfile } from '../../services/userService';

const mocks = vi.hoisted(() => ({
    getAssignmentsByTeacher: vi.fn(),
    getAssignmentRequestsByTeacher: vi.fn(),
    getTeacherClassesWithMembers: vi.fn(),
    getUserById: vi.fn(),
}));

vi.mock('../../services/assignmentManager', () => ({
    getAssignmentsByTeacher: mocks.getAssignmentsByTeacher,
    getAssignmentRequestsByTeacher: mocks.getAssignmentRequestsByTeacher,
}));

vi.mock('../../services/classManager', () => ({
    getTeacherClassesWithMembers: mocks.getTeacherClassesWithMembers,
}));

vi.mock('../../services/userService', () => ({
    getUserById: mocks.getUserById,
}));

function createDeferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

const studentOne: UserProfile = {
    uid: 'student-1',
    displayName: 'Alice',
    email: 'alice@student.test',
    role: 'student',
    status: 'active',
    createdAt: 100,
};

const assignmentOne: StudentTeacherAssignment = {
    id: 'assign-1',
    studentId: 'student-1',
    teacherId: 'teacher-1',
    assignedBy: 'admin-1',
    assignedAt: 1000,
    unassignedAt: null,
    status: 'active',
    coursesEnrolled: [],
};

const classOne: TeacherClassWithMembers = {
    id: 'class-1',
    classCode: 'CLS1',
    name: 'Morning Class',
    status: 'active',
    createdAt: 500,
    studentCount: 1,
    activeAssignments: 0,
    completedAssignments: 0,
    studentIds: ['student-1'],
};

const requestOne: AssignmentRequest = {
    id: 'req-1',
    teacherId: 'teacher-1',
    studentEmail: 'pending@student.test',
    requestedAt: 1000,
    status: 'pending',
};

describe('useTeacherStudentRoster', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'error').mockImplementation(() => {});
        mocks.getAssignmentsByTeacher.mockResolvedValue([assignmentOne]);
        mocks.getUserById.mockResolvedValue(studentOne);
        mocks.getTeacherClassesWithMembers.mockResolvedValue([classOne]);
        mocks.getAssignmentRequestsByTeacher.mockResolvedValue([requestOne]);
    });

    it('surfaces load errors and retains previous data when subsequent refreshes fail', async () => {
        const { result } = renderHook(() => useTeacherStudentRoster('teacher-1'));

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
            expect(result.current.students).toHaveLength(1);
            expect(result.current.classes).toHaveLength(1);
            expect(result.current.requests).toHaveLength(1);
        });

        mocks.getAssignmentsByTeacher.mockRejectedValueOnce(new Error('DB offline'));
        mocks.getTeacherClassesWithMembers.mockRejectedValueOnce(new Error('Classes offline'));
        mocks.getAssignmentRequestsByTeacher.mockRejectedValueOnce(new Error('Requests offline'));

        await act(async () => {
            await result.current.reload();
        });

        expect(result.current.error).toContain('Could not load your students');
        expect(result.current.classesError).toContain('Could not load your classes');
        expect(result.current.requestsError).toContain('Could not load your student requests');

        // Existing data must be preserved rather than wiped to empty lists.
        expect(result.current.students).toHaveLength(1);
        expect(result.current.classes).toHaveLength(1);
        expect(result.current.requests).toHaveLength(1);

        // Individual retries clear their slice errors on recovery.
        mocks.getTeacherClassesWithMembers.mockResolvedValueOnce([classOne]);
        mocks.getAssignmentRequestsByTeacher.mockResolvedValueOnce([requestOne]);

        await act(async () => {
            await result.current.reloadClasses();
            await result.current.reloadRequests();
        });

        expect(result.current.classesError).toBeNull();
        expect(result.current.requestsError).toBeNull();
    });

    it('ignores stale reloadClasses and reloadRequests responses when a newer refresh finishes first', async () => {
        const { result } = renderHook(() => useTeacherStudentRoster('teacher-1'));

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        const staleClasses = createDeferred<TeacherClassWithMembers[]>();
        const freshClasses = createDeferred<TeacherClassWithMembers[]>();
        const staleRequests = createDeferred<AssignmentRequest[]>();
        const freshRequests = createDeferred<AssignmentRequest[]>();

        mocks.getTeacherClassesWithMembers
            .mockReturnValueOnce(staleClasses.promise)
            .mockReturnValueOnce(freshClasses.promise);
        mocks.getAssignmentRequestsByTeacher
            .mockReturnValueOnce(staleRequests.promise)
            .mockReturnValueOnce(freshRequests.promise);

        let p1!: Promise<void>;
        let p2!: Promise<void>;
        let r1!: Promise<void>;
        let r2!: Promise<void>;

        act(() => {
            p1 = result.current.reloadClasses();
            p2 = result.current.reloadClasses();
            r1 = result.current.reloadRequests();
            r2 = result.current.reloadRequests();
        });

        await act(async () => {
            freshClasses.resolve([{ ...classOne, id: 'class-fresh', name: 'Fresh Class' }]);
            freshRequests.resolve([{ ...requestOne, id: 'req-fresh', studentEmail: 'fresh@test.com' }]);
            await Promise.all([p2, r2]);
        });

        await act(async () => {
            staleClasses.resolve([{ ...classOne, id: 'class-stale', name: 'Stale Class' }]);
            staleRequests.resolve([{ ...requestOne, id: 'req-stale', studentEmail: 'stale@test.com' }]);
            await Promise.all([p1, r1]);
        });

        expect(result.current.classes.map((c) => c.id)).toEqual(['class-fresh']);
        expect(result.current.requests.map((r) => r.id)).toEqual(['req-fresh']);
    });

    it('invalidates in-flight auxiliary refreshes when the signed-in teacher changes', async () => {
        const teacher1Classes = createDeferred<TeacherClassWithMembers[]>();
        const teacher1Requests = createDeferred<AssignmentRequest[]>();
        const teacher2Classes = createDeferred<TeacherClassWithMembers[]>();
        const teacher2Requests = createDeferred<AssignmentRequest[]>();

        mocks.getTeacherClassesWithMembers
            .mockReturnValueOnce(teacher1Classes.promise)
            .mockReturnValueOnce(teacher2Classes.promise);
        mocks.getAssignmentRequestsByTeacher
            .mockReturnValueOnce(teacher1Requests.promise)
            .mockReturnValueOnce(teacher2Requests.promise);

        const { result, rerender } = renderHook(
            ({ tid }: { tid: string | null }) => useTeacherStudentRoster(tid),
            { initialProps: { tid: 'teacher-1' as string | null } }
        );

        rerender({ tid: 'teacher-2' });

        await act(async () => {
            teacher2Classes.resolve([{ ...classOne, id: 'teacher-2-class', name: 'Teacher 2 Class' }]);
            teacher2Requests.resolve([{ ...requestOne, id: 'teacher-2-req', teacherId: 'teacher-2' }]);
        });

        await act(async () => {
            teacher1Classes.resolve([{ ...classOne, id: 'teacher-1-class', name: 'Teacher 1 Class' }]);
            teacher1Requests.resolve([{ ...requestOne, id: 'teacher-1-req', teacherId: 'teacher-1' }]);
        });

        await waitFor(() => {
            expect(result.current.classes.map((c) => c.id)).toEqual(['teacher-2-class']);
            expect(result.current.requests.map((r) => r.id)).toEqual(['teacher-2-req']);
        });
    });
});
